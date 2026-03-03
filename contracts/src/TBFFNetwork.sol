// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {TBFFMath} from "./libraries/TBFFMath.sol";
import {ISuperToken} from "./interfaces/ISuperToken.sol";
import {ICFAv1Forwarder} from "./interfaces/ICFAv1Forwarder.sol";

/// @title TBFFNetwork
/// @notice On-chain TBFF redistribution controller using Superfluid streams.
/// @dev Single contract manages all participants. Calls TBFFMath.converge()
///      to compute target balances, then creates/updates/deletes CFA streams
///      to move overflow from high-balance nodes to their allocation targets.
contract TBFFNetwork {
    using TBFFMath for *;

    uint256 internal constant WAD = 1e18;

    // ─── Storage ─────────────────────────────────────────────────

    ISuperToken public token;
    ICFAv1Forwarder public forwarder;
    address public owner;

    address[] public nodes;
    mapping(address => uint256) public nodeIndex;
    mapping(address => bool) public isNode;

    uint256[] public thresholds;    // WAD, max threshold parallel to nodes[]
    uint256[] public minThresholds;  // WAD, min threshold parallel to nodes[]. Overflow gated if value < minThreshold.

    // CSR format for allocation graph (mirrors TBFFMath.NetworkState)
    uint256[] internal _allocOffsets;  // length n+1
    uint256[] internal _allocTargets;  // flat target indices
    uint96[] internal _allocWeights;   // flat WAD weights

    // Last settle metadata
    uint256 public lastSettleTimestamp;
    uint256 public lastSettleIterations;
    bool public lastSettleConverged;
    uint256 public lastSettleTotalRedistributed;

    // ─── Phase 3 Storage ────────────────────────────────────────

    struct Profile {
        string name;   // max 64 bytes
        string emoji;  // max 8 bytes
        string role;   // max 128 bytes
    }
    mapping(address => Profile) public profiles;
    mapping(address => uint256) public cumulativeOverflow; // WAD lifetime total overflow routed through node

    // ─── Phase 4 Storage ────────────────────────────────────────
    // TBFF-managed stream rates: tracks what settle() has set so we can
    // distinguish TBFF streams from external income when computing input values.
    // node => target => flowrate (WAD/second) set by last settle()
    mapping(address => mapping(address => int96)) public tbffStreamRates;
    // node => total outbound rate from TBFF streams (sum of all tbffStreamRates[node][*])
    mapping(address => int96) public tbffOutboundRate;
    // node => total inbound rate from TBFF streams (sum of all tbffStreamRates[*][node])
    mapping(address => int96) public tbffInboundRate;

    uint256 public constant MIN_THRESHOLD = 1_000 * 1e18;      // $1K floor for maxThreshold
    uint256 public constant MAX_THRESHOLD = 50_000 * 1e18;     // $50K ceiling for maxThreshold
    uint256 public constant MAX_MIN_THRESHOLD = 20_000 * 1e18; // $20K ceiling for minThreshold
    uint256 public constant SEED_AMOUNT = 100 * 1e18;          // $100 seed

    // ─── Events ──────────────────────────────────────────────────

    event NodeRegistered(address indexed node, uint256 maxThreshold);
    event NodeRemoved(address indexed node);
    event AllocationsSet(address indexed fromNode);
    event Settled(uint256 iterations, bool converged, uint256 totalRedistributed);
    event StreamCreated(address indexed from, address indexed to, int96 flowrate);
    event StreamUpdated(address indexed from, address indexed to, int96 newRate);
    event StreamDeleted(address indexed from, address indexed to);
    event StreamError(address indexed from, address indexed to, bytes reason);
    event SelfRegistered(address indexed node, uint256 maxThreshold, string name);
    event ProfileUpdated(address indexed node);
    event MyAllocationsSet(address indexed node);
    event MyThresholdSet(address indexed node, uint256 newMaxThreshold, uint256 newMinThreshold);
    event Rained(address indexed from, uint256 amount, uint256 perNode);
    event SeedTransferred(address indexed to, uint256 amount);
    event SeedFailed(address indexed to);

    // ─── Errors ──────────────────────────────────────────────────

    error OnlyOwner();
    error NodeAlreadyRegistered();
    error NodeNotRegistered();
    error InvalidWeights();
    error InvalidTargets();
    error ThresholdOutOfBounds();
    error MinThresholdOutOfBounds();
    error MinThresholdExceedsMax();
    error StringTooLong();
    error ZeroNodes();
    error SelfAllocation();

    // ─── Modifiers ───────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────

    constructor(
        address _forwarder,
        address _token
    ) {
        owner = msg.sender;
        forwarder = ICFAv1Forwarder(_forwarder);
        token = ISuperToken(_token);

        // Initialize CSR with empty offset array (0 nodes → [0])
        _allocOffsets.push(0);
    }

    // ─── Admin Functions ─────────────────────────────────────────

    function registerNode(address node, uint256 maxThreshold, uint256 minThreshold) external onlyOwner {
        if (isNode[node]) revert NodeAlreadyRegistered();
        if (minThreshold > maxThreshold) revert MinThresholdExceedsMax();

        nodeIndex[node] = nodes.length;
        nodes.push(node);
        isNode[node] = true;
        thresholds.push(maxThreshold);
        minThresholds.push(minThreshold);

        // Extend CSR: new node has no allocations yet
        _allocOffsets.push(_allocOffsets[_allocOffsets.length - 1]);

        emit NodeRegistered(node, maxThreshold);
    }

    function removeNode(address node) external onlyOwner {
        if (!isNode[node]) revert NodeNotRegistered();

        uint256 idx = nodeIndex[node];
        uint256 lastIdx = nodes.length - 1;

        // Clean up Phase 4 TBFF stream accounting for the removed node
        _clearTBFFAccounting(node);

        if (idx != lastIdx) {
            // Swap with last
            address lastNode = nodes[lastIdx];
            nodes[idx] = lastNode;
            nodeIndex[lastNode] = idx;
            thresholds[idx] = thresholds[lastIdx];
            minThresholds[idx] = minThresholds[lastIdx];
        }

        nodes.pop();
        thresholds.pop();
        minThresholds.pop();
        delete nodeIndex[node];
        delete isNode[node];

        // Rebuild CSR (allocations cleared — must re-set after removal)
        _rebuildEmptyCSR();

        emit NodeRemoved(node);
    }

    function setAllocations(
        address fromNode,
        uint256[] calldata targetIndices,
        uint96[] calldata weights
    ) external onlyOwner {
        if (!isNode[fromNode]) revert NodeNotRegistered();
        if (targetIndices.length != weights.length) revert InvalidTargets();

        // Validate weights sum to WAD
        uint256 weightSum;
        for (uint256 i; i < weights.length;) {
            if (targetIndices[i] >= nodes.length) revert InvalidTargets();
            weightSum += uint256(weights[i]);
            unchecked { ++i; }
        }
        if (weights.length > 0 && weightSum != WAD) revert InvalidWeights();

        uint256 fromIdx = nodeIndex[fromNode];

        // Rebuild CSR arrays with updated allocations for this node
        _rebuildCSR(fromIdx, targetIndices, weights);

        emit AllocationsSet(fromNode);
    }

    function fundReserve(uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
    }

    function setProfileFor(address node, string calldata name, string calldata emoji, string calldata role) external onlyOwner {
        if (!isNode[node]) revert NodeNotRegistered();
        profiles[node] = Profile({name: name, emoji: emoji, role: role});
        emit ProfileUpdated(node);
    }

    // ─── Self-Service Functions ─────────────────────────────────

    function selfRegister(
        uint256 maxThreshold,
        uint256 minThreshold,
        string calldata name,
        string calldata emoji,
        string calldata role
    ) external {
        if (isNode[msg.sender]) revert NodeAlreadyRegistered();
        if (maxThreshold < MIN_THRESHOLD || maxThreshold > MAX_THRESHOLD) revert ThresholdOutOfBounds();
        if (minThreshold > MAX_MIN_THRESHOLD) revert MinThresholdOutOfBounds();
        if (minThreshold > maxThreshold) revert MinThresholdExceedsMax();
        if (bytes(name).length == 0 || bytes(name).length > 64) revert StringTooLong();
        if (bytes(emoji).length == 0 || bytes(emoji).length > 8) revert StringTooLong();
        if (bytes(role).length > 128) revert StringTooLong();

        // Core registration (mirrors registerNode lines)
        nodeIndex[msg.sender] = nodes.length;
        nodes.push(msg.sender);
        isNode[msg.sender] = true;
        thresholds.push(maxThreshold);
        minThresholds.push(minThreshold);
        _allocOffsets.push(_allocOffsets[_allocOffsets.length - 1]); // CSR extension

        profiles[msg.sender] = Profile({name: name, emoji: emoji, role: role});

        // Soft-fail seed
        if (SEED_AMOUNT > 0 && token.balanceOf(address(this)) >= SEED_AMOUNT) {
            token.transfer(msg.sender, SEED_AMOUNT);
            emit SeedTransferred(msg.sender, SEED_AMOUNT);
        } else {
            emit SeedFailed(msg.sender);
        }

        emit SelfRegistered(msg.sender, maxThreshold, name);
        emit NodeRegistered(msg.sender, maxThreshold);
    }

    function setMyAllocations(
        uint256[] calldata targetIndices,
        uint96[] calldata weights
    ) external {
        if (!isNode[msg.sender]) revert NodeNotRegistered();
        if (targetIndices.length != weights.length) revert InvalidTargets();

        uint256 weightSum;
        for (uint256 i; i < weights.length;) {
            if (targetIndices[i] >= nodes.length) revert InvalidTargets();
            if (nodes[targetIndices[i]] == msg.sender) revert SelfAllocation();
            weightSum += uint256(weights[i]);
            unchecked { ++i; }
        }
        if (weights.length > 0 && weightSum != WAD) revert InvalidWeights();

        _rebuildCSR(nodeIndex[msg.sender], targetIndices, weights);

        emit MyAllocationsSet(msg.sender);
    }

    function setMyThreshold(uint256 newMaxThreshold, uint256 newMinThreshold) external {
        if (!isNode[msg.sender]) revert NodeNotRegistered();
        if (newMaxThreshold < MIN_THRESHOLD || newMaxThreshold > MAX_THRESHOLD) revert ThresholdOutOfBounds();
        if (newMinThreshold > MAX_MIN_THRESHOLD) revert MinThresholdOutOfBounds();
        if (newMinThreshold > newMaxThreshold) revert MinThresholdExceedsMax();
        uint256 idx = nodeIndex[msg.sender];
        thresholds[idx] = newMaxThreshold;
        minThresholds[idx] = newMinThreshold;
        emit MyThresholdSet(msg.sender, newMaxThreshold, newMinThreshold);
    }

    function setMyProfile(string calldata name, string calldata emoji, string calldata role) external {
        if (!isNode[msg.sender]) revert NodeNotRegistered();
        if (bytes(name).length == 0 || bytes(name).length > 64) revert StringTooLong();
        if (bytes(emoji).length == 0 || bytes(emoji).length > 8) revert StringTooLong();
        if (bytes(role).length > 128) revert StringTooLong();
        profiles[msg.sender] = Profile({name: name, emoji: emoji, role: role});
        emit ProfileUpdated(msg.sender);
    }

    function rain(uint256 amount) external {
        uint256 n = nodes.length;
        if (n == 0) revert ZeroNodes();
        token.transferFrom(msg.sender, address(this), amount);
        uint256 perNode = amount / n;
        uint256 distributed;
        for (uint256 i; i < n;) {
            uint256 nodeAmount = (i == n - 1) ? (amount - distributed) : perNode;
            token.transfer(nodes[i], nodeAmount);
            distributed += nodeAmount;
            unchecked { ++i; }
        }
        emit Rained(msg.sender, amount, perNode);
    }

    // ─── Core: Settle ────────────────────────────────────────────

    function settle() external {
        uint256 n = nodes.length;
        if (n == 0) return;

        // 1. Read external income rates (flow-based input)
        uint256[] memory values = _valuesFromChain();

        // 2. Build NetworkState
        TBFFMath.NetworkState memory state = _loadNetworkState(values);

        // 3. Run convergence
        (uint256[] memory finalValues, uint256 iterations) = TBFFMath.converge(state, 20);

        // 4. Compute total redistributed
        uint256 totalRedist;
        for (uint256 i; i < n;) {
            if (finalValues[i] > values[i]) {
                totalRedist += finalValues[i] - values[i];
            }
            unchecked { ++i; }
        }

        bool converged = iterations < 20 ||
            _valuesEqual(finalValues, state.values);

        // 5. Apply redistribution via streams
        _applyRedistribution(values, finalValues);

        // 6. Record metadata
        lastSettleTimestamp = block.timestamp;
        lastSettleIterations = iterations;
        lastSettleConverged = converged;
        lastSettleTotalRedistributed = totalRedist;

        emit Settled(iterations, converged, totalRedist);
    }

    // ─── View Functions ──────────────────────────────────────────

    function getNetworkState()
        external
        view
        returns (address[] memory, uint256[] memory, uint256[] memory, uint256[] memory)
    {
        uint256[] memory values = _valuesFromChain();
        return (nodes, values, thresholds, minThresholds);
    }

    function getActiveStreams()
        external
        view
        returns (address[] memory froms, address[] memory tos, int96[] memory rates)
    {
        uint256 n = nodes.length;
        // Count active streams
        uint256 count;
        for (uint256 i; i < n;) {
            uint256 start = _allocOffsets[i];
            uint256 end = _allocOffsets[i + 1];
            for (uint256 j = start; j < end;) {
                int96 rate = forwarder.getFlowrate(address(token), nodes[i], nodes[_allocTargets[j]]);
                if (rate > 0) count++;
                unchecked { ++j; }
            }
            unchecked { ++i; }
        }

        froms = new address[](count);
        tos = new address[](count);
        rates = new int96[](count);

        uint256 idx;
        for (uint256 i; i < n;) {
            uint256 start = _allocOffsets[i];
            uint256 end = _allocOffsets[i + 1];
            for (uint256 j = start; j < end;) {
                int96 rate = forwarder.getFlowrate(address(token), nodes[i], nodes[_allocTargets[j]]);
                if (rate > 0) {
                    froms[idx] = nodes[i];
                    tos[idx] = nodes[_allocTargets[j]];
                    rates[idx] = rate;
                    idx++;
                }
                unchecked { ++j; }
            }
            unchecked { ++i; }
        }
    }

    function getNodeCount() external view returns (uint256) {
        return nodes.length;
    }

    function getAllocations(uint256 nodeIdx)
        external
        view
        returns (uint256[] memory targets, uint96[] memory weights)
    {
        uint256 start = _allocOffsets[nodeIdx];
        uint256 end = _allocOffsets[nodeIdx + 1];
        uint256 len = end - start;

        targets = new uint256[](len);
        weights = new uint96[](len);
        for (uint256 i; i < len;) {
            targets[i] = _allocTargets[start + i];
            weights[i] = _allocWeights[start + i];
            unchecked { ++i; }
        }
    }

    function getProfile(address node) external view returns (string memory, string memory, string memory) {
        Profile storage p = profiles[node];
        return (p.name, p.emoji, p.role);
    }

    function getAllProfiles() external view returns (
        address[] memory addrs,
        string[] memory names,
        string[] memory emojis,
        string[] memory roles
    ) {
        uint256 n = nodes.length;
        addrs = nodes;
        names = new string[](n);
        emojis = new string[](n);
        roles = new string[](n);
        for (uint256 i; i < n;) {
            Profile storage p = profiles[nodes[i]];
            names[i] = p.name;
            emojis[i] = p.emoji;
            roles[i] = p.role;
            unchecked { ++i; }
        }
    }

    function getOverflow() external view returns (address[] memory, uint256[] memory amounts) {
        uint256 n = nodes.length;
        amounts = new uint256[](n);
        for (uint256 i; i < n;) {
            amounts[i] = cumulativeOverflow[nodes[i]];
            unchecked { ++i; }
        }
        return (nodes, amounts);
    }

    // ─── Internal ────────────────────────────────────────────────

    /// @notice Compute a node's external income rate by removing TBFF's own streams.
    /// @dev externalIncome = netFlowRate + tbffOutbound - tbffInbound
    ///      This eliminates the feedback loop where settle() reads rates it just set.
    function _externalIncomeRate(address node) internal view returns (int96) {
        (, int96 netRate,,) = forwarder.getAccountFlowInfo(address(token), node);
        return netRate + tbffOutboundRate[node] - tbffInboundRate[node];
    }

    /// @notice Build the convergence input: external income rates per node.
    /// @dev In flow mode, values are rates (WAD/second), not balances.
    ///      Negative external rates are clamped to zero. This is load-bearing:
    ///      if TBFF accounting drifts (e.g. stream ops revert mid-settle), a node
    ///      could show falsely-negative external income. Clamping prevents cascading
    ///      stream deletions from a transient accounting desync.
    function _valuesFromChain() internal view returns (uint256[] memory values) {
        uint256 n = nodes.length;
        values = new uint256[](n);
        for (uint256 i; i < n;) {
            int96 rate = _externalIncomeRate(nodes[i]);
            values[i] = rate > 0 ? uint256(int256(rate)) : 0;
            unchecked { ++i; }
        }
    }

    function _loadNetworkState(uint256[] memory values)
        internal
        view
        returns (TBFFMath.NetworkState memory)
    {
        uint256 n = nodes.length;

        // Copy CSR arrays from storage to memory
        uint256 allocLen = _allocTargets.length;
        uint256[] memory targets = new uint256[](allocLen);
        uint96[] memory weights = new uint96[](allocLen);
        uint256[] memory offsets = new uint256[](n + 1);

        for (uint256 i; i < allocLen;) {
            targets[i] = _allocTargets[i];
            weights[i] = _allocWeights[i];
            unchecked { ++i; }
        }
        for (uint256 i; i <= n;) {
            offsets[i] = _allocOffsets[i];
            unchecked { ++i; }
        }

        // Copy thresholds
        uint256[] memory thresh = new uint256[](n);
        for (uint256 i; i < n;) {
            thresh[i] = thresholds[i];
            unchecked { ++i; }
        }

        return TBFFMath.NetworkState({
            n: n,
            values: values,
            thresholds: thresh,
            allocTargets: targets,
            allocWeights: weights,
            allocOffsets: offsets
        });
    }

    /// @notice Apply redistribution as Superfluid streams.
    /// @dev Phase 4 design: single-pass overflow. Each node streams its own raw overflow
    ///      to allocation targets. `finalValues` from converge() is intentionally unused —
    ///      multi-hop converged rates are deferred to Phase 5. The convergence still runs
    ///      in settle() to compute `lastSettleConverged` and `totalRedistributed` metrics.
    ///
    ///      minThreshold is a stream gate, not a convergence gate: nodes with income rate
    ///      below minThreshold produce zero overflow regardless of maxThreshold.
    ///      Since minThreshold <= maxThreshold is enforced at registration, this gate
    ///      only activates when value is in the range [0, minThreshold). TBFFMath.converge()
    ///      is unaware of minThreshold — it only sees maxThreshold. This divergence is
    ///      intentional: minThreshold protects small nodes from being drained before they
    ///      accumulate sufficient income.
    ///
    ///      int96 cast safety: overflowShare is bounded by MAX_THRESHOLD (50K WAD = 5e22),
    ///      well within int96 max (~3.96e28). No explicit guard needed at current constants.
    ///
    ///      Stream clobbering: setFlowrateFrom() operates on the total rate between two
    ///      addresses. If a user has manually created a stream on the same (from, to, token)
    ///      triple that TBFF also manages, TBFF will overwrite it. This is a known Superfluid
    ///      limitation — operator permissions share the flowrate namespace.
    function _applyRedistribution(uint256[] memory currentValues, uint256[] memory /* finalValues */) internal {
        uint256 n = nodes.length;

        for (uint256 i; i < n;) {
            // minThreshold gate: only compute overflow if value >= minThreshold
            uint256 overflow;
            if (currentValues[i] >= minThresholds[i]) {
                overflow = TBFFMath.computeOverflow(currentValues[i], thresholds[i]);
            }
            if (overflow > 0) {
                cumulativeOverflow[nodes[i]] += overflow;
            }
            uint256 start = _allocOffsets[i];
            uint256 end = _allocOffsets[i + 1];

            for (uint256 j = start; j < end;) {
                uint256 targetIdx = _allocTargets[j];
                uint96 weight = _allocWeights[j];

                // Flow mode: overflow IS the rate (WAD/second). No epoch division.
                int96 targetRate;
                if (overflow > 0) {
                    uint256 overflowShare = (overflow * uint256(weight)) / WAD;
                    targetRate = int96(int256(overflowShare));
                }

                // Read current on-chain rate
                int96 currentRate = forwarder.getFlowrate(
                    address(token), nodes[i], nodes[targetIdx]
                );

                // State machine: create/update/delete as needed
                if (targetRate > 0 && currentRate == 0) {
                    // Create new stream
                    try forwarder.setFlowrateFrom(
                        address(token), nodes[i], nodes[targetIdx], targetRate
                    ) {
                        _updateTBFFAccounting(nodes[i], nodes[targetIdx], 0, targetRate);
                        emit StreamCreated(nodes[i], nodes[targetIdx], targetRate);
                    } catch (bytes memory reason) {
                        emit StreamError(nodes[i], nodes[targetIdx], reason);
                    }
                } else if (targetRate > 0 && currentRate != targetRate) {
                    // Update existing stream
                    int96 oldTbffRate = tbffStreamRates[nodes[i]][nodes[targetIdx]];
                    try forwarder.setFlowrateFrom(
                        address(token), nodes[i], nodes[targetIdx], targetRate
                    ) {
                        _updateTBFFAccounting(nodes[i], nodes[targetIdx], oldTbffRate, targetRate);
                        emit StreamUpdated(nodes[i], nodes[targetIdx], targetRate);
                    } catch (bytes memory reason) {
                        emit StreamError(nodes[i], nodes[targetIdx], reason);
                    }
                } else if (targetRate == 0 && tbffStreamRates[nodes[i]][nodes[targetIdx]] > 0) {
                    // Delete TBFF-managed stream (only if TBFF previously set it)
                    int96 oldTbffRate = tbffStreamRates[nodes[i]][nodes[targetIdx]];
                    try forwarder.setFlowrateFrom(
                        address(token), nodes[i], nodes[targetIdx], 0
                    ) {
                        _updateTBFFAccounting(nodes[i], nodes[targetIdx], oldTbffRate, 0);
                        emit StreamDeleted(nodes[i], nodes[targetIdx]);
                    } catch (bytes memory reason) {
                        emit StreamError(nodes[i], nodes[targetIdx], reason);
                    }
                }
                // else: no-op (both zero or equal)

                unchecked { ++j; }
            }
            unchecked { ++i; }
        }
    }

    /// @notice Update internal TBFF stream accounting on successful stream operation.
    /// @dev Maintains the invariant: tbffOutboundRate[x] = sum(tbffStreamRates[x][*])
    ///      and tbffInboundRate[y] = sum(tbffStreamRates[*][y]). These are used by
    ///      _externalIncomeRate() to strip TBFF's own streams from the net flow rate,
    ///      preventing the feedback loop where settle() reads rates it just set.
    ///      Called only inside try{} blocks after a successful setFlowrateFrom().
    function _updateTBFFAccounting(address from, address to, int96 oldRate, int96 newRate) internal {
        tbffStreamRates[from][to] = newRate;
        tbffOutboundRate[from] = tbffOutboundRate[from] - oldRate + newRate;
        tbffInboundRate[to] = tbffInboundRate[to] - oldRate + newRate;
    }

    /// @notice Clear all Phase 4 TBFF stream accounting for a node being removed.
    /// @dev Iterates all other nodes to clear bidirectional stream rate entries.
    ///      Must be called BEFORE the swap-and-pop in removeNode() so nodes[] is intact.
    function _clearTBFFAccounting(address node) internal {
        uint256 n = nodes.length;
        for (uint256 i; i < n;) {
            address other = nodes[i];
            if (other != node) {
                // Clear streams FROM other TO node
                int96 rateToNode = tbffStreamRates[other][node];
                if (rateToNode != 0) {
                    tbffOutboundRate[other] -= rateToNode;
                    delete tbffStreamRates[other][node];
                }
                // Clear streams FROM node TO other
                int96 rateFromNode = tbffStreamRates[node][other];
                if (rateFromNode != 0) {
                    tbffInboundRate[other] -= rateFromNode;
                    delete tbffStreamRates[node][other];
                }
            }
            unchecked { ++i; }
        }
        // Clear the removed node's aggregate rates
        delete tbffOutboundRate[node];
        delete tbffInboundRate[node];
    }

    function _valuesEqual(uint256[] memory a, uint256[] memory b) internal pure returns (bool) {
        for (uint256 i; i < a.length;) {
            if (a[i] != b[i]) return false;
            unchecked { ++i; }
        }
        return true;
    }

    function _rebuildEmptyCSR() internal {
        uint256 n = nodes.length;
        delete _allocOffsets;
        delete _allocTargets;
        delete _allocWeights;

        for (uint256 i; i <= n;) {
            _allocOffsets.push(0);
            unchecked { ++i; }
        }
    }

    function _rebuildCSR(
        uint256 fromIdx,
        uint256[] calldata newTargets,
        uint96[] calldata newWeights
    ) internal {
        uint256 n = nodes.length;

        // Build new flat arrays
        uint256[] memory newOffsets = new uint256[](n + 1);
        uint256 totalAllocs;

        // First pass: count allocations per node
        for (uint256 i; i < n;) {
            if (i == fromIdx) {
                totalAllocs += newTargets.length;
            } else {
                totalAllocs += _allocOffsets[i + 1] - _allocOffsets[i];
            }
            unchecked { ++i; }
        }

        uint256[] memory flatTargets = new uint256[](totalAllocs);
        uint96[] memory flatWeights = new uint96[](totalAllocs);
        uint256 pos;

        for (uint256 i; i < n;) {
            newOffsets[i] = pos;
            if (i == fromIdx) {
                for (uint256 j; j < newTargets.length;) {
                    flatTargets[pos] = newTargets[j];
                    flatWeights[pos] = newWeights[j];
                    pos++;
                    unchecked { ++j; }
                }
            } else {
                uint256 start = _allocOffsets[i];
                uint256 end = _allocOffsets[i + 1];
                for (uint256 j = start; j < end;) {
                    flatTargets[pos] = _allocTargets[j];
                    flatWeights[pos] = _allocWeights[j];
                    pos++;
                    unchecked { ++j; }
                }
            }
            unchecked { ++i; }
        }
        newOffsets[n] = pos;

        // Write to storage
        delete _allocOffsets;
        delete _allocTargets;
        delete _allocWeights;

        for (uint256 i; i <= n;) {
            _allocOffsets.push(newOffsets[i]);
            unchecked { ++i; }
        }
        for (uint256 i; i < totalAllocs;) {
            _allocTargets.push(flatTargets[i]);
            _allocWeights.push(flatWeights[i]);
            unchecked { ++i; }
        }
    }
}
