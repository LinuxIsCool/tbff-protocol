# Phase 4 Implementation Specification

**Phase:** 4 — Flow-Based Convergence
**Status:** Draft
**Date:** 2026-03-02
**Target:** Post-demo iteration (after Funding the Commons)
**Depends on:** Phase 3.5 complete (minThreshold activated, /mo labels, rename done)
**Audit basis:** `.claude/local/research/stocks-and-flows-audit.md`
**Worktree root:** TBD (new worktree from `phase3-interactive` after 3.5 merge)

## Executive Summary

Phase 4 is the deep architectural refactoring that aligns the TBFF implementation with
its intended mental model. The core insight from the stock/flow audit:

> The convergence equation is **dimensionally agnostic** — `x^(k+1) = min(x, t) + P^T · max(0, x - t)` works identically whether `x` represents balances (stocks) or income rates (flows). The algebra doesn't change. Only the **input vectors** and **output interpretation** change.

Currently:
- **Input:** `x = balances[]` (WAD tokens, read from `realtimeBalanceOfNow`)
- **Threshold:** `t = thresholds[]` (WAD tokens, balance caps)
- **Output:** `finalBalances[]` (WAD tokens)
- **Conversion:** `overflowShare / streamEpoch` converts stock overflow to flow rate

After Phase 4:
- **Input:** `x = incomeRates[]` (WAD/second, read from `getAccountFlowInfo`)
- **Threshold:** `t = thresholds[]` (WAD/second, rate caps)
- **Output:** `finalRates[]` (WAD/second) — these ARE the target stream rates directly
- **Conversion:** None needed. Output is already a flow rate.

The `/ streamEpoch` seam at `TBFFNetwork.sol:495` disappears entirely.

---

## Conceptual Model

### The Three Domains

```
┌─────────────────────────────────────────────────────────────┐
│                    FLOW DOMAIN (Phase 4)                     │
│                                                              │
│  Input: incomeRate[i] = net inbound flow to node i (WAD/s)  │
│  Thresholds: minRate, maxRate (WAD/s)                        │
│  Convergence: operates on rate vectors                       │
│  Output: targetRate[i→j] = stream rate to set (WAD/s)        │
│                                                              │
│  ★ No conversion step. Output IS the stream configuration.   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   STOCK DOMAIN (Current)                      │
│                                                              │
│  Input: balance[i] = wallet balance of node i (WAD)          │
│  Thresholds: minBalance, maxBalance (WAD)                    │
│  Convergence: operates on balance vectors                    │
│  Output: finalBalance[i] (WAD) → IGNORED by redistribution   │
│                                                              │
│  ★ Conversion: overflowShare / streamEpoch → WAD/s           │
│  ★ Convergence output is decorative (not used for streams)    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                 DISPLAY DOMAIN (Both phases)                  │
│                                                              │
│  Balances: $X (point-in-time stock, always valid)            │
│  Rates: $X/mo (income, overflow, stream rates)               │
│  Thresholds: $X/mo (min and max are flow rate bounds)        │
│  Lifetime: $X total (cumulative overflow, a stock)           │
└─────────────────────────────────────────────────────────────┘
```

### Why Flow-Based Is Better

1. **Stability:** Balance snapshots drift continuously (Superfluid streams change balance every second). Flow rates are constant between `settle()` calls — no temporal fragility.

2. **Convergence output is directly usable:** In the stock model, `finalBalances` is ignored because you can't "set" a balance — you can only set stream rates. In the flow model, the convergence output IS the stream rate vector.

3. **Multi-hop cascading works:** In the stock model, `_applyRedistribution` uses raw single-pass overflow. In the flow model, `converge()` propagates overflow through the full network graph, and the output rates encode the equilibrium.

4. **No `streamEpoch` constant:** The arbitrary "30 days" conversion factor disappears. Overflow rate goes directly to stream rate.

5. **Conceptual alignment:** Thresholds are income requirements ($/month), not balance caps ($). This matches how participants actually think about their needs.

---

## Scope

