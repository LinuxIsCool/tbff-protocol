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
    uint256 public streamEpoch; // seconds over which overflow is streamed (default 30 days)

    address[] public nodes;
    mapping(address => uint256) public nodeIndex;
    mapping(address => bool) public isNode;

    uint256[] public thresholds; // WAD, parallel to nodes[]

    // CSR format for allocation graph (mirrors TBFFMath.NetworkState)
    uint256[] internal _allocOffsets;  // length n+1
    uint256[] internal _allocTargets;  // flat target indices
    uint96[] internal _allocWeights;   // flat WAD weights

    // Last settle metadata
    uint256 public lastSettleTimestamp;
    uint256 public lastSettleIterations;
    bool public lastSettleConverged;
    uint256 public lastSettleTotalRedistributed;

    // ─── Events ──────────────────────────────────────────────────

    event NodeRegistered(address indexed node, uint256 maxThreshold);
    event NodeRemoved(address indexed node);
    event AllocationsSet(address indexed fromNode);
    event Settled(uint256 iterations, bool converged, uint256 totalRedistributed);
    event StreamCreated(address indexed from, address indexed to, int96 flowrate);
    event StreamUpdated(address indexed from, address indexed to, int96 newRate);
    event StreamDeleted(address indexed from, address indexed to);
    event StreamError(address indexed from, address indexed to, bytes reason);

    // ─── Errors ──────────────────────────────────────────────────

    error OnlyOwner();
    error NodeAlreadyRegistered();
    error NodeNotRegistered();
    error InvalidWeights();
    error InvalidTargets();

    // ─── Modifiers ───────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────

    constructor(
        address _forwarder,
        address _token,
        uint256 _streamEpoch
    ) {
        owner = msg.sender;
        forwarder = ICFAv1Forwarder(_forwarder);
        token = ISuperToken(_token);
        streamEpoch = _streamEpoch;

        // Initialize CSR with empty offset array (0 nodes → [0])
        _allocOffsets.push(0);
    }

    // ─── Admin Functions ─────────────────────────────────────────

    function registerNode(address node, uint256 maxThreshold) external onlyOwner {
        if (isNode[node]) revert NodeAlreadyRegistered();

        nodeIndex[node] = nodes.length;
        nodes.push(node);
        isNode[node] = true;
        thresholds.push(maxThreshold);

        // Extend CSR: new node has no allocations yet
        _allocOffsets.push(_allocOffsets[_allocOffsets.length - 1]);

        emit NodeRegistered(node, maxThreshold);
    }

    function removeNode(address node) external onlyOwner {
        if (!isNode[node]) revert NodeNotRegistered();

        uint256 idx = nodeIndex[node];
        uint256 lastIdx = nodes.length - 1;

        if (idx != lastIdx) {
            // Swap with last
            address lastNode = nodes[lastIdx];
            nodes[idx] = lastNode;
            nodeIndex[lastNode] = idx;
            thresholds[idx] = thresholds[lastIdx];
        }

        nodes.pop();
        thresholds.pop();
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

    function setStreamEpoch(uint256 epochSeconds) external onlyOwner {
        streamEpoch = epochSeconds;
    }

    function fundReserve(uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
    }

    // ─── Core: Settle ────────────────────────────────────────────

    function settle() external {
        uint256 n = nodes.length;
        if (n == 0) return;

        // 1. Read on-chain balances
        uint256[] memory balances = _balancesFromChain();

        // 2. Build NetworkState
        TBFFMath.NetworkState memory state = _loadNetworkState(balances);

        // 3. Run convergence
        (uint256[] memory finalBalances, uint256 iterations) = TBFFMath.converge(state, 20);

        // 4. Compute total redistributed
        uint256 totalRedist;
        for (uint256 i; i < n;) {
            if (finalBalances[i] > balances[i]) {
                totalRedist += finalBalances[i] - balances[i];
            }
            unchecked { ++i; }
        }

        bool converged = iterations < 20 ||
            _balancesEqual(finalBalances, state.balances);

        // 5. Apply redistribution via streams
        _applyRedistribution(balances, finalBalances);

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
        returns (address[] memory, uint256[] memory, uint256[] memory)
    {
        uint256[] memory balances = _balancesFromChain();
        return (nodes, balances, thresholds);
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

    // ─── Internal ────────────────────────────────────────────────

    function _balancesFromChain() internal view returns (uint256[] memory balances) {
        uint256 n = nodes.length;
        balances = new uint256[](n);
        for (uint256 i; i < n;) {
            (int256 availableBalance,,,) = token.realtimeBalanceOfNow(nodes[i]);
            balances[i] = availableBalance > 0 ? uint256(availableBalance) : 0;
            unchecked { ++i; }
        }
    }

    function _loadNetworkState(uint256[] memory balances)
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
            balances: balances,
            thresholds: thresh,
            allocTargets: targets,
            allocWeights: weights,
            allocOffsets: offsets
        });
    }

    function _applyRedistribution(uint256[] memory currentBalances, uint256[] memory /* finalBalances */) internal {
        uint256 n = nodes.length;

        for (uint256 i; i < n;) {
            uint256 overflow = TBFFMath.computeOverflow(currentBalances[i], thresholds[i]);
            uint256 start = _allocOffsets[i];
            uint256 end = _allocOffsets[i + 1];

            for (uint256 j = start; j < end;) {
                uint256 targetIdx = _allocTargets[j];
                uint96 weight = _allocWeights[j];

                // Compute target flow rate: overflow * weight / WAD / streamEpoch
                int96 targetRate;
                if (overflow > 0) {
                    uint256 overflowShare = (overflow * uint256(weight)) / WAD;
                    targetRate = int96(int256(overflowShare / streamEpoch));
                }

                // Read current rate
                int96 currentRate = forwarder.getFlowrate(
                    address(token), nodes[i], nodes[targetIdx]
                );

                // State machine: create/update/delete as needed
                if (targetRate > 0 && currentRate == 0) {
                    // Create new stream
                    try forwarder.setFlowrateFrom(
                        address(token), nodes[i], nodes[targetIdx], targetRate
                    ) {
                        emit StreamCreated(nodes[i], nodes[targetIdx], targetRate);
                    } catch (bytes memory reason) {
                        emit StreamError(nodes[i], nodes[targetIdx], reason);
                    }
                } else if (targetRate > 0 && currentRate != targetRate) {
                    // Update existing stream
                    try forwarder.setFlowrateFrom(
                        address(token), nodes[i], nodes[targetIdx], targetRate
                    ) {
                        emit StreamUpdated(nodes[i], nodes[targetIdx], targetRate);
                    } catch (bytes memory reason) {
                        emit StreamError(nodes[i], nodes[targetIdx], reason);
                    }
                } else if (targetRate == 0 && currentRate > 0) {
                    // Delete stream
                    try forwarder.setFlowrateFrom(
                        address(token), nodes[i], nodes[targetIdx], 0
                    ) {
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

    function _balancesEqual(uint256[] memory a, uint256[] memory b) internal pure returns (bool) {
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
