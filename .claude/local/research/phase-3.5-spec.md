# Phase 3.5 Implementation Specification

**Phase:** 3.5 — minThreshold Activation, Time-Unit Labels, and Naming Corrections
**Status:** Ready for Implementation
**Date:** 2026-03-02
**Target:** Pre-demo, Funding the Commons, mid-March 2026
**Depends on:** Phase 3 complete on worktree `.worktrees/phase3-interactive`
**Audit basis:** `.claude/local/research/stocks-and-flows-audit.md`
**Worktree root:** `/home/ygg/Workspace/sandbox/tbff/tbff2/.worktrees/phase3-interactive`

Scope: Activate the three-zone threshold model by making `minThreshold` a functional
overflow gate. Propagate both thresholds through the full stack. Add `/mo` to all
threshold displays. Rename `cumulativeFlowThrough` (a stock named like a flow) to
`cumulativeOverflow`. The core math equation is not changed.

---

## Patterns and Conventions

| Pattern | Location | Notes |
|---------|----------|-------|
| Parallel storage arrays | `TBFFNetwork.sol:26-29` | `nodes[]`, `thresholds[]` are parallel. New `minThresholds[]` follows same pattern. |
| WAD constants | `TBFFNetwork.sol:52-54` | `MIN_THRESHOLD = 1_000*WAD`, `MAX_THRESHOLD = 50_000*WAD`. New constants follow same naming. |
| Custom errors | `TBFFNetwork.sol:77-85` | `ThresholdOutOfBounds`, `InvalidWeights`. New errors: `MinThresholdExceedsMax`, `MinThresholdOutOfBounds`. |
| Self-service hooks | `useSetMyThreshold.ts:1-40` | Minimal hook pattern: `useWriteContract` + `useWaitForTransactionReceipt`. |
| Hardcoded minThreshold | `chain-bridge.ts:120,149`, `live/page.tsx:154` | `minThreshold: 3000` hardcoded in 3 places. All replaced with on-chain data. |
| selfRegister ABI | `TBFFNetwork.ts:163-171` | Currently 4 args. Gains `minThreshold` as second arg. |
| Misleading name | `TBFFNetwork.sol:50`, `TBFFNetwork.ts:147` | `cumulativeFlowThrough` is a stock accumulator. Rename to `cumulativeOverflow`. |
| minThreshold unused | `engine.ts:24` | Comment says "display only in Phase 1". Gate added in Phase 3.5. |
| Three-zone logic absent | `engine.ts:112-114` | Phase 1 of `iterateOnce` uses only maxThreshold. minThreshold gate added here. |

---

## Architecture Decision

The minThreshold gate is a **pre-filter on overflow computation**, placed in:
- `TBFFNetwork.sol:_applyRedistribution()` (on-chain)
- `engine.ts:iterateOnce()` Phase 1 (simulator)

`TBFFMath.sol` is NOT changed. The math library remains a pure, policy-free tool.

Gate semantics: `overflow = (balance >= minThreshold) ? computeOverflow(balance, maxThreshold) : 0`

A node below its income floor passes nothing through. It receives inflows normally.
At exactly `minThreshold` the gate opens, but since `minThreshold < maxThreshold`
by invariant, no overflow exists yet at that boundary.

---

## Step 1 — Modify `contracts/src/TBFFNetwork.sol`

### 1.1 Add `minThresholds[]` storage

After line 29 (`uint256[] public thresholds;`):
```solidity
uint256[] public minThresholds; // WAD, parallel to nodes[]. Overflow gated if balance < minThreshold.
```

### 1.2 Add constants

After line 54 (`uint256 public constant SEED_AMOUNT = 100 * 1e18;`):
```solidity
uint256 public constant MIN_MIN_THRESHOLD = 0;             // minThreshold floor (0 = no gating)
uint256 public constant MAX_MIN_THRESHOLD = 20_000 * 1e18; // minThreshold ceiling ($20K)
```

### 1.3 Add errors

After `error ThresholdOutOfBounds();`:
```solidity
error MinThresholdExceedsMax();
error MinThresholdOutOfBounds();
```

### 1.4 Add event

After `event MyThresholdSet(address indexed node, uint256 newThreshold);`:
```solidity
event MyMinThresholdSet(address indexed node, uint256 newMinThreshold);
```

### 1.5 Modify `registerNode()`

Replace function at line 111:
```solidity
function registerNode(address node, uint256 maxThreshold, uint256 minThreshold) external onlyOwner {
    if (isNode[node]) revert NodeAlreadyRegistered();
    if (maxThreshold < MIN_THRESHOLD || maxThreshold > MAX_THRESHOLD) revert ThresholdOutOfBounds();
    if (minThreshold > maxThreshold) revert MinThresholdExceedsMax();
    if (minThreshold > MAX_MIN_THRESHOLD) revert MinThresholdOutOfBounds();

    nodeIndex[node] = nodes.length;
    nodes.push(node);
    isNode[node] = true;
    thresholds.push(maxThreshold);
    minThresholds.push(minThreshold);
    _allocOffsets.push(_allocOffsets[_allocOffsets.length - 1]);

    emit NodeRegistered(node, maxThreshold);
}
```

### 1.6 Modify `removeNode()` — maintain parallel array

Inside the swap block after `thresholds[idx] = thresholds[lastIdx];`:
```solidity
minThresholds[idx] = minThresholds[lastIdx];
```
After `thresholds.pop();`:
```solidity
minThresholds.pop();
```

### 1.7 Modify `selfRegister()` — new signature

```solidity
function selfRegister(
    uint256 maxThreshold,
    uint256 minThreshold,
    string calldata name,
    string calldata emoji,
    string calldata role
) external {
    if (isNode[msg.sender]) revert NodeAlreadyRegistered();
    if (maxThreshold < MIN_THRESHOLD || maxThreshold > MAX_THRESHOLD) revert ThresholdOutOfBounds();
    if (minThreshold > maxThreshold) revert MinThresholdExceedsMax();
    if (minThreshold > MAX_MIN_THRESHOLD) revert MinThresholdOutOfBounds();
    if (bytes(name).length == 0 || bytes(name).length > 64) revert StringTooLong();
    if (bytes(emoji).length == 0 || bytes(emoji).length > 8) revert StringTooLong();
    if (bytes(role).length > 128) revert StringTooLong();

    nodeIndex[msg.sender] = nodes.length;
    nodes.push(msg.sender);
    isNode[msg.sender] = true;
    thresholds.push(maxThreshold);
    minThresholds.push(minThreshold);
    _allocOffsets.push(_allocOffsets[_allocOffsets.length - 1]);

    profiles[msg.sender] = Profile({name: name, emoji: emoji, role: role});

    if (SEED_AMOUNT > 0 && token.balanceOf(address(this)) >= SEED_AMOUNT) {
        token.transfer(msg.sender, SEED_AMOUNT);
        emit SeedTransferred(msg.sender, SEED_AMOUNT);
    } else {
        emit SeedFailed(msg.sender);
    }

    emit SelfRegistered(msg.sender, maxThreshold, name);
    emit NodeRegistered(msg.sender, maxThreshold);
}
```