### In Scope
- Rewrite `settle()` to read flow rates instead of balances
- Change threshold storage from WAD balance to WAD/second rate
- Modify convergence to operate on rate vectors
- Make convergence output operational (fix the `finalBalances` ignore bug)
- Remove `streamEpoch` from stream rate computation
- Update TypeScript engine to mirror flow-based math
- Update all tests (Solidity and TypeScript)
- Update deploy scripts with rate-based thresholds
- Update simulator and live page for rate-based inputs

### Out of Scope (Phase 5+)
- Live flow-rate visualization (animated Sankey)
- Per-node income rate dashboard
- Historical flow-through analytics
- Flow-weighted network graph edges
- Rate forecasting / what-if simulator

---

## Architecture Decision

### TBFFMath.sol: Keep Pure and Agnostic

**Decision:** TBFFMath.sol functions do NOT change signatures. They remain pure math operating on `uint256` vectors. The interpretation of those vectors (balances vs rates) is the caller's responsibility.

This preserves:
- All existing TBFFMath unit tests (they test algebra, not semantics)
- The engine mirror pattern (TypeScript mirrors Solidity exactly)
- Cross-validation tests (identical numeric outputs)

What changes is what TBFFNetwork.sol *passes into* `TBFFMath.converge()`.

### NetworkState Semantic Reinterpretation

```solidity
// Before (Phase 3):
struct NetworkState {
    uint256 n;
    uint256[] balances;     // WAD tokens (stock)
    uint256[] thresholds;   // WAD tokens (stock, balance cap)
    uint256[] allocTargets;
    uint96[] allocWeights;
    uint256[] allocOffsets;
}

// After (Phase 4):
// Struct is UNCHANGED. Field names become semantic lies, but the math is identical.
// Consider renaming for clarity:
struct NetworkState {
    uint256 n;
    uint256[] values;       // WAD/second (flow rate) — was "balances"
    uint256[] thresholds;   // WAD/second (max rate) — semantic change only
    uint256[] allocTargets;
    uint96[] allocWeights;
    uint256[] allocOffsets;
}
```

**Trade-off:** Renaming `balances` → `values` in the struct is low-risk (internal, no ABI impact) but touches every test and the TypeScript mirror. Alternative: keep name `balances` and document the reinterpretation. **Recommend: rename to `values`** for clarity.

---

## Step 1 — Modify Storage Semantics in `TBFFNetwork.sol`

### 1a. Rename threshold storage and add comments

```solidity
// ─── Storage ─────────────────────────────────────────────────
// ...existing fields...

uint256[] public thresholds;     // WAD/second — max income rate per node
uint256[] public minThresholds;  // WAD/second — min income rate per node (Phase 3.5)
```

Phase 3.5 adds `minThresholds[]` as WAD stocks. Phase 4 changes the *interpretation* of both arrays from WAD stocks to WAD/second rates. The storage type (`uint256`) is the same — only the units change.

### 1b. Update threshold constants

```solidity
// Phase 3 (stock, WAD tokens):
uint256 public constant MIN_THRESHOLD_BOUND = 1_000 * 1e18;  // $1K balance
uint256 public constant MAX_THRESHOLD_BOUND = 50_000 * 1e18; // $50K balance

// Phase 4 (flow, WAD/second):
// $1,000/month = 1000 * 1e18 / (30 * 24 * 3600) ≈ 385802469135802
uint256 public constant SECONDS_PER_MONTH = 30 days;  // 2_592_000
uint256 public constant MIN_THRESHOLD_BOUND = (1_000 * 1e18) / SECONDS_PER_MONTH;
uint256 public constant MAX_THRESHOLD_BOUND = (50_000 * 1e18) / SECONDS_PER_MONTH;
```

### 1c. New helper: Convert monthly USD to WAD/second

For registration UX, users input thresholds in $/month. The contract or frontend converts.

**Option A: Convert on-chain** (simpler UX, slightly more gas)
```solidity
function _monthlyUsdToWadPerSecond(uint256 usdMonthly) internal pure returns (uint256) {
    return (usdMonthly * WAD) / SECONDS_PER_MONTH;
    // Note: usdMonthly here is a raw number like 8000 (not WAD-scaled)
    // If usdMonthly is already WAD-scaled: return usdMonthly / SECONDS_PER_MONTH;
}
```

