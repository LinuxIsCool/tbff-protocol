# TBFF Stock/Flow Dimensional Audit

**Date:** 2026-03-02
**Scope:** Complete audit of all numeric values, equations, data paths, and mental models across contracts/ and web/ for dimensional consistency between stocks and flows.
**Branch:** feature/phase3-interactive
**Author:** Claude Code (Opus 4.6), commissioned by Shawn Anderson

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Dynamics Primer](#2-system-dynamics-primer)
3. [The Intended Mental Model](#3-the-intended-mental-model)
4. [The Implemented Mental Model](#4-the-implemented-mental-model)
5. [Complete Variable Inventory](#5-complete-variable-inventory)
6. [Equation Dimensional Analysis](#6-equation-dimensional-analysis)
7. [The Stock-to-Flow Seam](#7-the-stock-to-flow-seam)
8. [Data Flow Traces](#8-data-flow-traces)
9. [Inconsistencies and Missing Concepts](#9-inconsistencies-and-missing-concepts)
10. [The Three-Zone Threshold Model](#10-the-three-zone-threshold-model)
11. [Causal Loop Diagram](#11-causal-loop-diagram)
12. [Recommendations](#12-recommendations)
13. [File-by-File Reference](#13-file-by-file-reference)

---

## 1. Executive Summary

The TBFF codebase is internally consistent within its chosen model: all mathematics operate in the **stock domain** (balances at a point in time, measured in dollars or WAD tokens). There is exactly **one line of code** that converts from stocks to flows: `TBFFNetwork.sol:495`, where `overflowShare / streamEpoch` converts a token amount to a per-second stream rate. Everything above that line is stocks; everything below (Superfluid CFA streams) is flows.

The fundamental problem is that this model contradicts the **intended conceptual model**, where:

- **minThreshold** = minimum income flow rate needed for a participant to actively contribute to the network
- **maxThreshold** = maximum income flow rate (lifestyle optimum); excess above this flows through to allocations
- The convergence equation should operate on **flow rate vectors**, not **balance vectors**
- Thresholds should be compared against income rates, not wallet balances

Additionally, **minThreshold is completely orphaned**: it exists in the TypeScript `Participant` interface (line 24: `// display only in Phase 1`), is hardcoded to `$3,000` in three places, is displayed in the AllocationEditor UI, but is **never used in any equation, comparison, or contract function**. It has zero mathematical presence.

### Key Findings

| Finding | Severity | Impact |
|---------|----------|--------|
| Core equation operates on stocks, not flows | Conceptual | Entire mathematical model misframed |
| minThreshold completely orphaned | Missing feature | No activation gating for participants |
| `_applyRedistribution` ignores convergence result | Architectural | Convergence math is decorative, not operational |
| No time units anywhere in UI | UX confusion | Users cannot distinguish stocks from flows |
| `cumulativeFlowThrough` is a stock named like a flow | Naming | Misleading data model |
| WAD conversion has no type distinction (stock vs rate) | Type safety | Fragile dimensional correctness |
| Only `useAnimatedBalances.ts` correctly handles flows | Isolated correctness | One file is right, everything else is stock-only |

---

## 2. System Dynamics Primer

System dynamics distinguishes four types of variables:

### Stocks (State Variables)
**Accumulations** that persist over time. Measured at a point in time. Have no time dimension in their units.

- Units: dollars ($), tokens (WAD), count
- Changed only by flows (inflows increase, outflows decrease)
- Examples: bank balance, inventory, population
- Mathematical: `S(t) = S(t₀) + ∫[t₀→t] (inflow - outflow) dt`

### Flows (Rate Variables)
**Rates of change** that fill or drain stocks. Have a time dimension.

- Units: dollars per month ($/mo), tokens per second (WAD/s)
- Cannot exist without a source and destination stock
- Examples: income, spending, birth rate
- Mathematical: `F = dS/dt`

### Converters (Auxiliary Variables)
Transform one quantity into another. May have any units.

- Examples: WAD→USD conversion, percentage→WAD conversion
- No inherent time dimension unless converting between stocks and flows

### Constants
Fixed values that parameterize the system.

- Examples: WAD (1e18), EPSILON (1e-10), STREAM_EPOCH (30 days)

### The Fundamental Identity

```
Stock(t) = Stock(t₀) + ∫[t₀ → t] (Inflow(τ) - Outflow(τ)) dτ
```

Or discretely:

```
Stock(t+Δt) = Stock(t) + (Inflow - Outflow) × Δt
```

This is the relationship between stocks and flows. The only place in the TBFF codebase that implements this identity correctly is `useAnimatedBalances.ts:58`:

```typescript
result[addr] = baseUsd + ratePerSec * elapsed;
//              ^stock    ^flow       ^time
//              [$]       [$/s]       [s]       = [$] ✓
```

---

## 3. The Intended Mental Model

Based on Shawn's description, the correct TBFF mental model is:

### What Thresholds Mean

**minThreshold** (income floor): The minimum income flow rate a participant needs to justify their ongoing commitment to the network. Below this rate, the participant is not yet sustainable — they should receive but not yet be expected to contribute their overflow. This signals "what I need to have my needs met."

**maxThreshold** (lifestyle optimum): The income flow rate at which a participant has reached their optimal lifestyle. Income above this rate is more valuable to the network than to the individual — the excess flows through to their allocation targets. This signals "what I need to achieve my optimal lifestyle."

### What This Implies

1. **Thresholds are flow rates**, not balance caps. They have units of $/month (or WAD tokens/second on-chain).
2. **The equation should operate on income rates**, not wallet balances. The vector `x` represents each node's current net income rate.
3. **The comparison `income > maxThreshold`** triggers redistribution, not `balance > maxThreshold`.
4. **Below minThreshold**, a node is inactive — it receives income but does not redistribute its excess to others. It's still accumulating toward sustainability.
5. **Between min and max**, a node is active and contributing. It retains all its income (no overflow).
6. **Above max**, the excess income rate flows through to allocation targets.

### The Stock-Flow Distinction for TBFF

| Concept | Correct Type | Units | Meaning |
|---------|-------------|-------|---------|
| Token balance | Stock | $ (WAD) | How much a node holds right now |
| Income rate | Flow | $/month (WAD/s) | How fast money flows into a node |
| Outflow rate | Flow | $/month (WAD/s) | How fast money flows out of a node |
| Net flow rate | Flow | $/month (WAD/s) | Income minus outflow |
| minThreshold | Flow | $/month (WAD/s) | Minimum income rate for active participation |
| maxThreshold | Flow | $/month (WAD/s) | Lifestyle optimum income rate |
| Overflow rate | Flow | $/month (WAD/s) | max(0, income - maxThreshold) |
| Retained rate | Flow | $/month (WAD/s) | min(income, maxThreshold) |
| Allocation weight | Dimensionless | fraction (0-1) | Portion of overflow directed to a target |
| Cumulative flow-through | Stock | $ (WAD) | Total historical dollars that passed through |
| Network reserve | Stock | $ (WAD) | Tokens held by the contract |
| Seed amount | Stock | $ (WAD) | One-time token transfer at registration |

---

## 4. The Implemented Mental Model

### Current Interpretation

The codebase currently treats thresholds as **balance caps** (stocks):

- "If your wallet holds more than $8,000, the excess is redistributed to your allocation targets."
- The equation computes on **balance snapshots** (WAD token amounts held at a point in time).
- The comparison `balance > threshold` triggers redistribution.
- The result is a new set of **target balances**, not target flow rates.
- The conversion to Superfluid streams happens as an afterthought: `overflow / streamEpoch`.

### Where the Models Diverge

| Question | Stock Model (Implemented) | Flow Model (Intended) |
|----------|--------------------------|----------------------|
| What triggers redistribution? | Balance exceeds threshold | Income rate exceeds threshold |
| What does $8,000 mean? | "If you hold > $8K" | "If you earn > $8K/month" |
| What enters the equation? | Balance vector [WAD tokens] | Income rate vector [WAD/s] |
| What exits the equation? | Target balance vector [WAD tokens] | Target rate vector [WAD/s] |
| Is minThreshold used? | No — completely absent from math | Yes — gates participation |
| How do streams get computed? | `overflow / streamEpoch` (stock→flow conversion) | Directly from equation output (already flows) |
| Temporal stability? | Fragile — balance changes every second | Stable — rates constant between settle() |

### The Core Equation (Same Algebra, Different Semantics)

```
Stock model:  b^(k+1) = min(b, t) + P^T · max(0, b - t)
              where b = balances [$], t = thresholds [$]

Flow model:   f^(k+1) = min(f, t) + P^T · max(0, f - t)
              where f = income rates [$/s], t = thresholds [$/s]
```

The algebra is identical. Only the semantics change. But the semantics determine:
- What data we read from chain (balances vs flow rates)
- What units the constants have ($1K vs $1K/month)
- Whether `streamEpoch` is needed (yes for stocks, no for flows)
- Whether minThreshold has a role (no for stocks, yes for flows)

---

## 5. Complete Variable Inventory

### Legend

- **S** = Stock (amount at a point in time, no time dimension)
- **F** = Flow (rate, has time dimension: per-second, per-month, etc.)
- **D** = Dimensionless (ratio, count, index)
- **T** = Time (seconds, timestamp)
- **K** = Conversion factor
- **⚠** = Dimensional inconsistency or conceptual concern

---

### 5.1 TBFFMath.sol — Pure Math Library

| Variable | Line | Type | Units | Notes |
|----------|------|------|-------|-------|
| `WAD` | 11 | K | 1e18 | Scaling constant, dimensionless multiplier |
| `Allocation.target` | 15 | D | address | Graph structure |
| `Allocation.weight` | 16 | D | WAD-scaled fraction | 1e18 = 100% |
| `NetworkState.n` | 24 | D | count | Number of nodes |
| `NetworkState.balances[]` | 25 | **S** | WAD tokens | ⚠ Named "balances" — stock framing |
| `NetworkState.thresholds[]` | 26 | **S** | WAD tokens | ⚠ Compared against balances — stock vs stock |
| `NetworkState.allocTargets[]` | 27 | D | index | CSR graph structure |
| `NetworkState.allocWeights[]` | 28 | D | WAD-scaled fraction | Edge weights |
| `NetworkState.allocOffsets[]` | 29 | D | index | CSR offsets (length n+1) |
| `capToThreshold.balance` | 33 | **S** | WAD tokens | Input stock |
| `capToThreshold.threshold` | 33 | **S** | WAD tokens | Compared to stock ✓ consistent |
| `computeOverflow.balance` | 38 | **S** | WAD tokens | Input stock |
| `computeOverflow.threshold` | 38 | **S** | WAD tokens | Compared to stock ✓ consistent |
| `distributeOverflow.overflow` | 51 | **S** | WAD tokens | Excess amount |
| `distributeOverflow.weights` | 53 | D | WAD-scaled fractions | Sum to WAD |
| `distributeOverflow.amounts[]` | 54 | **S** | WAD tokens | Per-recipient amounts |
| `distributeOverflow.distributed` | 59 | **S** | WAD tokens | Running sum |
| `iterateOnce.newBalances[]` | 83 | **S** | WAD tokens | Post-iteration balances |
| `iterateOnce.overflow` | 93 | **S** | WAD tokens | Per-node excess |
| `converge.currentBalances[]` | 143 | **S** | WAD tokens | Working copy |
| `converge.finalBalances[]` | 156 | **S** | WAD tokens | Converged result |
| `converge.iterations` | 149 | D | count | Iteration counter |

**Summary:** Every numeric value in TBFFMath.sol is either a stock (WAD tokens), a dimensionless ratio, or a count. Zero flow quantities exist in this library. It is pure stock-domain arithmetic.

---

### 5.2 TBFFNetwork.sol — On-Chain Controller

| Variable | Line | Type | Units | Notes |
|----------|------|------|-------|-------|
| `WAD` | 16 | K | 1e18 | Scaling constant |
| `token` | 20 | — | address | ISuperToken reference |
| `forwarder` | 21 | — | address | ICFAv1Forwarder reference |
| `owner` | 22 | — | address | Admin |
| `streamEpoch` | 23 | **T** | seconds | ⚠ The stock→flow conversion factor (30 days = 2,592,000s) |
| `nodes[]` | 25 | — | address[] | Participant addresses |
| `nodeIndex` | 26 | D | index mapping | address → uint256 |
| `isNode` | 27 | D | boolean mapping | Membership check |
| `thresholds[]` | 29 | **S** | WAD tokens | ⚠ Stored as balance cap, compared to `realtimeBalanceOfNow` |
| `_allocOffsets[]` | 32 | D | indices | CSR format |
| `_allocTargets[]` | 33 | D | indices | CSR format |
| `_allocWeights[]` | 34 | D | WAD-scaled fractions | CSR format |
| `lastSettleTimestamp` | 37 | **T** | seconds (epoch) | When last settle() ran |
| `lastSettleIterations` | 38 | D | count | How many passes |
| `lastSettleConverged` | 39 | D | boolean | Did it converge? |
| `lastSettleTotalRedistributed` | 40 | **S** | WAD tokens | ⚠ Sum of positive balance deltas from convergence |
| `Profile.name` | 45 | — | string | Max 64 bytes |
| `Profile.emoji` | 46 | — | string | Max 8 bytes |
| `Profile.role` | 47 | — | string | Max 128 bytes |
| `profiles` | 49 | — | mapping | address → Profile |
| `cumulativeFlowThrough` | 50 | **S** | WAD tokens | ⚠ Named "flow" but is cumulative stock (lifetime total) |
| `MIN_THRESHOLD` | 52 | **S** | WAD tokens (1,000 × 1e18) | ⚠ Bounds guard on user-set maxThreshold, NOT a per-node min |
| `MAX_THRESHOLD` | 53 | **S** | WAD tokens (50,000 × 1e18) | Upper bound on user-set maxThreshold |
| `SEED_AMOUNT` | 54 | **S** | WAD tokens (100 × 1e18) | One-time seed transfer |
| `registerNode.maxThreshold` | 111 | **S** | WAD tokens | Param stored in thresholds[] |
| `selfRegister.maxThreshold` | 192 | **S** | WAD tokens | Param stored in thresholds[] |
| `setMyThreshold.newThreshold` | 245 | **S** | WAD tokens | Replaces threshold in array |
| `rain.amount` | 261 | **S** | WAD tokens | Total tokens to distribute |
| `rain.perNode` | 265 | **S** | WAD tokens | amount / nodeCount |
| `fundReserve.amount` | 179 | **S** | WAD tokens | Transfer into contract |
| `settle.balances[]` | 283 | **S** | WAD tokens | From `_balancesFromChain()` |
| `settle.finalBalances[]` | 289 | **S** | WAD tokens | From `TBFFMath.converge()` |
| `settle.totalRedist` | 292 | **S** | WAD tokens | Sum of positive deltas |
| `_balancesFromChain.availableBalance` | 430 | **S** | WAD tokens (int256) | ⚠ Superfluid real-time balance = static + streaming |
| `_applyRedistribution.overflow` | 480 | **S** | WAD tokens | `computeOverflow(balance, threshold)` |
| `_applyRedistribution.overflowShare` | 494 | **S** | WAD tokens | `overflow × weight / WAD` |
| `_applyRedistribution.targetRate` | 492 | **F** | WAD tokens/second (int96) | ⚠ **THE SEAM**: `overflowShare / streamEpoch` |
| `_applyRedistribution.currentRate` | 499 | **F** | WAD tokens/second (int96) | Existing Superfluid stream rate |

**Summary:** The critical conversion happens at line 495: `targetRate = int96(int256(overflowShare / streamEpoch))`. This is the only stock→flow conversion in the contract. `targetRate` and `currentRate` are the only flow-typed values.

---

### 5.3 ISuperToken.sol — Token Interface

| Function/Return | Type | Units | Notes |
|----------------|------|-------|-------|
| `realtimeBalanceOfNow.availableBalance` | **S** | WAD tokens (int256, signed) | Includes streaming adjustments. A stock read. |
| `realtimeBalanceOfNow.deposit` | **S** | WAD tokens | Stream security deposit |
| `realtimeBalanceOfNow.owedDeposit` | **S** | WAD tokens | Owed back |
| `realtimeBalanceOfNow.timestamp` | **T** | seconds | When balance was computed |
| `transferFrom.amount` | **S** | WAD tokens | One-time transfer |
| `transfer.amount` | **S** | WAD tokens | One-time transfer |
| `balanceOf.returns` | **S** | WAD tokens | Static balance (no streaming) |

---

### 5.4 ICFAv1Forwarder.sol — Stream Interface

| Function/Return | Type | Units | Notes |
|----------------|------|-------|-------|
| `setFlowrateFrom.flowrate` | **F** | WAD tokens/second (int96) | The stream rate to set |
| `getFlowrate.returns` | **F** | WAD tokens/second (int96) | Current stream rate |
| `getAccountFlowInfo.lastUpdated` | **T** | seconds (uint256) | When last changed |
| `getAccountFlowInfo.flowrate` | **F** | WAD tokens/second (int96) | Net flow rate for account |
| `getAccountFlowInfo.deposit` | **S** | WAD tokens (uint256) | Security deposit |
| `getAccountFlowInfo.owedDeposit` | **S** | WAD tokens (uint256) | Owed deposit |

---

### 5.5 engine.ts — TypeScript Math Engine

| Variable | Line | Type | Units | Notes |
|----------|------|------|-------|-------|
| `Allocation.weight` | 15 | D | 0-1 fraction | Dimensionless ratio |
| `Participant.balance` | 23 | **S** | dollars ($) | ⚠ Named "balance" — stock |
| `Participant.minThreshold` | 24 | **S** | dollars ($) | ⚠ "display only in Phase 1" — DEAD CODE |
| `Participant.maxThreshold` | 25 | **S** | dollars ($) | ⚠ "used by the equation" — stock cap |
| `Transfer.amount` | 32 | **S** | dollars ($) | Movement between nodes |
| `IterationSnapshot.balances` | 37 | **S** | dollars ($) | Per-id balance map |
| `IterationSnapshot.overflows` | 38 | **S** | dollars ($) | Per-id overflow |
| `ConvergenceResult.finalBalances` | 44 | **S** | dollars ($) | Converged balances |
| `ConvergenceResult.totalRedistributed` | 48 | **S** | dollars ($) | Cumulative transfer sum |
| `EPSILON` | 53 | D | — | 1e-10, comparison tolerance |

**Summary:** The TypeScript engine is a pure stock mirror of TBFFMath.sol. `minThreshold` exists in the interface but is never referenced in `capToThreshold()`, `computeOverflow()`, `iterateOnce()`, or `converge()`. It is structurally dead.

---

### 5.6 mock-data.ts — Simulator Default Data

| Value | Participant | Type | Units | Notes |
|-------|------------|------|-------|-------|
| `balance: 6000` | shawn | **S** | $ | Starting wallet balance |
| `balance: 5000` | jeff | **S** | $ | |
| `balance: 4000` | darren | **S** | $ | |
| `balance: 7000` | simon | **S** | $ | |
| `balance: 10000` | christina | **S** | $ | Above threshold to trigger overflow |
| `minThreshold: 3000` | all five | **S** | $ | ⚠ Hardcoded, never used in computation |
| `maxThreshold: 8000` | all five | **S** | $ | Balance cap for redistribution |
| Comment: "Total funding: $32,000" | — | **S** | $ | Sum of balances — stock framing |
| Comment: "Sum of maxes: $40,000" | — | **S** | $ | Sum of thresholds — stock framing |

**Note:** If these values were correctly flow-typed, they would represent monthly income rates: "Shawn's income: $6,000/month", "Max threshold: $8,000/month". The comment would read "Total income: $32,000/month across participants."

---

### 5.7 chain-bridge.ts — WAD Conversion & Bridging

| Function/Value | Line | Type | Units | Notes |
|---------------|------|------|-------|-------|
| `wadToUsd(wad)` | 8-10 | K | WAD → $ | ⚠ No type distinction: works for both balance WAD and rate WAD |
| `usdToWad(usd)` | 15-17 | K | $ → WAD | ⚠ Same: no distinction |
| `flowRateToMonthly(flowRate)` | 22-26 | K | WAD/s → $/month | ✓ Correct flow conversion. The only one. |
| `bridgeToParticipant.balance` | 119 | **S** | $ | `wadToUsd(balance)` — stock |
| `bridgeToParticipant.minThreshold` | 120 | **S** | $ | ⚠ **Hardcoded `3000`** — magic constant, not from chain |
| `bridgeToParticipant.maxThreshold` | 121 | **S** | $ | `wadToUsd(threshold)` — stock |
| `profileToParticipant.balance` | 148 | **S** | $ | `wadToUsd(balance)` — stock |
| `profileToParticipant.minThreshold` | 149 | **S** | $ | ⚠ **Hardcoded `3000`** — second copy of magic constant |
| `profileToParticipant.maxThreshold` | 150 | **S** | $ | `wadToUsd(threshold)` — stock |

**Critical observation:** `wadToUsd` and `usdToWad` accept any bigint/number. There is no TypeScript type system enforcement that prevents passing a flow-rate WAD into `wadToUsd` (which would produce a numerically correct but semantically wrong result — $/second instead of $). The `flowRateToMonthly` function exists and is correct, but it's only used in one place: `live/page.tsx:50-54` for display in the Active Streams legend.

---

### 5.8 useAnimatedBalances.ts — The Only Correct Flow Handler

| Variable | Line | Type | Units | Notes |
|----------|------|------|-------|-------|
| `balances[]` | 9 | **S** | WAD tokens | Base balance snapshot |
| `netFlowRate` | 10 | **F** | WAD tokens/second | ✓ Correctly typed as a rate |
| `fetchTimestamp` | 12 | **T** | seconds | When balances were read |
| `baseUsd` | 52 | **S** | $ | `wadToUsd(balance)` |
| `ratePerSec` | 57 | **F** | $/second | ✓ `wadToUsd(netFlowRate)` — works because WAD scaling is same |
| `elapsed` | 56 | **T** | seconds | `now - fetchTime` |
| `result` | 58 | **S** | $ | ✓ `baseUsd + ratePerSec × elapsed` — correct: $ + $/s × s = $ |

**This hook is the reference implementation for correct stock-flow integration.** The formula `stock(t) = stock(t₀) + flow × Δt` is the fundamental stock-flow identity. No other file in the codebase implements this.

---

### 5.9 useSuperfluidStreams.ts — Genuine Flow Data

| Variable | Line | Type | Units | Notes |
|----------|------|------|-------|-------|
| `StreamInfo.from` | 16 | — | address | Stream sender |
| `StreamInfo.to` | 17 | — | address | Stream receiver |
| `StreamInfo.rate` | 18 | **F** | WAD tokens/second (bigint) | ✓ Real on-chain flow rate |
| `useAccountFlowInfo.netFlowRate` | 55 | **F** | WAD tokens/second (bigint) | ✓ Net income rate per account |
| `useAccountFlowInfo.lastUpdated` | 55 | **T** | seconds (bigint) | When flow was last modified |

**Summary:** This hook is where genuine Superfluid flow rates live. The `netFlowRate` from `getAccountFlowInfo` is the true income rate for each node — exactly what the convergence equation should operate on if we switch to the flow model.

---

### 5.10 useTBFFNetwork.ts — Network State Reader

| Variable | Line | Type | Units | Notes |
|----------|------|------|-------|-------|
| `nodes` | 31 | — | Address[] | Node addresses |
| `balances` | 32 | **S** | WAD tokens (bigint[]) | From `realtimeBalanceOfNow` |
| `thresholds` | 33 | **S** | WAD tokens (bigint[]) | Per-node threshold (stock) |
| `lastSettle.timestamp` | 37 | **T** | seconds (bigint) | Settlement time |
| `lastSettle.iterations` | 38 | D | count (bigint) | Convergence passes |
| `lastSettle.converged` | 39 | D | boolean | Convergence status |
| `lastSettle.totalRedistributed` | 40 | **S** | WAD tokens (bigint) | ⚠ Labeled "redistributed" but is stock sum |
| `refetchInterval: 15_000` | 18 | **T** | milliseconds | Polling period |

---

### 5.11 Hooks (useRegister, useRain, useSetMyThreshold, useSetMyAllocations, useSetMyProfile)

| Hook | Variable | Type | Units | Notes |
|------|----------|------|-------|-------|
| useRegister | `thresholdUsd` | **S** | $ | ⚠ Converted via `usdToWad()` — stock |
| useRain | `amountUsd` | **S** | $ | Lump-sum rain — correctly a stock |
| useRain | `wadAmount` | **S** | WAD tokens | Via `usdToWad()` — stock ✓ |
| useSetMyThreshold | `thresholdUsd` | **S** | $ | ⚠ Converted via `usdToWad()` — stock |
| useSetMyAllocations | `percentages[]` | D | 0-100 | Dimensionless ✓ |
| useSetMyAllocations | `wadWeights[]` | D | WAD-scaled fractions | Dimensionless ✓ |
| useSetMyProfile | name, emoji, role | — | strings | No numeric dimension |

---

### 5.12 UI Components

| Component | Value | Type | UI Label | Time Unit? |
|-----------|-------|------|----------|------------|
| **live/page.tsx:336** | `bal` | **S** | "$X" in Balance column | ❌ No |
| **live/page.tsx:339** | `thresh` | **S** | "$X" in Threshold column | ❌ No |
| **live/page.tsx:320** | `bal > thresh` | S vs S | "Overflow" / "Healthy" badge | N/A |
| **live/page.tsx:286** | `flowRateToMonthly(s.rate)` | **F** | "$X/mo" in Active Streams | ✓ Yes! |
| **simulator/page.tsx:207** | `p.balance` | **S** | "Balance" input | ❌ No |
| **simulator/page.tsx:224** | `p.maxThreshold` | **S** | "Max Threshold" input | ❌ No |
| **simulator/page.tsx:184** | `totalFunding` | **S** | "Total Funding: $X" | ❌ No |
| **AllocationEditor.tsx:88** | `minThreshold` | **S** | "Min: $X" | ❌ No |
| **AllocationEditor.tsx:113** | `minThreshold` | **S** | "Min: $X" | ❌ No |
| **RegistrationFlow.tsx:47** | `threshold` (default 8000) | **S** | "Flow-through threshold" | ❌ No (label is best in codebase though) |
| **RegistrationFlow.tsx:164-166** | range 1000-50000 | **S** | "$1,000 - $50,000" | ❌ No |
| **FlowThroughDisplay.tsx:28** | `continued` | **S** | "$X flowed" (past tense) | ❌ Cumulative stock |
| **FlowThroughDisplay.tsx:32** | `retained` | **S** | "$X retained" | ❌ Stock |
| **NetworkGraph.tsx:143** | `bal` | **S** | "$X" under each node | ❌ No |
| **NetworkGraph.tsx:10-14** | `balance > maxThreshold` | S vs S | Red/yellow/green node color | N/A |
| **RainButton.tsx:40** | `amount` | **S** | "$ [input]" | N/A (rain is correctly a stock transfer) |

**The only flow-rate display in the entire UI is `live/page.tsx:286`: `$X/mo` in the Active Streams legend.** Every other numeric display is a bare `$X` with no time unit.

---

### 5.13 API Route (api/network/route.ts)

| Response Field | Line | Type | Units | Notes |
|---------------|------|------|-------|-------|
| `balances[i]` | 95 | **S** | string (USD from formatUnits) | `formatUnits(b, 18)` |
| `thresholds[i]` | 96 | **S** | string (USD from formatUnits) | `formatUnits(t, 18)` |
| `nodeCount` | 97 | D | number | |
| `streams[i].rate` | 101 | **F** | string (raw int96) | ⚠ No unit annotation in API |
| `lastSettle.totalRedistributed` | 107 | **S** | string (USD from formatUnits) | |
| `flowThrough[i]` | 115 | **S** | string (USD from formatUnits) | ⚠ Cumulative stock, not a rate |

---

### 5.14 Deploy Scripts

| Variable | Script | Type | Units | Notes |
|----------|--------|------|-------|-------|
| `STREAM_EPOCH = 30 days` | Both | **T** | seconds (2,592,000) | Stock→flow conversion factor |
| `THRESHOLD = 8000 * WAD` | Both | **S** | WAD tokens | Per-node balance cap |
| Initial balances (6K-10K) | DeployLocal:61-65 | **S** | WAD tokens | Starting wallet balances |
| Reserve (60K) | DeployLocal:68 | **S** | WAD tokens | Contract reserve |

---

## 6. Equation Dimensional Analysis

### 6.1 The Core TBFF Equation

**Solidity** (`TBFFMath.sol:79-130`):
```
newBalances[i] = capToThreshold(balances[i], thresholds[i])
              + Σ_j { distributeOverflow(computeOverflow(balances[j], thresholds[j]), weights[j→i]) }
```

**TypeScript** (`engine.ts:103-149`):
```
newBalances[id] = Math.min(balance, maxThreshold)
               + Σ { overflow_j × weight_j→id }
```

**Dimensional analysis (as implemented — stock model):**
```
[WAD tokens] = min([WAD tokens], [WAD tokens])
             + [dimensionless] × max(0, [WAD tokens] - [WAD tokens])

[WAD tokens] = [WAD tokens] + [dimensionless] × [WAD tokens]
[WAD tokens] = [WAD tokens]  ✓ CONSISTENT (stock + stock = stock)
```

**Dimensional analysis (as intended — flow model):**
```
[WAD/s] = min([WAD/s], [WAD/s])
        + [dimensionless] × max(0, [WAD/s] - [WAD/s])

[WAD/s] = [WAD/s] + [dimensionless] × [WAD/s]
[WAD/s] = [WAD/s]  ✓ ALSO CONSISTENT (rate + rate = rate)
```

**The equation is dimensionally agnostic.** It works with any consistent unit. The problem is not the algebra — it's what we feed into it.

### 6.2 capToThreshold

```
capToThreshold(balance, threshold) = min(balance, threshold)

Stock:  min([$], [$]) = [$]     ✓
Flow:   min([$/s], [$/s]) = [$/s]  ✓
Mixed:  min([$], [$/s]) = ???   ✗ DIMENSIONAL ERROR
```

Currently: stock vs stock. Correct within stock model.

### 6.3 computeOverflow

```
computeOverflow(balance, threshold) = max(0, balance - threshold)

Stock:  max(0, [$] - [$]) = [$]     ✓
Flow:   max(0, [$/s] - [$/s]) = [$/s]  ✓
```

### 6.4 distributeOverflow

```
amounts[i] = (overflow × weights[i]) / WAD

Stock:  ([$] × [D × WAD]) / WAD = [$]   ✓
Flow:   ([$/s] × [D × WAD]) / WAD = [$/s]   ✓
```

### 6.5 The Stock-to-Flow Conversion (TBFFNetwork.sol:494-495)

```solidity
uint256 overflowShare = (overflow * uint256(weight)) / WAD;
targetRate = int96(int256(overflowShare / streamEpoch));
```

```
overflowShare [WAD tokens] = overflow [WAD tokens] × weight [D] / WAD
targetRate [WAD tokens/s] = overflowShare [WAD tokens] / streamEpoch [seconds]

[$] / [s] = [$/s]  ✓ CORRECT CONVERSION
```

This is the only dimensional conversion in the entire system. In the flow model, this division would be unnecessary — the equation output would already be in $/s.

### 6.6 useAnimatedBalances Integration

```typescript
result[addr] = baseUsd + ratePerSec * elapsed;
```

```
[$] = [$] + [$/s] × [s]
[$] = [$] + [$]
[$] = [$]  ✓ CORRECT — the fundamental stock-flow identity
```

### 6.7 flowRateToMonthly Conversion

```typescript
const monthlyWad = flowRate * secondsPerMonth;
return wadToUsd(monthlyWad);
```

```
[WAD tokens/month] = [WAD tokens/s] × [s/month]
[$/month] = wadToUsd([WAD tokens/month])  ✓ CORRECT
```

### 6.8 rain() Distribution

```solidity
uint256 perNode = amount / n;
```

```
[WAD tokens] = [WAD tokens] / [count]
[WAD tokens] = [WAD tokens]  ✓ (count is dimensionless)
```

Rain is correctly a stock transfer (lump-sum injection), not a flow operation.

---

## 7. The Stock-to-Flow Seam

The entire system has exactly one seam where stocks become flows. This is the most critical line in the codebase for understanding the dimensional architecture:

```
TBFFNetwork.sol:495
targetRate = int96(int256(overflowShare / streamEpoch));
```

### Architecture Diagram

```
STOCK DOMAIN                              FLOW DOMAIN
═══════════════════════════════════════════════════════════════

ISuperToken.realtimeBalanceOfNow()
    → availableBalance [WAD tokens]       ← STOCK READ
         │
         ↓
_loadNetworkState(balances)
    → NetworkState {                      ← ALL STOCKS
        balances: [WAD tokens]
        thresholds: [WAD tokens]
        allocWeights: [dimensionless]
      }
         │
         ↓
TBFFMath.converge(state, 20)             ← PURE STOCK MATH
    iterateOnce:
      cap = min(balance, threshold)       [WAD] = min([WAD], [WAD])
      overflow = max(0, balance - threshold)  [WAD] = max(0, [WAD] - [WAD])
      transfer = overflow × weight / WAD  [WAD] = [WAD] × [D] / WAD
    → finalBalances [WAD tokens]          ← STOCK OUTPUT
         │
         │  (used only for lastSettleTotalRedistributed accounting)
         │
_applyRedistribution(currentBalances, finalBalances)
         │
    overflow = computeOverflow(          ← RE-COMPUTED from raw balances
      currentBalances[i], thresholds[i]     (not from convergence output!)
    )
         │
         ↓  overflow [WAD tokens]
         │
         ├─── ★ THE SEAM ──────────────────────────────────────
         │    overflowShare = overflow × weight / WAD   [WAD tokens]
         │    targetRate = overflowShare / streamEpoch  [WAD tokens / seconds]
         │    [WAD tokens] / [seconds] = [WAD tokens/second]
         │
         ↓  targetRate [WAD tokens/second]              ← FLOW VALUE
         │
ICFAv1Forwarder.setFlowrateFrom(targetRate)             ← FLOW WRITE
         │
         ↓
Superfluid CFA Stream created at [WAD tokens/second]
```

### Key Observation: finalBalances is Ignored

In `_applyRedistribution` (line 476), the `finalBalances` parameter is commented out:

```solidity
function _applyRedistribution(
    uint256[] memory currentBalances,
    uint256[] memory /* finalBalances */   // ← IGNORED
) internal {
```

The function recomputes overflow from `currentBalances` (the raw pre-convergence snapshot), not from `finalBalances` (the converged target). This means:

1. The multi-iteration convergence math (`TBFFMath.converge` with up to 20 iterations) runs
2. Its output (`finalBalances`) is only used to compute `lastSettleTotalRedistributed` for display
3. The actual stream rates are derived from a **single-pass** computation on raw balances
4. The convergence math is **decorative**, not operational

This is arguably a bug, or at minimum a design decision that makes the convergence logic serve no functional purpose beyond metrics.

---

## 8. Data Flow Traces

### 8.1 Trace: settle() — Full Execution Path

```
settle() called by anyone
  │
  ├─ [1] _balancesFromChain()
  │     For each node i:
  │       token.realtimeBalanceOfNow(nodes[i])
  │       → (int256 availableBalance, ...)
  │       balances[i] = uint256(max(0, availableBalance))
  │     ⚠ NOTE: realtimeBalanceOfNow returns balance PLUS
  │       integrated streaming since lastUpdated. This is a
  │       "live stock" — it changes every second due to
  │       active Superfluid streams. The snapshot is instantly stale.
  │
  ├─ [2] _loadNetworkState(balances)
  │     Packages: balances[], thresholds[], CSR graph
  │     All in stock domain (WAD tokens)
  │
  ├─ [3] TBFFMath.converge(state, 20)
  │     Iterates the stock-domain equation up to 20 times
  │     Returns: finalBalances[], iterations
  │     ⚠ NOTE: finalBalances is a hypothetical equilibrium
  │       where no node exceeds threshold. It represents
  │       "where balances WOULD be if the system ran to completion."
  │
  ├─ [4] Compute totalRedist
  │     For each i: if (finalBalances[i] > balances[i]):
  │       totalRedist += finalBalances[i] - balances[i]
  │     This is the only use of finalBalances.
  │
  ├─ [5] _applyRedistribution(balances, finalBalances)
  │     ⚠ finalBalances is IGNORED (parameter commented out)
  │     │
  │     For each node i:
  │       overflow = computeOverflow(currentBalances[i], thresholds[i])
  │       │  ← Uses raw snapshot, not converged result
  │       │
  │       if overflow > 0:
  │         cumulativeFlowThrough[nodes[i]] += overflow
  │       │
  │       For each allocation (j, weight) of node i:
  │         overflowShare = overflow × weight / WAD
  │         targetRate = overflowShare / streamEpoch     ★ THE SEAM
  │         │
  │         currentRate = forwarder.getFlowrate(node_i, node_j)
  │         │
  │         if targetRate > 0 && currentRate == 0:
  │           forwarder.setFlowrateFrom(..., targetRate)  → CREATE
  │         elif targetRate > 0 && currentRate != targetRate:
  │           forwarder.setFlowrateFrom(..., targetRate)  → UPDATE
  │         elif targetRate == 0 && currentRate > 0:
  │           forwarder.setFlowrateFrom(..., 0)           → DELETE
  │
  └─ [6] Record metadata
        lastSettleTimestamp, lastSettleIterations,
        lastSettleConverged, lastSettleTotalRedistributed
```

### 8.2 Trace: Registration → On-Chain to UI

```
User fills RegistrationFlow form:
  name: "Alice"
  emoji: "🌿"
  role: "Developer"
  threshold: 8000 (slider, no time unit shown)
    │
    ↓
useRegister.register(8000, "Alice", "🌿", "Developer")
    │
    ├─ Step 1: grantPermissions(SUPER_TOKEN, TBFF_NETWORK)
    │     → Allows network to manage streams on behalf of user
    │
    └─ Step 2: selfRegister(usdToWad(8000), "Alice", "🌿", "Developer")
         │     usdToWad(8000) = 8000e18 WAD tokens ← STOCK
         │
         ↓ On-chain:
         thresholds.push(8000e18)           ← stored as STOCK
         profiles[msg.sender] = Profile(...)
         token.transfer(msg.sender, 100e18) ← SEED (stock transfer)
    │
    ↓
API route reads: getNetworkState()
    thresholds[i] → formatUnits(t, 18) → "8000.0" ← STOCK string
    │
    ↓
live/page.tsx displays:
    thresh = Number("8000.0") = 8000
    "$8,000" in Threshold column ← NO TIME UNIT
```

### 8.3 Trace: Where Flow Rates Actually Live

```
Superfluid CFA creates streams between nodes.

useSuperfluidStreams() reads via contract:
    getActiveStreams() → rates[] (int96, WAD tokens/second)
    │
    ↓
StreamInfo.rate: bigint   ← TRUE FLOW (WAD/second)

useAccountFlowInfo() reads via CFA forwarder:
    getAccountFlowInfo(token, account)
    → netFlowRate: int96  ← TRUE FLOW (WAD/second)
    │
    ↓
Two consumers:

1. useAnimatedBalances.ts:
   ratePerSec = wadToUsd(netFlowRate)   ← FLOW ($/second)
   animated[addr] = baseUsd + ratePerSec × elapsed  ← CORRECT

2. live/page.tsx:286 (Active Streams legend):
   flowRateToMonthly(s.rate)  ← FLOW ($/month)
   Display: "$X/mo"           ← CORRECT
```

These genuine flow rates from Superfluid **never enter the convergence math**. The engine takes balance snapshots (stocks), not flow rate summaries (flows). The flow rates are display-only.

---

## 9. Inconsistencies and Missing Concepts

### 9.1 minThreshold: The Ghost Variable

**Where it exists:**
- `engine.ts:24` — `minThreshold: number; // display only in Phase 1`
- `mock-data.ts:15,29,43,56,70` — `minThreshold: 3000` (all five participants)
- `chain-bridge.ts:120` — `minThreshold: 3000` (hardcoded in `bridgeToParticipant`)
- `chain-bridge.ts:149` — `minThreshold: 3000` (hardcoded in `profileToParticipant`)
- `AllocationEditor.tsx:88` — `Min: ${participant.minThreshold.toLocaleString()}`
- `AllocationEditor.tsx:113` — `Min: ${participant.minThreshold.toLocaleString()}`

**Where it does NOT exist:**
- TBFFMath.sol — not in `NetworkState`, not in any function
- TBFFNetwork.sol — no storage, no parameter, no comparison
- `engine.ts` functions — not used in `capToThreshold`, `computeOverflow`, `iterateOnce`, `converge`
- Any test file — never tested because it's never used
- Registration UI — not collected from user

**Impact:** A participant cannot signal "I need at least $3K/month to justify participating." The concept exists in the data model but has zero mathematical or contractual presence.

### 9.2 cumulativeFlowThrough: Stock Named as Flow

**Location:** `TBFFNetwork.sol:50`
```solidity
mapping(address => uint256) public cumulativeFlowThrough; // WAD lifetime total
```

**Reality:** This is a cumulative stock — the running total of all overflow that has ever passed through a node across all `settle()` calls. It increases monotonically and never decreases. It is not a rate.

**The word "flow" in the name suggests a rate ($/month flowing through right now).** A genuine "flow-through rate" would be: "how fast is money currently routing through this node?" — measured in WAD/second, derived from active streams.

**UI display** (`FlowThroughDisplay.tsx:28`): `$X flowed` — uses past tense, implying accumulation. This is semantically correct for a cumulative stock but misleading given the component name "FlowThroughDisplay."

### 9.3 _applyRedistribution Ignores Convergence Output

**Location:** `TBFFNetwork.sol:476`
```solidity
function _applyRedistribution(
    uint256[] memory currentBalances,
    uint256[] memory /* finalBalances */
) internal {
```

The convergence computation runs up to 20 iterations to find the equilibrium balance vector. But `_applyRedistribution` only uses the raw pre-convergence `currentBalances` to compute overflow and set stream rates.

**Consequence:** In a network with cycles (A→B→C→A), a single pass of overflow from A only reaches B. The convergence math would propagate B's excess to C, and C's to A. But since `_applyRedistribution` ignores this, only the first-hop redistribution is captured in stream rates.

This matters for the 5-person Mycopunks network where all nodes have cross-allocations. If Christina ($10K) overflows to Simon (30%), and Simon's resulting balance exceeds his threshold, the convergence math would propagate Simon's excess onward. But the stream setup only captures Christina→Simon, not the cascading second-hop.

### 9.4 No Time Unit in Any UI Display

Every threshold and balance throughout the UI is displayed as `$X,XXX` with no time period qualifier:

- Simulator: "Balance" and "Max Threshold" inputs — bare `$X`
- Live page: Balance and Threshold columns — bare `$X`
- Registration: "Flow-through threshold" slider — `$1,000 - $50,000`
- Registration: helper text — "Funds above this amount flow through"
- AllocationEditor: "Min: $3,000" — bare `$X`
- NetworkGraph: `$X` under each node circle

**The sole exception:** Active Streams legend: `$X/mo` — correctly displays a flow rate with time unit.

### 9.5 WAD Conversion Has No Type Safety

`wadToUsd` and `usdToWad` in `chain-bridge.ts` accept any `bigint`/`number`. There is no TypeScript type that distinguishes:
- `WADBalance` (a stock: how many tokens you hold)
- `WADFlowRate` (a flow: tokens per second)

Both are just `bigint`. Passing a flow rate into `wadToUsd` produces a number in $/second — numerically correct but semantically ambiguous. The codebase relies on programmer discipline to use `flowRateToMonthly` for rates and `wadToUsd` for balances, but nothing enforces this.

### 9.6 Temporal Fragility of Stock-Based Settlement

`_balancesFromChain()` reads `realtimeBalanceOfNow` for each node. Superfluid's `realtimeBalanceOfNow` returns the balance including all streaming activity up to the current second. Between the moment balances are read and the moment streams are set, the balances have already changed due to ongoing streams.

In the flow model, this problem disappears: stream rates don't change between `settle()` calls (they're constant until modified). Reading `getAccountFlowInfo` returns a stable rate, not a drifting balance.

### 9.7 Missing: Per-Node Income Rate

No variable or function in the codebase computes or stores a per-node net income rate. The closest is `useAccountFlowInfo.netFlowRate` from Superfluid, but this is only used for the animation hook — never for redistribution logic.

To implement the flow model, the system would need:
```solidity
// For each node: sum of all inbound stream rates
function getNetIncomeRate(address node) → int96
```

### 9.8 Missing: Current Flow-Through Rate

`cumulativeFlowThrough` tracks lifetime total overflow (a stock). There is no variable for "how much $/month is currently routing through this node" (a flow). This would be:

```
currentFlowThroughRate[i] = Σ_j { streamRate(node_i → node_j) }
```

The sum of all outbound stream rates from a node represents how fast money currently flows through it.

### 9.9 Missing: Retained vs Flowing Display

The UI shows cumulative "flowed" and point-in-time "retained" (`FlowThroughDisplay.tsx`), but doesn't show current flow rates through a node. A complete display would have:
- **Balance** (stock): How much you hold right now — `$X`
- **Income rate** (flow): How fast money flows in — `$X/mo`
- **Outflow rate** (flow): How fast money flows out to allocations — `$X/mo`
- **Net rate** (flow): Income minus outflow — `$X/mo`
- **Retained** (stock): min(balance, threshold) — `$X`
- **Lifetime throughput** (stock): Total historical overflow — `$X total`

---

## 10. The Three-Zone Threshold Model

The intended model creates three behavioral zones per participant based on their income flow rate:

```
Income Rate (f_i)
────────────────────────────────────────────────────────────
│                                                           │
│  ZONE 1: f_i < minThreshold_i                            │
│  "Not Yet Sustainable"                                    │
│                                                           │
│  Behavior:                                                │
│  - Node is a net receiver                                 │
│  - Does NOT contribute overflow to allocations            │
│  - All income is retained (building toward sustainability)│
│  - overflow_i = 0  (regardless of balance level)          │
│  - Signal: "I haven't reached the level where it's        │
│    worthwhile for me to focus on the network yet."        │
│                                                           │
├─── minThreshold_i ────────────────────────────────────────│
│                                                           │
│  ZONE 2: minThreshold_i ≤ f_i ≤ maxThreshold_i           │
│  "Active and Contributing"                                │
│                                                           │
│  Behavior:                                                │
│  - Node is active in the network                          │
│  - Retains all income (still below lifestyle optimum)     │
│  - May start contributing and withdrawing                 │
│  - overflow_i = 0  (income below max, nothing to redirect)│
│  - Signal: "My needs are being met. I can contribute."    │
│                                                           │
├─── maxThreshold_i ────────────────────────────────────────│
│                                                           │
│  ZONE 3: f_i > maxThreshold_i                             │
│  "Thriving — Excess Flows Through"                        │
│                                                           │
│  Behavior:                                                │
│  - Node retains up to maxThreshold income rate            │
│  - Excess: overflow_i = f_i - maxThreshold_i              │
│  - Overflow flows to allocation targets                   │
│  - Signal: "I've reached my optimal lifestyle.            │
│    Excess is more valuable flowing to my network."        │
│                                                           │
────────────────────────────────────────────────────────────
```

### Modified Equation

The core equation gains a gating condition on minThreshold:

```
For each node i:
  if f_i < t_min_i:
    overflow_i = 0                       // Zone 1: inactive
  else:
    overflow_i = max(0, f_i - t_max_i)   // Zone 2 or 3

  retention_i = f_i - overflow_i

Redistribution:
  f^(k+1) = retention + P^T · overflow
```

In Solidity, this would modify `computeOverflow` or add a wrapper:

```solidity
function computeOverflowWithGate(
    uint256 incomeRate,
    uint256 minThreshold,
    uint256 maxThreshold
) internal pure returns (uint256) {
    if (incomeRate < minThreshold) return 0;  // Zone 1: inactive
    return incomeRate > maxThreshold
        ? incomeRate - maxThreshold            // Zone 3: excess
        : 0;                                   // Zone 2: retaining
}
```

### Numeric Example (Flow-Based)

Using monthly rates for readability (on-chain would be WAD/second):

| Node | Income Rate | Min Threshold | Max Threshold | Zone | Overflow Rate | Retained Rate |
|------|------------|---------------|---------------|------|--------------|---------------|
| Shawn | $6,000/mo | $3,000/mo | $8,000/mo | Zone 2 (Active) | $0/mo | $6,000/mo |
| Jeff | $5,000/mo | $3,000/mo | $8,000/mo | Zone 2 (Active) | $0/mo | $5,000/mo |
| Darren | $4,000/mo | $3,000/mo | $8,000/mo | Zone 2 (Active) | $0/mo | $4,000/mo |
| Simon | $7,000/mo | $3,000/mo | $8,000/mo | Zone 2 (Active) | $0/mo | $7,000/mo |
| Christina | $10,000/mo | $3,000/mo | $8,000/mo | Zone 3 (Overflow) | $2,000/mo | $8,000/mo |

Christina's $2,000/mo overflow distributes per her allocations:
- Simon: 30% → $600/mo
- Darren: 30% → $600/mo
- Jeff: 20% → $400/mo
- Shawn: 20% → $400/mo

### Contrast: New Participant Below Min

| Node | Income Rate | Min Threshold | Max Threshold | Zone | Overflow Rate |
|------|------------|---------------|---------------|------|--------------|
| Alice | $1,500/mo | $3,000/mo | $8,000/mo | Zone 1 (Building) | $0/mo |

Alice receives income but doesn't yet redistribute any overflow. She's building toward sustainability. Once her income rate crosses $3,000/mo, she enters Zone 2 and becomes an active contributor.

---

## 11. Causal Loop Diagram

### Complete Stock-Flow Structure

```
                    ┌─────────────────────┐
                    │   External Funding   │
                    │   (grants, revenue)  │
                    └──────────┬──────────┘
                               │
                         [Inflow Rate]
                               │ (FLOW: $/month)
                               ▼
                    ┌─────────────────────┐
                    │   Node i Balance    │◄─── rain() injection (STOCK: one-time)
                    │   (STOCK: $)        │
                    └──────────┬──────────┘
                               │
                    ┌──────────┼──────────┐
                    │          │          │
              [compare]   [compare]   [compare]
                    │          │          │
                    ▼          ▼          ▼
            ┌──────────┐ ┌─────────┐ ┌─────────────┐
            │ Zone 1?  │ │ Zone 2? │ │  Zone 3?    │
            │ f < min  │ │ min≤f≤max│ │  f > max    │
            └──────────┘ └─────────┘ └──────┬──────┘
                                            │
                                     [Overflow Rate]
                                            │ (FLOW: $/month)
                                            ▼
                                   ┌────────────────┐
                                   │  Allocation     │
                                   │  Matrix P       │
                                   │  (DIMENSIONLESS)│
                                   └───────┬────────┘
                                           │
                              ┌────────────┼────────────┐
                              │            │            │
                              ▼            ▼            ▼
                     [Stream to j1]  [Stream to j2]  [Stream to j3]
                     (FLOW: WAD/s)   (FLOW: WAD/s)   (FLOW: WAD/s)
                              │            │            │
                              ▼            ▼            ▼
                    ┌─────────────┐ ┌──────────┐ ┌──────────┐
                    │ Node j1     │ │ Node j2  │ │ Node j3  │
                    │ Balance     │ │ Balance  │ │ Balance  │
                    │ (STOCK: $)  │ │ (STOCK)  │ │ (STOCK)  │
                    └─────────────┘ └──────────┘ └──────────┘


Feedback loops:
  - Node j receives overflow → j's income rate increases
  - If j enters Zone 3 → j overflows to ITS targets
  - Cascading redistribution through the network
  - Convergence: system reaches equilibrium when no node overflows

Stocks:
  [█] = Balance per node (accumulation)
  [█] = Network reserve (accumulation)
  [█] = Cumulative flow-through (accumulation, monotonic)

Flows:
  ─── = Income rate per node
  ─── = Overflow rate per node
  ─── = Stream rate per allocation edge
  ─── = rain() injection rate (episodic, not continuous)

Constants:
  ○ = minThreshold per node (flow rate floor)
  ○ = maxThreshold per node (flow rate ceiling)
  ○ = Allocation weights (dimensionless)
  ○ = SEED_AMOUNT (stock, one-time)
```

### The Missing Feedback Loop

In the flow model, the feedback is clean:
1. External funding flows into nodes
2. Nodes above maxThreshold overflow to their allocations
3. Receiving nodes' income rates increase
4. If they cross maxThreshold, they overflow too
5. Convergence: no more nodes above maxThreshold

In the stock model, the feedback is temporal:
1. External funding accumulates as balance
2. settle() reads balances, computes overflow
3. Creates streams that gradually drain the overflow
4. Over `streamEpoch` (30 days), balances shift
5. Next settle() sees updated balances
6. But balances drift continuously between settle() calls

The flow model has **instantaneous feedback** (rate in → rate out). The stock model has **delayed feedback** (accumulate → settle → stream → accumulate → settle).

---

## 12. Recommendations

### 12.1 Immediate: Make minThreshold a First-Class Concept

**Difficulty:** Medium
**Impact:** Unlocks the three-zone model and allows participants to signal their sustainability needs.

Changes needed:
- **Contract:** Add `minThresholds[]` storage array parallel to `thresholds[]`. Modify `selfRegister()` and `registerNode()` to accept both min and max. Modify or add a gating check in `_applyRedistribution`.
- **Engine:** Use `minThreshold` in `computeOverflow` or a wrapper function.
- **UI:** Add minThreshold input to registration form and profile editor. Display zone status per node.
- **Tests:** Test all three zones and boundary conditions.

### 12.2 Strategic: Move from Stock-Based to Flow-Based Convergence

**Difficulty:** High
**Impact:** Fundamental architectural alignment between implementation and intended model.

Changes needed:
- **Data source:** Replace `_balancesFromChain()` with `_flowRatesFromChain()` using `getAccountFlowInfo`.
- **Storage:** Store thresholds as WAD/second rates instead of WAD token amounts.
- **Math:** The equation algebra is unchanged. Only the input vectors change from balances to rates.
- **Stream setting:** Remove the `/ streamEpoch` conversion. Convergence output IS the stream rate directly.
- **Constants:** `MIN_THRESHOLD` and `MAX_THRESHOLD` become flow rates. $1K/month = `(1000 × 1e18) / (30 × 24 × 3600)` WAD/second.
- **UI:** All threshold displays gain `/month` suffixes. Simulator inputs labeled as income rates.
- **TypeScript engine:** `Participant.balance` becomes `Participant.incomeRate`. `maxThreshold` units documented as $/month.
- **Tests:** All numeric values reframed as rates.

### 12.3 Tactical: Fix `_applyRedistribution` to Use Convergence Output

**Difficulty:** Low
**Impact:** Makes the convergence math operational instead of decorative.

Currently `finalBalances` is ignored. The function should use `finalBalances` (or the equivalent flow rates) to compute target streams that account for multi-hop cascading redistribution, not just single-pass overflow.

### 12.4 Hygiene: Add Time Units to All UI Displays

**Difficulty:** Low
**Impact:** Users can understand whether they're looking at stocks or flows.

- Threshold displays: `$8,000/mo` instead of `$8,000`
- Income rate displays: `$6,000/mo` instead of `$6,000`
- Balance displays: remain as `$6,000` (correctly a stock)
- Registration: "Monthly income threshold" instead of "Flow-through threshold"

### 12.5 Type Safety: Branded Types for WAD Values

**Difficulty:** Low
**Impact:** Prevents accidental stock/flow confusion in TypeScript.

```typescript
type WADBalance = bigint & { readonly __brand: 'WADBalance' };
type WADFlowRate = bigint & { readonly __brand: 'WADFlowRate' };

function wadBalanceToUsd(wad: WADBalance): number { ... }
function wadFlowRateToMonthly(rate: WADFlowRate): number { ... }
```

This uses TypeScript's branded/opaque type pattern to prevent passing a flow rate into a balance conversion function.

### 12.6 Rename: `cumulativeFlowThrough` → `cumulativeOverflowTotal`

**Difficulty:** Low
**Impact:** Naming accuracy. The variable stores a cumulative stock total of all overflow amounts, not a flow rate.

---

## 13. File-by-File Reference

### Files with Stock/Flow Issues (Ranked by Impact)

| Rank | File | Issue Summary |
|------|------|--------------|
| 1 | `contracts/src/libraries/TBFFMath.sol` | Entire library operates in stock domain. `NetworkState.balances[]` and `.thresholds[]` are stocks. No flow concepts. |
| 2 | `contracts/src/TBFFNetwork.sol` | `thresholds[]` stored as stocks. `_applyRedistribution` ignores convergence output. `cumulativeFlowThrough` is a misleadingly-named stock. Line 495 is the sole stock→flow conversion. |
| 3 | `web/src/lib/tbff/engine.ts` | `Participant.balance` and `.maxThreshold` are stocks. `minThreshold` exists but is dead code (line 24: "display only"). All functions operate on stocks. |
| 4 | `web/src/lib/tbff/chain-bridge.ts` | `minThreshold: 3000` hardcoded twice (lines 120, 149). `wadToUsd` has no type distinction between stock WAD and rate WAD. |
| 5 | `web/src/lib/tbff/mock-data.ts` | All values are stocks. `minThreshold: 3000` hardcoded for all participants. Comment "Total funding: $32,000" uses stock framing. |
| 6 | `web/src/app/live/page.tsx` | Displays balances and thresholds as bare `$X` with no time unit. `isOverflowing = bal > thresh` is stock-vs-stock comparison. |
| 7 | `web/src/app/simulator/page.tsx` | "Balance" and "Max Threshold" inputs have no time unit. Entire simulator operates in stock domain. |
| 8 | `web/src/components/FlowThroughDisplay.tsx` | Name says "flow" but displays cumulative stock and point-in-time retained stock. |
| 9 | `web/src/components/RegistrationFlow.tsx` | Threshold input is stock-framed ($1K-$50K, no `/month`). Best label in codebase ("Flow-through threshold") but still no time unit. |
| 10 | `web/src/components/AllocationEditor.tsx` | Displays `Min: $3,000` from dead `minThreshold` field. No time unit. |

### Files That Are Correct

| File | Why It's Correct |
|------|-----------------|
| `web/src/lib/hooks/useAnimatedBalances.ts` | Correctly integrates flow rate × time into stock: `base + rate × elapsed` |
| `web/src/lib/hooks/useSuperfluidStreams.ts` | Works with genuine Superfluid flow rates (WAD/s). `StreamInfo.rate` is a real flow. |
| `web/src/lib/tbff/allocation-utils.ts` | Pure dimensionless weight normalization. No stock/flow issue. |
| `web/src/lib/hooks/useSetMyAllocations.ts` | Pure dimensionless percentage→WAD conversion. No stock/flow issue. |
| `web/src/lib/hooks/useSetMyProfile.ts` | String-only. No numeric dimension. |
| `web/src/lib/hooks/useRain.ts` | Rain is correctly a stock transfer (lump-sum injection). No confusion. |
| `web/src/components/RainButton.tsx` | Rain amount is correctly a stock (one-time token injection). |

---

## Appendix A: The Relationship Between Stock and Flow Thresholds

If the system period is fixed (e.g., 30 days = `STREAM_EPOCH`), there is a simple conversion:

```
flowThreshold [$/month] = stockThreshold [$] / period [months]
```

For the current values:
```
Stock: maxThreshold = $8,000  (balance cap)
Period: 30 days ≈ 1 month
Flow: maxThreshold = $8,000/month  (income rate cap)
```

**The numbers are coincidentally the same** when the period is exactly 1 month. This makes the stock model and flow model produce similar results for monthly time horizons. The difference becomes apparent at different time scales or when examining the system's behavior between settle() calls.

## Appendix B: Complete List of Hardcoded `3000` (minThreshold)

```
web/src/lib/tbff/mock-data.ts:15     minThreshold: 3000,
web/src/lib/tbff/mock-data.ts:29     minThreshold: 3000,
web/src/lib/tbff/mock-data.ts:43     minThreshold: 3000,
web/src/lib/tbff/mock-data.ts:56     minThreshold: 3000,
web/src/lib/tbff/mock-data.ts:70     minThreshold: 3000,
web/src/lib/tbff/chain-bridge.ts:120 minThreshold: 3000,
web/src/lib/tbff/chain-bridge.ts:149 minThreshold: 3000,
```

Total: 7 hardcoded instances, 0 on-chain storage, 0 equation references.

## Appendix C: Complete List of `$8,000` Threshold Appearances

**On-chain:**
```
contracts/src/TBFFNetwork.sol:52       MIN_THRESHOLD = 1_000 * 1e18  ($1K floor on user-set max)
contracts/src/TBFFNetwork.sol:53       MAX_THRESHOLD = 50_000 * 1e18 ($50K ceiling on user-set max)
contracts/test/unit/TBFFNetworkUnit.t.sol:26  THRESHOLD = 8000 * WAD
contracts/script/DeployLocal.s.sol:15  THRESHOLD = 8000 * WAD
contracts/script/Deploy.s.sol:*        THRESHOLD = 8000 * WAD
```

**TypeScript:**
```
web/src/lib/tbff/mock-data.ts         maxThreshold: 8000 (all 5 participants)
web/src/components/RegistrationFlow.tsx:47  threshold: 8000 (default state)
```

All stored and used as stocks (WAD token amounts or dollar amounts). None annotated as rates.