### 1.8 Add `setMyMinThreshold()` — after `setMyThreshold()`

```solidity
function setMyMinThreshold(uint256 newMinThreshold) external {
    if (!isNode[msg.sender]) revert NodeNotRegistered();
    if (newMinThreshold > MAX_MIN_THRESHOLD) revert MinThresholdOutOfBounds();
    uint256 idx = nodeIndex[msg.sender];
    if (newMinThreshold > thresholds[idx]) revert MinThresholdExceedsMax();
    minThresholds[idx] = newMinThreshold;
    emit MyMinThresholdSet(msg.sender, newMinThreshold);
}
```

### 1.9 Add `setMinThresholdFor()` admin — after `setProfileFor()`

```solidity
function setMinThresholdFor(address node, uint256 newMinThreshold) external onlyOwner {
    if (!isNode[node]) revert NodeNotRegistered();
    uint256 idx = nodeIndex[node];
    if (newMinThreshold > thresholds[idx]) revert MinThresholdExceedsMax();
    if (newMinThreshold > MAX_MIN_THRESHOLD) revert MinThresholdOutOfBounds();
    minThresholds[idx] = newMinThreshold;
    emit MyMinThresholdSet(node, newMinThreshold);
}
```

### 1.10 Add `getMinThresholds()` view — after `getNodeCount()`

```solidity
function getMinThresholds() external view returns (address[] memory, uint256[] memory values) {
    uint256 n = nodes.length;
    values = new uint256[](n);
    for (uint256 i; i < n;) {
        values[i] = minThresholds[i];
        unchecked { ++i; }
    }
    return (nodes, values);
}
```

### 1.11 Modify `getNetworkState()` — return 4-tuple

```solidity
function getNetworkState()
    external
    view
    returns (
        address[] memory,
        uint256[] memory balances,
        uint256[] memory maxThresholds,
        uint256[] memory minThresholds_
    )
{
    balances = _balancesFromChain();
    return (nodes, balances, thresholds, minThresholds);
}
```

Note: `minThresholds_` uses trailing underscore to avoid shadowing the storage variable.

### 1.12 Modify `_applyRedistribution()` — gate on minThreshold

Replace the overflow line (approx line 480):
```solidity
// BEFORE:
uint256 overflow = TBFFMath.computeOverflow(currentBalances[i], thresholds[i]);

// AFTER:
uint256 overflow = (currentBalances[i] >= minThresholds[i])
    ? TBFFMath.computeOverflow(currentBalances[i], thresholds[i])
    : 0;
```

This is the single most critical change. A node below its income floor does not
redistribute even if its balance exceeds maxThreshold (which is impossible given
minThreshold < maxThreshold invariant, but the gate is correct regardless).

### 1.13 Rename `cumulativeFlowThrough` → `cumulativeOverflow`

Storage declaration (line 50):
```solidity
mapping(address => uint256) public cumulativeOverflow; // WAD, total overflow routed by this node
```

Inside `_applyRedistribution()`:
```solidity
if (overflow > 0) {
    cumulativeOverflow[nodes[i]] += overflow;
}
```

### 1.14 Rename `getFlowThrough()` → `getOverflowHistory()`, keep alias

```solidity
function getOverflowHistory() external view returns (address[] memory, uint256[] memory amounts) {
    uint256 n = nodes.length;
    amounts = new uint256[](n);
    for (uint256 i; i < n;) {
        amounts[i] = cumulativeOverflow[nodes[i]];
        unchecked { ++i; }
    }
    return (nodes, amounts);
}

/// @dev Deprecated alias. Remove after Phase 4.
function getFlowThrough() external view returns (address[] memory, uint256[] memory) {
    return getOverflowHistory();
}
```

**Verify:**
```bash
cd /home/ygg/Workspace/sandbox/tbff/tbff2/.worktrees/phase3-interactive/contracts
~/.foundry/bin/forge build   # 0 errors expected
```

---

## Step 2 — Modify `contracts/script/DeployLocal.s.sol`

After line 15 (`uint256 internal constant THRESHOLD = 8000 * WAD;`):
```solidity
uint256 internal constant MIN_THRESHOLD_LOCAL = 3000 * WAD;
```

Update the 5 `registerNode()` calls (lines 44-48):
```solidity
network.registerNode(shawn,     THRESHOLD, MIN_THRESHOLD_LOCAL);
network.registerNode(jeff,      THRESHOLD, MIN_THRESHOLD_LOCAL);
network.registerNode(darren,    THRESHOLD, MIN_THRESHOLD_LOCAL);
network.registerNode(simon,     THRESHOLD, MIN_THRESHOLD_LOCAL);
network.registerNode(christina, THRESHOLD, MIN_THRESHOLD_LOCAL);
```

---

## Step 3 — Modify `contracts/script/Deploy.s.sol`

Update the 5 `registerNode()` calls with `3000 * WAD` as third argument. Search for
`registerNode(` in the file and add `, 3000 * WAD` before each closing paren.

---

## Step 4 — Modify `contracts/test/unit/TBFFNetworkUnit.t.sol`

### 4.1 Add constant (after line 26)

```solidity
uint256 public constant MIN_THRESHOLD_VAL = 3000 * WAD;
```

### 4.2 Update `_registerAll()` (line 37)

```solidity
function _registerAll() internal {
    network.registerNode(shawn,     THRESHOLD, MIN_THRESHOLD_VAL);
    network.registerNode(jeff,      THRESHOLD, MIN_THRESHOLD_VAL);
    network.registerNode(darren,    THRESHOLD, MIN_THRESHOLD_VAL);
    network.registerNode(simon,     THRESHOLD, MIN_THRESHOLD_VAL);
    network.registerNode(christina, THRESHOLD, MIN_THRESHOLD_VAL);
}
```

### 4.3 Update standalone `registerNode()` calls

- `test_registerNode()` (line 121): add `MIN_THRESHOLD_VAL` third arg; add assertion
  `assertEq(network.minThresholds(0), MIN_THRESHOLD_VAL);`
- `test_registerNode_revertsDuplicate()` (line 137): both calls gain `MIN_THRESHOLD_VAL`
- `testFuzz_conservation()` (line 302): all 3 `registerNode` calls gain `MIN_THRESHOLD_VAL`

### 4.4 Update all `selfRegister()` calls

New signature: `selfRegister(maxThreshold, minThreshold, name, emoji, role)`.
For tests that do not test minThreshold behavior, use `0` as the second argument.

Affected tests and their new calls:
- `test_selfRegister()` (line 364): `network.selfRegister(5000 * WAD, 2000 * WAD, "Alice", unicode"🌿", "Developer")`
- `test_selfRegister_duplicateReverts()` (line 392): `network.selfRegister(5000 * WAD, 0, "Alice", ...)`
- `test_selfRegister_thresholdBounds()` (line 401): both calls use `0` for minThreshold
- `test_selfRegister_stringLength()` (line 413): both calls use `0` for minThreshold
- `test_setMyAllocations_succeeds()` (line 425): three `selfRegister` calls use `0`
- `test_setMyAllocations_notRegistered()` (line 452): unchanged (no selfRegister call)
- `test_setMyAllocations_selfAlloc()` (line 461): both calls use `0`
- `test_setMyThreshold_succeeds()` (line 478): use `0`
- `test_setMyProfile_succeeds()` (line 488): use `0`
- `testFuzz_selfRegister_threshold()` (line 576): update both branches to pass `0` as minThreshold