**Option B: Convert in frontend** (less gas, more client logic)
```typescript
function monthlyUsdToWadPerSecond(usdMonthly: number): bigint {
    const wadAmount = BigInt(Math.round(usdMonthly * 1e18));
    return wadAmount / BigInt(30 * 24 * 3600);
}
```

**Recommend Option B:** Keep the contract simple. Frontend already has `usdToWad` — extend it.

---

## Step 2 — Rewrite `settle()` Data Source

### 2a. Replace `_balancesFromChain()` with `_flowRatesFromChain()`

Current (`TBFFNetwork.sol:_balancesFromChain`):
```solidity
function _balancesFromChain() internal view returns (uint256[] memory) {
    uint256 n = nodes.length;
    uint256[] memory bals = new uint256[](n);
    for (uint256 i; i < n;) {
        (int256 avb,,) = token.realtimeBalanceOfNow(nodes[i]);
        bals[i] = avb > 0 ? uint256(avb) : 0;
        unchecked { ++i; }
    }
    return bals;
}
```

Phase 4 replacement:
```solidity
function _incomeRatesFromChain() internal view returns (uint256[] memory) {
    uint256 n = nodes.length;
    uint256[] memory rates = new uint256[](n);
    for (uint256 i; i < n;) {
        // getAccountFlowInfo returns (lastUpdated, flowrate, deposit, owedDeposit)
        // flowrate is net flow rate: inbound - outbound (can be negative)
        (, int96 flowrate,,) = forwarder.getAccountFlowInfo(token, nodes[i]);
        // We want gross inbound rate, but Superfluid only gives net.
        // For now, use net flow rate (clamped to 0 if negative).
        // Negative means outbound > inbound — node is a net sender.
        rates[i] = flowrate > 0 ? uint256(int256(flowrate)) : 0;
        unchecked { ++i; }
    }
    return rates;
}
```

**Critical issue: Gross vs Net flow rate.**

Superfluid's `getAccountFlowInfo` returns **net** flow rate (inbound - outbound). After `settle()` creates outbound streams, the net rate changes. This creates a feedback loop:

1. `settle()` reads net rate = $10K/mo (no outbound streams yet)
2. Node overflows, streams created outbound at $2K/mo
3. Next `settle()` reads net rate = $8K/mo (inbound minus outbound)
4. No more overflow → streams deleted
5. Next `settle()` reads net rate = $10K/mo → overflow again → loop

**Solution A: Read gross inbound rate.** Sum all inbound stream rates manually:
```solidity
function _grossIncomeRate(address node) internal view returns (uint256) {
    uint256 totalInbound;
    for (uint256 i; i < nodes.length;) {
        if (nodes[i] != node) {
            int96 rate = forwarder.getFlowrate(token, nodes[i], node);
            if (rate > 0) totalInbound += uint256(int256(rate));
        }
        unchecked { ++i; }
    }
    // Also include external inbound (non-TBFF streams)
    // This requires knowing which streams are TBFF-managed vs external
    return totalInbound;
}
```

**Solution B: Track TBFF-managed streams separately.** The contract already knows what streams it has set. Compute:
```
grossIncome[i] = netFlowRate[i] + sum(outboundTBFFStreams[i])
```

Where `outboundTBFFStreams[i]` is the sum of all streams the contract set FROM node i.

**Solution C: Use external income only.** Define "income rate" as the non-TBFF inbound rate:
```
externalIncome[i] = netFlowRate[i] + sum(outboundTBFFStreams[i]) - sum(inboundTBFFStreams[i])
```

This is the income from outside the TBFF network. Convergence then redistributes this external income through the allocation graph. This is the cleanest definition because it's stable — it doesn't change when `settle()` modifies TBFF streams.

**Recommend Solution C.** It eliminates the feedback loop entirely.

### 2b. Track TBFF-managed stream rates

Add storage to track what streams the contract has set:
```solidity
// Mapping: sender → receiver → current rate set by this contract
mapping(address => mapping(address => int96)) public tbffStreamRates;
```

Update in `_applyRedistribution` when setting streams:
```solidity
tbffStreamRates[sender][receiver] = targetRate;
```