### 4.5 Update `test_getNetworkState()` (line 346)

```solidity
(address[] memory retNodes, uint256[] memory balances, uint256[] memory thresh, uint256[] memory minThresh)
    = network.getNetworkState();

assertEq(retNodes.length, 5);
assertEq(retNodes[0], shawn);
assertEq(balances[0], 6000 * WAD);
assertEq(balances[4], 10000 * WAD);
assertEq(thresh[0], THRESHOLD);
assertEq(minThresh[0], MIN_THRESHOLD_VAL);
```

### 4.6 Update `test_flowThrough_accumulates()` (line 527)

```solidity
assertEq(network.cumulativeOverflow(christina), 2000 * WAD);
assertEq(network.cumulativeOverflow(shawn), 0);
```

### 4.7 Add new tests — append before final `}`

```solidity
// ─── Phase 3.5: minThreshold Gating ────────────────────────

function test_minThreshold_gatesOverflow_belowMin() public {
    network.registerNode(shawn, THRESHOLD, MIN_THRESHOLD_VAL);
    network.registerNode(jeff,  THRESHOLD, MIN_THRESHOLD_VAL);

    uint256[] memory t = new uint256[](1);
    uint96[]  memory w = new uint96[](1);
    t[0] = 1; w[0] = uint96(WAD);
    network.setAllocations(shawn, t, w);

    // Shawn at $1K (below minThreshold $3K) — gate closed
    token.setBalance(shawn, 1000 * WAD);
    token.setBalance(jeff,  5000 * WAD);

    network.settle();

    assertEq(network.cumulativeOverflow(shawn), 0);
    int96 rate = forwarder.getFlowrate(address(token), shawn, jeff);
    assertEq(rate, 0, "No stream from node below minThreshold");
}

function test_minThreshold_zeroAllowsOverflow() public {
    network.registerNode(shawn, THRESHOLD, 0); // minThreshold = 0, gate always open
    network.registerNode(jeff,  THRESHOLD, 0);

    uint256[] memory t = new uint256[](1);
    uint96[]  memory w = new uint96[](1);
    t[0] = 1; w[0] = uint96(WAD);
    network.setAllocations(shawn, t, w);

    token.setBalance(shawn, 10000 * WAD); // above maxThreshold
    token.setBalance(jeff,  5000 * WAD);

    network.settle();

    assertEq(network.cumulativeOverflow(shawn), 2000 * WAD);
    int96 rate = forwarder.getFlowrate(address(token), shawn, jeff);
    assertGt(rate, 0, "Stream expected when minThreshold = 0");
}

function test_minThreshold_aboveBoth_overflowsNormally() public {
    _registerAll();
    _setMockDataAllocations();

    // Christina at 10K > minThreshold(3K), above maxThreshold(8K) → overflows
    _setBalances(6000 * WAD, 5000 * WAD, 4000 * WAD, 7000 * WAD, 10000 * WAD);

    network.settle();
    assertGt(network.cumulativeOverflow(christina), 0);
    assertEq(network.cumulativeOverflow(shawn), 0);
}

function test_minThreshold_exceedsMax_reverts() public {
    vm.expectRevert(TBFFNetwork.MinThresholdExceedsMax.selector);
    network.registerNode(shawn, 5000 * WAD, 6000 * WAD);
}

function test_setMyMinThreshold_succeeds() public {
    vm.prank(alice);
    network.selfRegister(8000 * WAD, 3000 * WAD, "Alice", unicode"🌿", "Dev");

    assertEq(network.minThresholds(0), 3000 * WAD);

    vm.prank(alice);
    network.setMyMinThreshold(4000 * WAD);

    assertEq(network.minThresholds(0), 4000 * WAD);
}

function test_setMyMinThreshold_exceedsMaxThreshold_reverts() public {
    vm.prank(alice);
    network.selfRegister(8000 * WAD, 0, "Alice", unicode"🌿", "Dev");

    vm.prank(alice);
    vm.expectRevert(TBFFNetwork.MinThresholdExceedsMax.selector);
    network.setMyMinThreshold(9000 * WAD); // alice maxThreshold = 8000
}

function test_removeNode_maintainsMinThresholds() public {
    _registerAll();
    assertEq(network.minThresholds(0), MIN_THRESHOLD_VAL); // shawn at index 0

    network.removeNode(darren); // darren at index 2; christina(4) swaps to 2
    assertEq(network.getNodeCount(), 4);
    assertEq(network.minThresholds(2), MIN_THRESHOLD_VAL); // christina's value preserved
}

function testFuzz_minThreshold_bounds(uint256 minT, uint256 maxT) public {
    maxT = bound(maxT, 1000 * WAD, 50000 * WAD);

    if (minT > maxT || minT > 20000 * WAD) {
        vm.expectRevert();
        network.registerNode(shawn, maxT, minT);
    } else {
        network.registerNode(shawn, maxT, minT);
        assertEq(network.thresholds(0),    maxT);
        assertEq(network.minThresholds(0), minT);
    }
}
```

**Verify:**
```bash
make test-unit   # count: 17 → ~27, all pass
```

---

## Step 5 — Modify `web/src/lib/tbff/abis/TBFFNetwork.ts`

### 5.1 Update `getNetworkState` output (lines 3-13)

```typescript
{
  type: "function",
  name: "getNetworkState",
  inputs: [],
  outputs: [
    { name: "nodes",         type: "address[]" },
    { name: "balances",      type: "uint256[]" },
    { name: "maxThresholds", type: "uint256[]" },
    { name: "minThresholds", type: "uint256[]" },
  ],
  stateMutability: "view",
},
```

### 5.2 Add `minThresholds` public getter — after `nodeIndex`

```typescript
{
  type: "function",
  name: "minThresholds",
  inputs: [{ name: "", type: "uint256" }],
  outputs: [{ name: "", type: "uint256" }],
  stateMutability: "view",
},
```

### 5.3 Add `getMinThresholds` view — after `getNetworkState`

```typescript
{
  type: "function",
  name: "getMinThresholds",
  inputs: [],
  outputs: [
    { name: "",       type: "address[]" },
    { name: "values", type: "uint256[]" },
  ],
  stateMutability: "view",
},
```

### 5.4 Add new constants — after `SEED_AMOUNT`

```typescript
{
  type: "function",
  name: "MIN_MIN_THRESHOLD",
  inputs: [],
  outputs: [{ name: "", type: "uint256" }],
  stateMutability: "view",
},
{
  type: "function",
  name: "MAX_MIN_THRESHOLD",
  inputs: [],
  outputs: [{ name: "", type: "uint256" }],
  stateMutability: "view",
},
```