Compute external income:
```solidity
function _externalIncomeRate(address node) internal view returns (uint256) {
    (, int96 netRate,,) = forwarder.getAccountFlowInfo(token, node);

    // Sum TBFF-managed inbound streams to this node
    int256 tbffInbound;
    // Sum TBFF-managed outbound streams from this node
    int256 tbffOutbound;

    for (uint256 i; i < nodes.length;) {
        if (nodes[i] != node) {
            int96 inRate = tbffStreamRates[nodes[i]][node];
            if (inRate > 0) tbffInbound += int256(inRate);
            int96 outRate = tbffStreamRates[node][nodes[i]];
            if (outRate > 0) tbffOutbound += int256(outRate);
        }
        unchecked { ++i; }
    }

    // externalIncome = netRate + tbffOutbound - tbffInbound
    // = (allInbound - allOutbound) + tbffOutbound - tbffInbound
    // = (externalInbound + tbffInbound - externalOutbound - tbffOutbound) + tbffOutbound - tbffInbound
    // = externalInbound - externalOutbound
    int256 external = int256(netRate) + tbffOutbound - tbffInbound;
    return external > 0 ? uint256(external) : 0;
}
```

### 2c. Load network state with rates

```solidity
function _loadNetworkState() internal view returns (TBFFMath.NetworkState memory) {
    uint256 n = nodes.length;
    uint256[] memory rates = new uint256[](n);
    for (uint256 i; i < n;) {
        rates[i] = _externalIncomeRate(nodes[i]);
        unchecked { ++i; }
    }

    return TBFFMath.NetworkState({
        n: n,
        values: rates,          // Was: balances from realtimeBalanceOfNow
        thresholds: thresholds,  // Now: WAD/second rate caps
        allocTargets: _allocTargets,
        allocWeights: _allocWeights,
        allocOffsets: _allocOffsets
    });
}
```

---

## Step 3 — Fix `_applyRedistribution` to Use Convergence Output

### Current problem (Phase 3)

```solidity
function _applyRedistribution(
    uint256[] memory currentBalances,
    uint256[] memory /* finalBalances */  // ← IGNORED
) internal {
    // Uses currentBalances for single-pass overflow
    // Ignores multi-hop cascading from convergence
}
```

### Phase 4 fix

The convergence output `finalRates[]` encodes the equilibrium income rate for each node. The difference between external income and final rate tells us how much each node should stream out:

```solidity
function _applyRedistribution(
    uint256[] memory externalRates,
    uint256[] memory finalRates
) internal {
    uint256 n = nodes.length;

    for (uint256 i; i < n;) {
        // Each node's excess = how much of their external income overflows
        // This is: externalRate[i] - min(externalRate[i], maxThreshold[i])
        // But convergence already computed the network equilibrium.
        //
        // For each allocation edge (i → j), the target stream rate is
        // derived from the converged overflow, not single-pass overflow.

        uint256 overflowRate;
        if (externalRates[i] > thresholds[i]) {
            // Phase 3.5: add minThreshold gate here
            overflowRate = externalRates[i] - thresholds[i];
        }

        // Now distribute overflowRate to allocation targets
        uint256 start = _allocOffsets[i];
        uint256 end = _allocOffsets[i + 1];
        uint256 allocCount = end - start;

        if (allocCount == 0 || overflowRate == 0) {
            // Delete any existing outbound streams from node i
            _deleteAllStreams(i);
            unchecked { ++i; }
            continue;
        }

        uint256 distributed;
        for (uint256 k = start; k < end;) {
            uint256 j = _allocTargets[k];
            uint256 share;
            if (k == end - 1) {
                share = overflowRate - distributed; // dust to last
            } else {
                share = (overflowRate * uint256(_allocWeights[k])) / WAD;
            }
            distributed += share;

            int96 targetRate = int96(int256(share));
            // ★ NO division by streamEpoch — share IS the rate

            address sender = nodes[i];
            address receiver = nodes[j];
            int96 currentRate = forwarder.getFlowrate(token, sender, receiver);

            if (targetRate > 0 && currentRate == 0) {
                forwarder.setFlowrateFrom(token, sender, receiver, targetRate);
            } else if (targetRate > 0 && currentRate != targetRate) {
                forwarder.setFlowrateFrom(token, sender, receiver, targetRate);
            } else if (targetRate == 0 && currentRate > 0) {
                forwarder.setFlowrateFrom(token, sender, receiver, 0);
            }

            tbffStreamRates[sender][receiver] = targetRate;

            unchecked { ++k; }
        }

        unchecked { ++i; }
    }
}
```