### 5.5 Update `selfRegister` inputs (lines 163-171)

```typescript
{
  type: "function",
  name: "selfRegister",
  inputs: [
    { name: "maxThreshold", type: "uint256" },
    { name: "minThreshold", type: "uint256" },
    { name: "name",         type: "string"  },
    { name: "emoji",        type: "string"  },
    { name: "role",         type: "string"  },
  ],
  outputs: [],
  stateMutability: "nonpayable",
},
```

### 5.6 Add `setMyMinThreshold` — after `setMyThreshold`

```typescript
{
  type: "function",
  name: "setMyMinThreshold",
  inputs: [{ name: "newMinThreshold", type: "uint256" }],
  outputs: [],
  stateMutability: "nonpayable",
},
```

### 5.7 Rename `cumulativeFlowThrough` → `cumulativeOverflow`, keep alias

Replace lines 147-151:
```typescript
{
  type: "function",
  name: "cumulativeOverflow",
  inputs: [{ name: "node", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
  stateMutability: "view",
},
// Deprecated alias — remove after Phase 4
{
  type: "function",
  name: "cumulativeFlowThrough",
  inputs: [{ name: "node", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
  stateMutability: "view",
},
```

### 5.8 Rename `getFlowThrough` → `getOverflowHistory`, keep alias

```typescript
{
  type: "function",
  name: "getOverflowHistory",
  inputs: [],
  outputs: [
    { name: "",        type: "address[]" },
    { name: "amounts", type: "uint256[]" },
  ],
  stateMutability: "view",
},
// Deprecated alias — remove after Phase 4
{
  type: "function",
  name: "getFlowThrough",
  inputs: [],
  outputs: [
    { name: "",        type: "address[]" },
    { name: "amounts", type: "uint256[]" },
  ],
  stateMutability: "view",
},
```

### 5.9 Add `MyMinThresholdSet` event — after `MyThresholdSet`

```typescript
{
  type: "event",
  name: "MyMinThresholdSet",
  inputs: [
    { name: "node",            type: "address", indexed: true  },
    { name: "newMinThreshold", type: "uint256", indexed: false },
  ],
},
```

---

## Step 6 — Modify `web/src/lib/tbff/chain-bridge.ts`

### 6.1 Update `bridgeToParticipant()` signature (line 87)

```typescript
export function bridgeToParticipant(
  address: Address,
  balance: bigint,
  maxThreshold: bigint,
  minThreshold: bigint,          // NEW — was hardcoded to 3000
  allNodes: Address[],
  allocTargets?: number[],
  allocWeights?: bigint[]
): Participant {
```

Return object update (lines 114-123):
```typescript
return {
  id: meta.id,
  name: meta.name,
  emoji: meta.emoji,
  role: meta.role,
  balance:      wadToUsd(balance),
  minThreshold: wadToUsd(minThreshold),  // was: 3000
  maxThreshold: wadToUsd(maxThreshold),  // was: wadToUsd(threshold)
  allocations,
};
```

### 6.2 Update `profileToParticipant()` signature (line 130)

```typescript
export function profileToParticipant(
  profile: OnChainProfile,
  balance: bigint,
  maxThreshold: bigint,
  minThreshold: bigint,          // NEW — was hardcoded to 3000
): Participant {
```

Return object update (lines 143-152):
```typescript
return {
  id,
  name,
  emoji,
  role,
  balance:      wadToUsd(balance),
  minThreshold: wadToUsd(minThreshold),  // was: 3000
  maxThreshold: wadToUsd(maxThreshold),
  allocations: [],
};
```

---

## Step 7 — Modify `web/src/lib/tbff/engine.ts`

### 7.1 Update `minThreshold` comment (line 24)

```typescript
minThreshold: number; // income floor; overflow gated if balance < minThreshold (Phase 3.5)
```

### 7.2 Add `ThreeZoneStatus` type and helper — after `Participant` interface

```typescript
export type ThreeZoneStatus = "below-min" | "sustaining" | "overflowing";

export function getThreeZoneStatus(
  balance: number,
  minThreshold: number,
  maxThreshold: number
): ThreeZoneStatus {
  if (balance < minThreshold) return "below-min";
  if (balance <= maxThreshold) return "sustaining";
  return "overflowing";
}
```

### 7.3 Add `zoneStatus` to `IterationSnapshot` interface

```typescript
export interface IterationSnapshot {
  iteration: number;
  balances: Record<string, number>;
  overflows: Record<string, number>;
  transfers: Transfer[];
  changed: boolean;
  zoneStatus: Record<string, ThreeZoneStatus>; // Phase 3.5
}
```

### 7.4 Update `iterateOnce()` Phase 1 (lines 111-115) — gate on minThreshold

```typescript
// Phase 1: Cap all balances AND compute gated overflows
for (const p of participants) {
  newBalances[p.id] = capToThreshold(p.balance, p.maxThreshold);
  overflows[p.id] = p.balance >= p.minThreshold
    ? computeOverflow(p.balance, p.maxThreshold)
    : 0;
}
```

### 7.5 Populate `zoneStatus` in returned snapshot (lines 139-148)

```typescript
const zoneStatus: Record<string, ThreeZoneStatus> = {};
for (const p of participants) {
  zoneStatus[p.id] = getThreeZoneStatus(p.balance, p.minThreshold, p.maxThreshold);
}

return {
  newBalances,
  changed,
  snapshot: {
    iteration: iterationNum,
    balances: { ...newBalances },
    overflows: { ...overflows },
    transfers,
    changed,
    zoneStatus,
  },
};
```

---

## Step 8 — Modify `web/src/lib/tbff/mock-data.ts`

No value changes. Update comments only:
```typescript
minThreshold: 3000,   // $3,000/mo — minimum income floor
maxThreshold: 8000,   // $8,000/mo — lifestyle optimum
```
Apply to all 5 participants.

---

## Step 9 — Modify `web/src/lib/hooks/useRegister.ts`

Update `register()` signature (line 28):
```typescript
async function register(
  maxThresholdUsd: number,
  minThresholdUsd: number,
  name: string,
  emoji: string,
  role: string
) {
```

Update `selfRegister` args (line 55):
```typescript
args: [usdToWad(maxThresholdUsd), usdToWad(minThresholdUsd), name, emoji, role],
```

---

## Step 10 — Create `web/src/lib/hooks/useSetMyMinThreshold.ts`

New file, full content:
```typescript
"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { tbffNetworkAbi } from "@/lib/tbff/abis/TBFFNetwork";
import { TBFF_NETWORK_ADDRESS, TARGET_CHAIN_ID } from "@/lib/tbff/live-config";
import { usdToWad } from "@/lib/tbff/chain-bridge";

export function useSetMyMinThreshold() {
  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    error: confirmError,
  } = useWaitForTransactionReceipt({ hash });

  function submit(minThresholdUsd: number) {
    writeContract({
      address: TBFF_NETWORK_ADDRESS,
      abi: tbffNetworkAbi,
      functionName: "setMyMinThreshold",
      args: [usdToWad(minThresholdUsd)],
      chainId: TARGET_CHAIN_ID,
    });
  }

  return { submit, hash, isPending, isConfirming, isSuccess,
           error: writeError ?? confirmError };
}
```

---

## Step 11 — Modify `web/src/components/RegistrationFlow.tsx`

### 11.1 Add `minThreshold` state (after line 47)

```typescript
const [minThreshold, setMinThreshold] = useState(3000);
```

### 11.2 Add `handleMinThresholdInput` handler (after `handleThresholdInput`)

```typescript
function handleMinThresholdInput(value: string) {
  const num = parseInt(value.replace(/[^0-9]/g, ""));
  if (!isNaN(num)) {
    setMinThreshold(Math.max(0, Math.min(threshold - 1000, num)));
  }
}
```

### 11.3 Update `handleSubmit()`

```typescript
async function handleSubmit() {
  await register(threshold, minThreshold, name.trim(), emoji, role.trim() || "Participant");
  setTimeout(() => { setOpen(false); reset(); }, 2000);
}
```

### 11.4 Update `canSubmit`

```typescript
const canSubmit = name.trim().length > 0 && !isSubmitting && minThreshold < threshold;
```

### 11.5 Replace the single threshold block (lines 138-167) with two sliders

```tsx
{/* Min Threshold */}
<div className="space-y-2">
  <label className="text-xs font-medium text-muted-foreground">
    Minimum income needed
  </label>
  <div className="flex items-center gap-3">
    <Slider
      value={[minThreshold]}
      min={0}
      max={Math.max(0, threshold - 1000)}
      step={500}
      onValueChange={([v]) => setMinThreshold(v)}
      disabled={isSubmitting}
      className="flex-1"
    />
    <div className="flex items-center gap-1">
      <span className="text-sm text-muted-foreground">$</span>
      <Input
        type="text"
        value={minThreshold.toLocaleString()}
        onChange={(e) => handleMinThresholdInput(e.target.value)}
        disabled={isSubmitting}
        className="h-8 w-20 text-xs text-right font-mono text-foreground"
      />
      <span className="text-xs text-muted-foreground">/mo</span>
    </div>
  </div>
  <p className="text-[10px] text-muted-foreground">
    Below this rate, your overflow stays with you while you build up.
  </p>
</div>

{/* Max Threshold */}
<div className="space-y-2">
  <label className="text-xs font-medium text-muted-foreground">
    Lifestyle optimum
  </label>
  <div className="flex items-center gap-3">
    <Slider
      value={[threshold]}
      min={Math.max(1000, minThreshold + 1000)}
      max={50000}
      step={1000}
      onValueChange={([v]) => setThreshold(Math.max(v, minThreshold + 1000))}
      disabled={isSubmitting}
      className="flex-1"
    />
    <div className="flex items-center gap-1">
      <span className="text-sm text-muted-foreground">$</span>
      <Input
        type="text"
        value={threshold.toLocaleString()}
        onChange={(e) => handleThresholdInput(e.target.value)}
        disabled={isSubmitting}
        className="h-8 w-20 text-xs text-right font-mono text-foreground"
      />
      <span className="text-xs text-muted-foreground">/mo</span>
    </div>
  </div>
  <p className="text-[10px] text-muted-foreground">
    Income above this rate flows to your allocations. $1,000–$50,000/mo
  </p>
</div>

{/* Three-zone helper */}
<div className="text-[10px] text-muted-foreground bg-muted/40 rounded p-2 space-y-0.5">
  <p className="font-medium text-foreground/60">Three-zone model</p>
  <p>
    Below ${minThreshold.toLocaleString()}/mo —{" "}
    <span className="text-yellow-500">building up, no redistribution</span>
  </p>
  <p>
    ${minThreshold.toLocaleString()}–${threshold.toLocaleString()}/mo —{" "}
    <span className="text-green-500">sustaining, retaining all income</span>
  </p>
  <p>
    Above ${threshold.toLocaleString()}/mo —{" "}
    <span className="text-red-400">overflowing, routing excess to allocations</span>
  </p>
</div>
```

---

## Step 12 — Modify `web/src/components/AllocationEditor.tsx`

### 12.1 Collapsed view (line 88) — replace `Min: $X` with zone badge

```tsx
<span className={
  participant.balance < participant.minThreshold
    ? "text-yellow-400"
    : participant.balance > participant.maxThreshold
    ? "text-red-400"
    : "text-green-400"
}>
  {participant.balance < participant.minThreshold
    ? "Building"
    : participant.balance > participant.maxThreshold
    ? "Overflowing"
    : "Sustaining"}
</span>
{" | "}Allocations:{" "}
```

### 12.2 Expanded view header (line 113) — add `/mo`

```tsx
<span className="text-xs text-muted-foreground">
  Min: ${participant.minThreshold.toLocaleString()}/mo
  {" · "}
  Max: ${participant.maxThreshold.toLocaleString()}/mo
</span>
```

---

## Step 13 — Rename `FlowThroughDisplay.tsx` → `OverflowHistoryDisplay.tsx`

**New file path:** `web/src/components/OverflowHistoryDisplay.tsx`

Full content:
```typescript
"use client";

interface OverflowHistoryDisplayProps {
  cumulativeOverflow: number;   // total WAD-converted USD that overflowed through this node
  balance: number;
  maxThreshold: number;
}

export default function OverflowHistoryDisplay({
  cumulativeOverflow,
  balance,
  maxThreshold,
}: OverflowHistoryDisplayProps) {
  const retained = Math.min(balance, maxThreshold);

  if (cumulativeOverflow === 0 && balance <= maxThreshold) {
    return (
      <span className="text-xs text-muted-foreground">No overflow yet</span>
    );
  }

  return (
    <span className="text-xs text-muted-foreground font-mono tabular-nums">
      <span title="Cumulative overflow routed through this node">
        ${Math.round(cumulativeOverflow).toLocaleString()} routed
      </span>
      {" | "}
      <span title="Currently retained (balance capped at max threshold)">
        ${Math.round(retained).toLocaleString()} retained
      </span>
    </span>
  );
}
```

The old `FlowThroughDisplay.tsx` file should be deleted after all import sites are updated.

---

## Step 14 — Modify `web/src/components/NetworkGraph.tsx`

### 14.1 Update `getNodeColor()` (lines 10-14)

```typescript
function getNodeColor(balance: number, minThreshold: number, maxThreshold: number): string {
  if (balance > maxThreshold)          return "#ef4444"; // red: overflowing
  if (balance < minThreshold)          return "#eab308"; // yellow: building up
  if (balance > maxThreshold * 0.8)    return "#f97316"; // orange: approaching max
  return "#22c55e";                                       // green: sustaining
}
```

### 14.2 Update call site (line 104)

```typescript
const color = getNodeColor(bal, p.minThreshold, p.maxThreshold);
```

---

## Step 15 — Modify `web/src/app/live/page.tsx`

### 15.1 Update `NetworkData` interface (lines 29-43)