**Key difference from Phase 3:** No `/ streamEpoch`. The overflow rate is already in WAD/second, and it goes directly to `setFlowrateFrom`.

### Alternative: Use converged rates for multi-hop

The above still uses single-pass overflow (externalRate - threshold). To use the full convergence output for multi-hop cascading:

```solidity
// The converged finalRates[i] already accounts for cascading.
// Node i's outbound rate = externalRates[i] - finalRates[i]
// (finalRates[i] is what node i retains after the network reaches equilibrium)

uint256 outboundRate = externalRates[i] > finalRates[i]
    ? externalRates[i] - finalRates[i]
    : 0;
```

This is more correct for networks with cycles. If A→B→C→A, convergence propagates overflow through the full cycle. Single-pass only captures A→B.

**Recommend: Use converged rates** for correctness. This is the whole point of running convergence.

---

## Step 4 — Remove `streamEpoch`

### 4a. Remove from storage and constructor

```solidity
// Remove:
uint256 public streamEpoch;

// Remove from constructor:
// streamEpoch = _streamEpoch;
```

### 4b. Remove from `_applyRedistribution`

The line `targetRate = int96(int256(overflowShare / streamEpoch))` is replaced by `targetRate = int96(int256(share))` as shown in Step 3.

### 4c. Update `settle()` function

Remove `streamEpoch` from any documentation or natspec. The function now operates purely in the flow domain.

### 4d. Backward compatibility

`streamEpoch` was set to `30 days` in the constructor. External callers may read it. If preserving backward compatibility matters, keep as a deprecated view:

```solidity
function streamEpoch() external pure returns (uint256) {
    return 30 days; // Deprecated: Phase 4 operates in flow domain
}
```

**Recommend: Remove entirely.** This is a breaking change but Phase 4 is a new deployment.

---

## Step 5 — Update Registration and Threshold Functions

### 5a. `selfRegister()` — thresholds as rates

Users provide thresholds in $/month. Frontend converts to WAD/second before calling.

```solidity
function selfRegister(
    uint256 minThreshold,  // WAD/second
    uint256 maxThreshold,  // WAD/second
    string calldata name,
    string calldata emoji,
    string calldata role
) external {
    // Bounds check against rate-based constants
    if (maxThreshold < MIN_THRESHOLD_BOUND || maxThreshold > MAX_THRESHOLD_BOUND)
        revert ThresholdOutOfBounds();
    if (minThreshold >= maxThreshold)
        revert MinThresholdExceedsMax();

    // ... rest of registration (same as Phase 3.5)

    thresholds.push(maxThreshold);
    minThresholds.push(minThreshold);
}
```

### 5b. `setMyThreshold()` — rate bounds

```solidity
function setMyThreshold(uint256 newMinThreshold, uint256 newMaxThreshold) external {
    if (!isNode[msg.sender]) revert NodeNotRegistered();
    if (newMaxThreshold < MIN_THRESHOLD_BOUND || newMaxThreshold > MAX_THRESHOLD_BOUND)
        revert ThresholdOutOfBounds();
    if (newMinThreshold >= newMaxThreshold)
        revert MinThresholdExceedsMax();

    uint256 idx = nodeIndex[msg.sender];
    thresholds[idx] = newMaxThreshold;
    minThresholds[idx] = newMinThreshold;

    emit MyThresholdSet(msg.sender, newMinThreshold, newMaxThreshold);
}
```

### 5c. View functions

```solidity
function getThresholdMonthly(address node) external view returns (uint256 min, uint256 max) {
    uint256 idx = nodeIndex[node];
    // Convert WAD/second → WAD/month for human-readable display
    min = minThresholds[idx] * SECONDS_PER_MONTH;
    max = thresholds[idx] * SECONDS_PER_MONTH;
}
```

---

## Step 6 — Update TypeScript Engine

### 6a. Rename `balance` → `incomeRate` in Participant