```typescript
interface NetworkData {
  nodes: string[];
  balances: string[];
  thresholds: string[];         // maxThresholds (WAD-formatted USD)
  minThresholds: string[];      // NEW
  nodeCount: number;
  streams: { from: string; to: string; rate: string }[];
  lastSettle: {
    timestamp: number;
    iterations: number;
    converged: boolean;
    totalRedistributed: string;
  };
  profiles: ProfileInfo[];
  overflowHistory: string[];    // renamed from flowThrough
  flowThrough: string[];        // deprecated alias, keep for transition
}
```

### 15.2 Fix hardcoded `minThreshold: 3000` (line 154)

```typescript
const minThresh = Number(data.minThresholds?.[i] ?? 0);
participants.push({
  id: meta.id,
  name: meta.name,
  emoji: meta.emoji,
  role: meta.role,
  balance: bal,
  minThreshold: minThresh,          // was: 3000
  maxThreshold: thresh,
  allocations: [],
});
```

### 15.3 Update import (top of file)

```typescript
import OverflowHistoryDisplay from "@/components/OverflowHistoryDisplay";
// Remove: import FlowThroughDisplay from "@/components/FlowThroughDisplay";
```

### 15.4 Update balance table header row (line 307-312)

```tsx
<tr className="text-left text-xs text-muted-foreground border-b">
  <th className="pb-2">Member</th>
  <th className="pb-2 text-right">Balance</th>
  <th className="pb-2 text-right">Max/mo</th>
  <th className="pb-2 text-right">Min/mo</th>
  <th className="pb-2 text-center">Status</th>
</tr>
```

### 15.5 Update balance table body cells (lines 315-354)

```tsx
{data?.nodes.map((addr, i) => {
  const meta = getNodeMeta(addr, profiles);
  const bal   = Number(data.balances[i]);
  const thresh = Number(data.thresholds[i]);
  const minThresh = Number(data.minThresholds?.[i] ?? 0);
  const flow  = Number(data.overflowHistory?.[i] ?? data.flowThrough?.[i] ?? 0);
  const status =
    bal < minThresh ? "below-min" :
    bal > thresh    ? "overflow"  :
                      "healthy";

  return (
    <tr key={addr} className="border-b border-border/50">
      <td className="py-2">
        <div>
          <span className="mr-1">{meta.emoji}</span>
          {meta.name}
        </div>
        <OverflowHistoryDisplay
          cumulativeOverflow={flow}
          balance={bal}
          maxThreshold={thresh}
        />
      </td>
      <td className="py-2 text-right font-mono tabular-nums">
        ${Math.round(bal).toLocaleString()}
      </td>
      <td className="py-2 text-right text-muted-foreground font-mono text-xs">
        ${Math.round(thresh).toLocaleString()}/mo
      </td>
      <td className="py-2 text-right text-muted-foreground font-mono text-xs">
        ${Math.round(minThresh).toLocaleString()}/mo
      </td>
      <td className="py-2 text-center">
        {status === "overflow" ? (
          <Badge variant="destructive" className="text-[10px]">Overflow</Badge>
        ) : status === "below-min" ? (
          <Badge variant="outline"
            className="text-[10px] border-yellow-500 text-yellow-500">
            Building
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">Sustaining</Badge>
        )}
      </td>
    </tr>
  );
})}
```

---

## Step 16 — Modify `web/src/app/simulator/page.tsx`

### 16.1 Add `handleMinThresholdChange` callback (after `handleThresholdChange` around line 129)

```typescript
const handleMinThresholdChange = useCallback(
  (id: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, minThreshold: num } : p))
    );
    resetSimulationState();
  },
  [resetSimulationState]
);
```

### 16.2 Update configuration panel inputs (lines 200-233)

Change `Max Threshold` label to `Max Threshold/mo` and add a minThreshold input:

```tsx
<div className="grid grid-cols-2 gap-2">
  <div>
    <label className="text-xs text-muted-foreground">Balance</label>
    <Input
      type="number"
      value={snapshots.length === 0 ? p.balance : initialBalancesRef.current[p.id] ?? p.balance}
      onChange={(e) => handleBalanceChange(p.id, e.target.value)}
      className="h-8 text-sm"
      disabled={snapshots.length > 0}
    />
  </div>
  <div>
    <label className="text-xs text-muted-foreground">Max/mo</label>
    <Input
      type="number"
      value={p.maxThreshold}
      onChange={(e) => handleThresholdChange(p.id, e.target.value)}
      className="h-8 text-sm"
      disabled={snapshots.length > 0}
    />
  </div>
</div>
<div>
  <label className="text-xs text-muted-foreground">Min/mo</label>
  <Input
    type="number"
    value={p.minThreshold}
    onChange={(e) => handleMinThresholdChange(p.id, e.target.value)}
    className="h-8 text-sm"
    disabled={snapshots.length > 0}
  />
</div>
```

---

## Step 17 — Modify `web/src/app/api/network/route.ts`

### 17.1 Update `getNetworkState` call and destructuring (lines 24-76)

Replace the destructuring (lines 72-76):
```typescript
const [nodes, balances, maxThresholdsBigint, minThresholdsBigint] = networkState as [
  `0x${string}`[],
  bigint[],
  bigint[],
  bigint[],
];
```

### 17.2 Rename `flowThroughData` → `overflowData` and update function name

In the `Promise.all` block, change the last call:
```typescript
client.readContract({
  address: TBFF_NETWORK_ADDRESS,
  abi: tbffNetworkAbi,
  functionName: "getOverflowHistory",  // was: getFlowThrough
}),
```

Update destructuring:
```typescript
const [, overflowAmounts] = overflowData as [`0x${string}`[], bigint[]];
```

### 17.3 Update JSON response

```typescript
return NextResponse.json({
  nodes,
  balances:        balances.map((b) => formatUnits(b, 18)),
  thresholds:      maxThresholdsBigint.map((t) => formatUnits(t, 18)),
  minThresholds:   minThresholdsBigint.map((t) => formatUnits(t, 18)),
  nodeCount:       Number(nodeCount),
  streams:         froms.map((f, i) => ({ from: f, to: tos[i], rate: rates[i].toString() })),
  lastSettle: {
    timestamp:          Number(timestamp),
    iterations:         Number(iterations),
    converged:          converged as boolean,
    totalRedistributed: formatUnits(redistributed as bigint, 18),
  },
  profiles:        profileAddrs.map((addr, i) => ({
    address: addr, name: profileNames[i], emoji: profileEmojis[i], role: profileRoles[i],
  })),
  overflowHistory: overflowAmounts.map((a) => formatUnits(a, 18)),
  flowThrough:     overflowAmounts.map((a) => formatUnits(a, 18)), // deprecated alias
});
```

---

## Step 18 — Modify `web/src/lib/tbff/__tests__/engine.test.ts`

Add after existing test suite:

```typescript
import { getThreeZoneStatus } from "../engine";

describe("Phase 3.5 — minThreshold gate", () => {
  test("node below minThreshold produces zero overflow", () => {
    const p: Participant[] = [
      { id: "a", name: "A", emoji: "🌿", role: "r",
        balance: 1000, minThreshold: 3000, maxThreshold: 8000,
        allocations: [{ target: "b", weight: 1.0 }] },
      { id: "b", name: "B", emoji: "🔧", role: "r",
        balance: 5000, minThreshold: 3000, maxThreshold: 8000,
        allocations: [] },
    ];
    const { snapshot } = iterateOnce(p, 1);
    expect(snapshot.overflows["a"]).toBe(0);
    expect(snapshot.balances["b"]).toBe(5000); // no inflow from a
  });

  test("node above both thresholds overflows normally", () => {
    const p: Participant[] = [
      { id: "a", name: "A", emoji: "🌿", role: "r",
        balance: 10000, minThreshold: 3000, maxThreshold: 8000,
        allocations: [{ target: "b", weight: 1.0 }] },
      { id: "b", name: "B", emoji: "🔧", role: "r",
        balance: 1000, minThreshold: 0, maxThreshold: 8000,
        allocations: [] },
    ];
    const { snapshot } = iterateOnce(p, 1);
    expect(snapshot.overflows["a"]).toBe(2000);
    expect(snapshot.balances["b"]).toBe(3000);
  });

  test("minThreshold = 0 never gates overflow", () => {
    const p: Participant[] = [
      { id: "a", name: "A", emoji: "🌿", role: "r",
        balance: 9000, minThreshold: 0, maxThreshold: 8000,
        allocations: [{ target: "b", weight: 1.0 }] },
      { id: "b", name: "B", emoji: "🔧", role: "r",
        balance: 0, minThreshold: 0, maxThreshold: 8000,
        allocations: [] },
    ];
    const { snapshot } = iterateOnce(p, 1);
    expect(snapshot.overflows["a"]).toBe(1000);
  });

  test("getThreeZoneStatus returns correct zones", () => {
    expect(getThreeZoneStatus(999,  3000, 8000)).toBe("below-min");
    expect(getThreeZoneStatus(3000, 3000, 8000)).toBe("sustaining"); // at boundary = sustaining
    expect(getThreeZoneStatus(5000, 3000, 8000)).toBe("sustaining");
    expect(getThreeZoneStatus(8000, 3000, 8000)).toBe("sustaining"); // at max = sustaining
    expect(getThreeZoneStatus(8001, 3000, 8000)).toBe("overflowing");
  });

  test("conservation holds with minThreshold gate active", () => {
    const p: Participant[] = [
      { id: "a", name: "A", emoji: "🌿", role: "r",
        balance: 500, minThreshold: 1000, maxThreshold: 5000,
        allocations: [{ target: "b", weight: 1.0 }] },
      { id: "b", name: "B", emoji: "🔧", role: "r",
        balance: 3000, minThreshold: 1000, maxThreshold: 5000,
        allocations: [{ target: "a", weight: 1.0 }] },
    ];
    const result = converge(p);
    const total = Object.values(result.finalBalances).reduce((s, v) => s + v, 0);
    const initial = p.reduce((s, x) => s + x.balance, 0);
    expect(Math.abs(total - initial)).toBeLessThan(0.01);
  });

  test("zoneStatus populated in snapshot", () => {
    const p: Participant[] = [
      { id: "a", name: "A", emoji: "🌿", role: "r",
        balance: 500, minThreshold: 1000, maxThreshold: 5000, allocations: [] },
      { id: "b", name: "B", emoji: "🔧", role: "r",
        balance: 3000, minThreshold: 1000, maxThreshold: 5000, allocations: [] },
      { id: "c", name: "C", emoji: "⚡", role: "r",
        balance: 6000, minThreshold: 1000, maxThreshold: 5000, allocations: [] },
    ];
    const { snapshot } = iterateOnce(p, 1);
    expect(snapshot.zoneStatus["a"]).toBe("below-min");
    expect(snapshot.zoneStatus["b"]).toBe("sustaining");
    expect(snapshot.zoneStatus["c"]).toBe("overflowing");
  });
});
```

---

## Data Flow After Phase 3.5

```
On-chain settle():
  _balancesFromChain() → balances[]
  For each node i:
    if balances[i] >= minThresholds[i]:          ← gate (Phase 3.5)
      overflow = computeOverflow(balances[i], thresholds[i])
      cumulativeOverflow[nodes[i]] += overflow    ← renamed
      set CFA stream rate = overflow * weight / streamEpoch
    else:
      overflow = 0  → no stream changes from this node

API GET /api/network:
  getNetworkState() → (nodes, balances, maxThresholds, minThresholds)
  getOverflowHistory() → (nodes, overflowAmounts)
  JSON: { nodes, balances, thresholds, minThresholds, overflowHistory }

web/live/page.tsx display rules:
  data.balances[i]      → "$X,XXX"       (stock — no time unit)
  data.thresholds[i]    → "$X,XXX/mo"    (maxThreshold flow rate)
  data.minThresholds[i] → "$X,XXX/mo"    (minThreshold flow rate)
  data.overflowHistory  → "$X,XXX routed" (cumulative stock)
  CFA stream rate       → "$X,XXX/mo"    (already correct)
  Status badge          → "Building" | "Sustaining" | "Overflow"

Simulator engine.ts:
  iterateOnce() Phase 1:
    overflows[id] = balance >= minThreshold ? computeOverflow(balance, maxThreshold) : 0
  zoneStatus per node → available to AllocationEditor and future visualizations
```

---

## Files Modified / Created