```typescript
export interface Participant {
    id: string;
    name: string;
    emoji: string;
    role: string;
    incomeRate: number;     // $/month — was "balance"
    minThreshold: number;   // $/month — now functional
    maxThreshold: number;   // $/month — was balance cap, now rate cap
    allocations: Allocation[];
}
```

### 6b. Rename `balances` → `rates` in snapshots

```typescript
export interface IterationSnapshot {
    iteration: number;
    rates: Record<string, number>;        // Was: balances
    overflows: Record<string, number>;     // $/month overflow rate
    transfers: Transfer[];
    changed: boolean;
}

export interface ConvergenceResult {
    finalRates: Record<string, number>;    // Was: finalBalances
    iterations: number;
    converged: boolean;
    snapshots: IterationSnapshot[];
    totalRedistributed: number;            // $/month total overflow rate
}
```

### 6c. Engine functions — semantic change only

The actual math functions don't change, only the naming:

```typescript
// capToThreshold(rate, threshold) — min(rate, threshold)
// computeOverflow(rate, threshold) — max(0, rate - threshold)
// iterateOnce(participants) — uses incomeRate instead of balance
// converge(participants) — returns finalRates instead of finalBalances
```

### 6d. Phase 3.5 minThreshold gate (carried forward)

```typescript
function iterateOnce(participants: Participant[]): IterationSnapshot {
    // Phase 1: Compute overflows
    const overflows: Record<string, number> = {};
    for (const p of participants) {
        if (p.incomeRate < p.minThreshold) {
            overflows[p.id] = 0; // Zone 1: building
        } else {
            overflows[p.id] = computeOverflow(p.incomeRate, p.maxThreshold);
        }
    }
    // Phase 2-3: distribute, compute new rates (same algebra)
    // ...
}
```

---

## Step 7 — Update Frontend

### 7a. Chain bridge conversions

New utility functions in `chain-bridge.ts`:

```typescript
// WAD/second → $/month (for display)
export function wadRateToMonthlyUsd(wadPerSecond: bigint): number {
    const wadPerMonth = wadPerSecond * BigInt(30 * 24 * 3600);
    return Number(wadPerMonth / BigInt(1e12)) / 1e6;
}

// $/month → WAD/second (for contract calls)
export function monthlyUsdToWadRate(usdPerMonth: number): bigint {
    const wadPerMonth = BigInt(Math.round(usdPerMonth * 1e18));
    return wadPerMonth / BigInt(30 * 24 * 3600);
}
```

### 7b. Registration and threshold hooks

`useRegister.ts` changes:
```typescript
// Before:
const wadThreshold = usdToWad(thresholdUsd); // Stock WAD

// After:
const wadRate = monthlyUsdToWadRate(thresholdUsd); // WAD/second rate
```

### 7c. API route changes

`web/src/app/api/network/route.ts`:

Replace `_balancesFromChain` equivalent with income rate computation. The API route currently calls `getNetworkState()` which returns balances. Phase 4 adds:

```typescript
// Read external income rates for all nodes
const incomeRates = await Promise.all(
    nodes.map(async (addr) => {
        const [, netFlowRate] = await client.readContract({
            address: CFA_FORWARDER,
            abi: CFAForwarderABI,
            functionName: 'getAccountFlowInfo',
            args: [SUPER_TOKEN, addr],
        });
        // TODO: Subtract TBFF-managed inbound, add TBFF-managed outbound
        // For now, use net flow rate
        return { address: addr, rate: netFlowRate };
    })
);
```

### 7d. Simulator page

The simulator currently uses stock-based inputs (Balance, Max Threshold). Phase 4 changes labels:

| Before | After |
|--------|-------|
| "Balance" | "Income Rate ($/mo)" |
| "Max Threshold" | "Max Threshold ($/mo)" |
| "$X" in DataTable | "$X/mo" for rates, "$X" for retained |

The slider ranges change from $0-$50,000 (stock) to $0-$50,000/mo (rate). Same numeric range, different semantics.

### 7e. Live page

The live page already shows animated balances (stocks). Phase 4 adds a parallel display:
- **Balance:** `$X` (stock, from `realtimeBalanceOfNow`, animated by `useAnimatedBalances`)
- **Income Rate:** `$X/mo` (flow, from `getAccountFlowInfo`, converted by `wadRateToMonthlyUsd`)
- **Threshold:** `$X/mo` (flow, from on-chain thresholds, converted)

Animated balances remain stock-based (this is correct — they show real-time wallet balance). The flow-based layer overlays the rate information.

---

## Step 8 — Update Solidity Tests

### 8a. Test data — rates instead of balances

Current test setup uses `startingBalances[]` in WAD tokens. Phase 4 uses `incomeRates[]` in WAD/second:

```solidity
// Phase 3: $10,000 balance (stock)
uint256 balance = 10_000 * WAD;

// Phase 4: $10,000/month income rate (flow)
uint256 rate = (10_000 * WAD) / (30 days); // ≈ 3_858_024_691_358 WAD/s
```

### 8b. New tests

```
test_settle_flowBased             — settle reads income rates, not balances
test_externalIncomeRate_computed  — gross minus TBFF streams = external
test_tbffStreamRates_tracked     — internal tracking of set stream rates
test_convergedRates_used          — _applyRedistribution uses finalRates
test_noStreamEpoch_division       — overflow rate goes directly to stream
test_rateThresholds_enforced      — threshold bounds in WAD/second
test_monthlyConversion_accurate   — WAD/second ↔ $/month round-trip
```

### 8c. Existing tests — update numeric values

All existing `TBFFMath.t.sol` tests continue to pass (algebra unchanged). Only `TBFFNetworkUnit.t.sol` tests need rate-based values.

---

## Step 9 — Update TypeScript Tests

### 9a. Engine tests — rename fields

```typescript
// Before:
expect(result.finalBalances['shawn']).toBeCloseTo(8000, 0);

// After:
expect(result.finalRates['shawn']).toBeCloseTo(8000, 0);
// Same numeric value, different semantic ($/month rate, not $ balance)
```

### 9b. Cross-validation tests

Cross-validation compares TypeScript engine output against Solidity. Both now operate on rates. Numeric tolerance ($0.01) remains the same.

---

## Step 10 — Update Deploy Script

### 10a. Thresholds as rates

```solidity
// Phase 3: $8,000 balance cap
uint256 threshold = 8_000 * WAD;

// Phase 4: $8,000/month rate cap
uint256 threshold = (8_000 * WAD) / (30 days);
```

### 10b. Remove `streamEpoch` from constructor

```solidity
// Phase 3:
TBFFNetwork network = new TBFFNetwork(token, forwarder, 30 days);

// Phase 4:
TBFFNetwork network = new TBFFNetwork(token, forwarder);
```

---

## Migration Path

Phase 4 is a **new deployment**, not an upgrade of the Phase 3 contract. The reasons:

1. Storage layout changes (threshold values go from WAD stocks to WAD/second rates)
2. `streamEpoch` removal changes constructor
3. `tbffStreamRates` mapping is new storage
4. Existing streams would need to be deleted and recreated

### Migration steps:

1. Deploy new TBFFNetwork (Phase 4)
2. Existing Mycopunks re-register with rate-based thresholds
3. Old contract's streams wind down naturally (or call `settle()` to delete them)
4. Grant permissions to new contract
5. Fund new contract reserve

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Feedback loop: settle reads net rates that settle just changed | High | Solution C: compute external income by subtracting TBFF streams |
| Gross vs net rate confusion | High | Clear naming: `externalIncomeRate`, `tbffStreamRate`, `netFlowRate` |
| WAD/second precision loss | Medium | $1/month ≈ 385 WAD/s — sufficient precision for dollar-scale amounts |
| Convergence on rates may not converge for cyclic graphs | Medium | Same algorithm as stock-based — convergence properties unchanged |
| Users confused by $/month vs $ | Medium | Phase 3.5 adds /mo labels first, Phase 4 makes them semantically correct |
| Breaking change for existing integrations | Low | New deployment — no upgrade needed |

---

## Verification

### Contracts
```bash
cd contracts
forge build                    # Clean compilation
make test-unit                 # All tests pass with rate-based values
```

### Web
```bash
cd web
npx tsc --noEmit               # No type errors
npm run test                   # All tests pass with renamed fields
npm run build                  # Clean production build
```