| # | File | Action | Summary |
|---|------|--------|---------|
| 1 | `contracts/src/TBFFNetwork.sol` | Modify | `minThresholds[]` storage; `registerNode`/`selfRegister`/`removeNode` updates; `setMyMinThreshold`; `setMinThresholdFor`; `getMinThresholds`; `getNetworkState` 4-tuple; `_applyRedistribution` gate; rename `cumulativeFlowThrough`→`cumulativeOverflow`; `getOverflowHistory` |
| 2 | `contracts/script/DeployLocal.s.sol` | Modify | `MIN_THRESHOLD_LOCAL` constant; 5 `registerNode` calls gain third arg |
| 3 | `contracts/script/Deploy.s.sol` | Modify | 5 `registerNode` calls gain `3000 * WAD` third arg |
| 4 | `contracts/test/unit/TBFFNetworkUnit.t.sol` | Modify | `MIN_THRESHOLD_VAL`; `_registerAll` update; all `registerNode`/`selfRegister` call sites; `getNetworkState` destructuring; rename assertions; 8 new tests |
| 5 | `web/src/lib/tbff/abis/TBFFNetwork.ts` | Modify | `getNetworkState` 4-tuple; `minThresholds` getter; `getMinThresholds`; new constants; `selfRegister` signature; `setMyMinThreshold`; rename `cumulativeFlowThrough`/`getFlowThrough` with aliases; `MyMinThresholdSet` event |
| 6 | `web/src/lib/tbff/chain-bridge.ts` | Modify | `bridgeToParticipant` + `profileToParticipant` gain `minThreshold: bigint` param; remove hardcoded `3000` |
| 7 | `web/src/lib/tbff/engine.ts` | Modify | Comment update; `ThreeZoneStatus` type + `getThreeZoneStatus`; `IterationSnapshot` gains `zoneStatus`; `iterateOnce` Phase 1 gate |
| 8 | `web/src/lib/tbff/mock-data.ts` | Modify | Comment annotations only |
| 9 | `web/src/lib/hooks/useRegister.ts` | Modify | `register()` gains `minThresholdUsd`; `selfRegister` args updated |
| 10 | `web/src/lib/hooks/useSetMyMinThreshold.ts` | Create | New hook, mirrors `useSetMyThreshold` |
| 11 | `web/src/components/RegistrationFlow.tsx` | Modify | `minThreshold` state; two sliders with `/mo`; three-zone helper text; updated `canSubmit` |
| 12 | `web/src/components/AllocationEditor.tsx` | Modify | Zone status badge in collapsed view; `/mo` labels in expanded view |
| 13 | `web/src/components/FlowThroughDisplay.tsx` | Rename→Delete | Replaced by `OverflowHistoryDisplay.tsx` |
| 14 | `web/src/components/OverflowHistoryDisplay.tsx` | Create | Renamed component with updated prop names and display text |
| 15 | `web/src/components/NetworkGraph.tsx` | Modify | `getNodeColor` gains `minThreshold` param; yellow zone for "building" |
| 16 | `web/src/app/live/page.tsx` | Modify | `NetworkData` interface; `minThresholds` column; `/mo` labels; hardcoded `3000` removed; `OverflowHistoryDisplay`; three-zone badges |
| 17 | `web/src/app/simulator/page.tsx` | Modify | `handleMinThresholdChange`; minThreshold input per participant; `Max/mo` label |
| 18 | `web/src/app/api/network/route.ts` | Modify | `getNetworkState` 4-tuple destructuring; `getOverflowHistory` call; `minThresholds` in response |
| 19 | `web/src/lib/tbff/__tests__/engine.test.ts` | Modify | 6 new minThreshold gate tests |

---

## Critical Implementation Details

**Storage slot ordering.** `minThresholds[]` is appended after `thresholds[]` in
`TBFFNetwork.sol`. For Anvil local deployments, slot ordering does not matter since
the contract is redeployed from scratch. For any live deployment (Base Sepolia),
a new deployment is required — not an upgrade. This is acceptable for testnet.

**`removeNode()` parallel array maintenance.** The swap-with-last pattern must
maintain `minThresholds[]` in sync with `nodes[]` and `thresholds[]`. The two new
lines are:
```solidity
minThresholds[idx] = minThresholds[lastIdx]; // inside swap block
// ...
minThresholds.pop(); // after nodes.pop() and thresholds.pop()
```
Omitting either line silently corrupts minThreshold data for the swapped node.

**Gate semantics edge case.** The invariant `minThreshold <= maxThreshold` is enforced
at registration and update time. This means a node with `balance == minThreshold`
passes the gate (`>=`) but has zero overflow (since `minThreshold <= balance <= maxThreshold`).
The gate check and the overflow check are orthogonal; both must pass to produce a
non-zero overflow. No special casing needed.

**`getNetworkState()` 4-tuple downstream impact.** Every call site that destructures
the return value must be updated. Current call sites:
- `web/src/app/api/network/route.ts` (Step 17) — primary consumer
- No direct `useReadContract` calls to `getNetworkState` exist in the codebase

**Conservation with minThreshold gate.** The engine's conservation guarantee holds:
gated nodes produce zero overflow, so their balance stays at `min(balance, maxThreshold)`.
Total value in the network is preserved because nothing is created or destroyed;
the gate only prevents redistribution, not reception.

**`/mo` labeling rule.**
- `balance` = stock (point-in-time) = `$X,XXX` (no `/mo`)
- `maxThreshold` = flow rate (monthly income cap) = `$X,XXX/mo`
- `minThreshold` = flow rate (monthly income floor) = `$X,XXX/mo`
- `cumulativeOverflow` = stock (lifetime accumulation) = `$X,XXX routed` (no `/mo`)
- CFA stream rates = flow = `$X,XXX/mo` (already correct, unchanged)

**Engine mirror pattern.** The minThreshold gate in `engine.ts:iterateOnce()` mirrors
`TBFFNetwork.sol:_applyRedistribution()`. Both use `>=` comparison. The cross-validation
tests in `cross-validation.test.ts` should be checked to ensure a minThreshold gate
scenario is represented. If the test currently only runs scenarios with all balances
above minThreshold, add one test case where a node has `balance < minThreshold` and
verify both TypeScript and Solidity produce zero overflow for that node.

---

## Build and Verification Sequence

```
Phase 3.5 Checklist

Contracts:
[ ] 1.1–1.14  Edit TBFFNetwork.sol
[ ] forge build                          # 0 errors
[ ] 2         Edit DeployLocal.s.sol
[ ] 3         Edit Deploy.s.sol
[ ] forge build                          # 0 errors
[ ] 4.1–4.7   Edit TBFFNetworkUnit.t.sol
[ ] make test-unit                       # all pass, count ~27

Web:
[ ] 5         Edit TBFFNetwork.ts (ABI)
[ ] 6         Edit chain-bridge.ts
[ ] 7         Edit engine.ts
[ ] 8         Edit mock-data.ts (comments)
[ ] 9         Edit useRegister.ts
[ ] 10        Create useSetMyMinThreshold.ts
[ ] 11        Edit RegistrationFlow.tsx
[ ] 12        Edit AllocationEditor.tsx
[ ] 13        Create OverflowHistoryDisplay.tsx; delete FlowThroughDisplay.tsx
[ ] 14        Edit NetworkGraph.tsx
[ ] 15        Edit live/page.tsx
[ ] 16        Edit simulator/page.tsx
[ ] 17        Edit api/network/route.ts
[ ] 18        Edit engine.test.ts
[ ] npm run test                         # all pass
[ ] npm run build                        # 0 TypeScript errors

Integration:
[ ] make deploy-anvil                    # deploys cleanly, prints addresses
[ ] npm run dev + manual verification:
    [ ] Registration: two sliders with /mo labels visible
    [ ] Three-zone helper text updates as sliders move
    [ ] min < max enforced (canSubmit = false otherwise)
    [ ] Live page: threshold column header shows "Max/mo"
    [ ] Live page: new "Min/mo" column visible
    [ ] Live page: balance column shows no /mo
    [ ] Live page: status badge shows "Building" when balance < minThreshold
    [ ] Live page: status badge shows "Sustaining" when min <= balance <= max
    [ ] Live page: status badge shows "Overflow" when balance > max
    [ ] NetworkGraph: yellow node when balance < minThreshold
    [ ] OverflowHistoryDisplay: shows "X routed | Y retained"
    [ ] Simulator: minThreshold input visible per participant
    [ ] Simulator: node below minThreshold shows zero overflow in DataTable
```

---

*End of Phase 3.5 Specification.*