### End-to-End
```bash
# Anvil fork, deploy Phase 4 contract, verify:
# 1. settle() reads income rates (not balances)
# 2. Streams set directly from convergence output (no /streamEpoch)
# 3. External income computed correctly (net + tbffOut - tbffIn)
# 4. Threshold bounds enforced in WAD/second
# 5. UI shows $/mo for all rate quantities
```

---

## Files Created/Modified

| Action | File | Description |
|--------|------|-------------|
| Modify | `contracts/src/TBFFNetwork.sol` | Flow-based settle, external income, remove streamEpoch, rate thresholds |
| Modify | `contracts/src/libraries/TBFFMath.sol` | Rename `balances` → `values` in NetworkState (optional) |
| Modify | `contracts/test/unit/TBFFNetworkUnit.t.sol` | Rate-based test values + new flow tests |
| Modify | `contracts/script/Deploy.s.sol` | Rate-based thresholds, no streamEpoch |
| Modify | `web/src/lib/tbff/engine.ts` | `incomeRate`, `finalRates`, minThreshold gate |
| Modify | `web/src/lib/tbff/chain-bridge.ts` | `wadRateToMonthlyUsd`, `monthlyUsdToWadRate` |
| Modify | `web/src/lib/tbff/mock-data.ts` | `incomeRate` instead of `balance` |
| Modify | `web/src/lib/hooks/useRegister.ts` | `monthlyUsdToWadRate` for thresholds |
| Modify | `web/src/lib/hooks/useSetMyThreshold.ts` | Rate-based conversion |
| Modify | `web/src/lib/hooks/useTBFFNetwork.ts` | Read rate-based thresholds |
| Modify | `web/src/app/api/network/route.ts` | Add income rate reads |
| Modify | `web/src/app/live/page.tsx` | Rate display, /mo labels |
| Modify | `web/src/app/simulator/page.tsx` | Rate inputs, /mo labels |
| Modify | `web/src/components/NetworkGraph.tsx` | Rate-based node coloring |
| Modify | `web/src/components/DataTable.tsx` | Rate columns with /mo |
| Modify | `web/src/components/AllocationEditor.tsx` | Rate-based threshold display |
| Modify | `web/src/components/RegistrationFlow.tsx` | Rate-based threshold inputs |
| Modify | `web/src/lib/tbff/__tests__/engine.test.ts` | Rate-based assertions |
| Modify | `web/src/lib/tbff/__tests__/cross-validation.test.ts` | Rate-based comparisons |

**Unchanged:** TBFFMath.sol math functions (algebra is dimensionally agnostic), allocation-utils.ts, RainButton.tsx (rain is a stock injection, correctly), ProfileEditor.tsx.

---

## Critical Implementation Details

### External Income Rate Computation

The most complex and highest-risk change. The formula:

```
externalIncome[i] = netFlowRate[i] + Σ(tbffOutbound[i→j]) - Σ(tbffInbound[j→i])
```

Must be correct. Off-by-one in the sign or direction creates incorrect redistribution.

### WAD/second Precision

$1/month = `1e18 / 2_592_000` ≈ `385_802_469_135_802` WAD/second (≈ 3.86 × 10^14).
$0.01/month = `1e18 / 259_200_000_000` ≈ `3_858_024_691` WAD/second (≈ 3.86 × 10^9).

With `uint256`, precision is not a concern. With `int96` (Superfluid flow rates), max is ~3.96 × 10^28, so even $1B/month (≈ 3.86 × 10^23 WAD/s) fits with room to spare.

### Convergence Output Usage

The converged `finalRates[]` vector represents the equilibrium income rate for each node after all cascading redistribution. The outbound rate for node i is:

```
outbound[i] = externalIncome[i] - min(externalIncome[i], maxThreshold[i])
            = max(0, externalIncome[i] - maxThreshold[i])
```

But for multi-hop correctness in cyclic graphs, use:
```
outbound[i] = externalIncome[i] - finalRates[i]
```

where `finalRates[i]` accounts for income received from other overflowing nodes.

### Backward Compatibility

Phase 4 is a **new contract deployment**. No storage migration. No upgrade proxy. Clean slate with rate-based semantics from the start.

---

*End of Phase 4 Specification.*
