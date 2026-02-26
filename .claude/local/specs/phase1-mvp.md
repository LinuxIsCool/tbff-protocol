# Phase 1 MVP: TBFF Core Engine + Browser Simulator

**Status:** Revised (v2)
**Target:** Demo + Working Prototype + Developer Foundation
**Chain:** Anvil (primary) + Base Sepolia (fork tests)
**UI:** Minimal functional (Tailwind + shadcn/ui)
**Source:** Hybrid of Playbook 2 (contract architecture) + Playbook 1 (web simulator)

---

## Overview

Phase 1 establishes the mathematical and computational foundation of Threshold-Based Flow Funding. It delivers two packages in a monorepo:

1. **`contracts/`** — A Foundry package containing `TBFFMath.sol`, a pure Solidity library implementing the core TBFF equation with comprehensive fuzz testing
2. **`web/`** — A Next.js 14 browser simulator that implements the same algorithm in TypeScript, providing visual proof-of-correctness independent of the blockchain

The TypeScript simulator serves as the **reference implementation** that every subsequent Solidity contract is tested against. The conservation-of-funds fuzz test (`sum(final) == sum(initial)`) is the single most important invariant in the entire protocol.

### The Core Equation

```
x^(k+1) = min(x^(k), t) + P^T · max(0, x^(k) - t)
```

Where:
- `x^(k)` — vector of account balances at iteration k
- `t` — vector of maximum thresholds
- `P` — normalized allocation matrix (P[i][j] = what % of i's overflow goes to j)
- `min`, `max` — element-wise operations
- Convergence: iterate until no overflow changes or max iterations reached

### Scope Clarification: What Phase 1 Computes

Phase 1 implements **only the overflow redistribution equation above**. It takes a set of balances and thresholds and redistributes overflow until convergence.

It does **not** implement the initial funding distribution algorithm (Playbook 1's three-phase "meet minimums first, then fill capacity, then handle overflow"). That is a higher-level orchestration concern for Phase 2+.

The **min threshold** appears in the mock data for display purposes (the simulator shows whether a participant is below their sustainability floor), but it does not participate in the Phase 1 math. The equation only uses max thresholds (`t`). Min thresholds will become inputs to the distribution algorithm in Phase 2.

---

## Package 1: `contracts/` (Foundry)

### 1.1 Project Setup

Initialize Foundry project with **no external dependencies** — TBFFMath.sol is a pure math library that imports nothing.

```bash
forge init contracts
```

Superfluid and OpenZeppelin are deferred to Phase 2 when contracts need them.

Configure `foundry.toml`:
- Solidity 0.8.30, EVM target `cancun`
- Fuzz runs: 256 (default), configurable up to 10,000
- Invariant runs: 512, depth: 50

### 1.2 `src/libraries/TBFFMath.sol`

A **pure** Solidity library (no storage, no state). All computation happens in memory.

**Structs:**
```solidity
/// Storage-optimized struct: packs into one 256-bit slot (160 + 96 = 256)
struct Allocation {
    address target;
    uint96 weight; // WAD: 1e18 = 100%
}

/// In-memory representation of the full network for computation.
/// The calling contract loads from storage into this struct once,
/// passes it to converge(), and writes results back to storage once.
struct NetworkState {
    uint256 n;                      // number of nodes
    uint256[] balances;             // balances[i] for node i
    uint256[] thresholds;           // max thresholds[i] for node i
    uint256[] allocTargets;         // flat list of allocation target indices
    uint96[] allocWeights;          // flat list of allocation weights (parallel to allocTargets)
    uint256[] allocOffsets;         // allocOffsets[i] = start index in allocTargets for node i
                                    // node i's allocations: allocTargets[allocOffsets[i]..allocOffsets[i+1]]
}
```

The `NetworkState` flattened representation avoids Solidity's prohibition on memory mappings. The offset array gives O(1) access to each node's allocations — the same technique used in CSR (Compressed Sparse Row) sparse matrix format.

**Functions:**

| Function | Signature | Description |
|---|---|---|
| `capToThreshold` | `(uint256 balance, uint256 threshold) internal pure returns (uint256)` | `min(balance, threshold)` |
| `computeOverflow` | `(uint256 balance, uint256 threshold) internal pure returns (uint256)` | `max(0, balance - threshold)` |
| `distributeOverflow` | `(uint256 overflow, uint96[] memory weights) internal pure returns (uint256[] memory)` | Multiply overflow by each weight (WAD), return distribution array |
| `iterateOnce` | `(NetworkState memory state) internal pure returns (uint256[] memory newBalances, bool changed)` | One full pass of the TBFF equation, all in memory |
| `converge` | `(NetworkState memory state, uint256 maxIterations) internal pure returns (uint256[] memory finalBalances, uint256 iterations)` | Loop `iterateOnce` until `!changed` or `maxIterations` reached |

**Implementation constraints:**
- All functions are `internal pure` — no storage reads, no side effects
- Use `unchecked` math for loop counters only
- WAD (1e18) for all fixed-point operations
- The calling contract (in Phase 2+) is responsible for loading storage into `NetworkState` and writing results back
- `distributeOverflow` must guarantee: `sum(outputs) <= overflow` (rounding loss max 1 wei per recipient)
- `iterateOnce` reads `state.balances`, computes new balances, returns a new array (does not mutate input)

### 1.3 `test/unit/TBFFMath.t.sol`

**Concrete tests:**

| Test | What it proves |
|---|---|
| `test_capToThreshold` | Known values: cap(150, 100) = 100, cap(50, 100) = 50, cap(100, 100) = 100 |
| `test_computeOverflow` | Known values: overflow(150, 100) = 50, overflow(50, 100) = 0 |
| `test_distributeOverflow` | Sum of outputs == overflow (within 1 wei per recipient) |
| `test_threeNodeConvergence` | A→B→C linear chain converges correctly with known values |
| `test_circularAllocation` | A→B→C→A cycle converges (funds don't multiply) |
| `test_singleNodeSelfAllocation` | 100% self-allocation: balance stays at threshold, no amplification |
| `test_zeroOverflow` | All below threshold: single iteration, no changes |

**Fuzz tests:**

| Test | Invariant |
|---|---|
| `testFuzz_conservationOfFunds` | `sum(finalBalances) == sum(initialBalances)` within 1 wei tolerance per node |
| `testFuzz_allBelowThreshold` | After convergence, every balance <= its threshold |
| `testFuzz_convergenceTerminates` | `converge()` always terminates within `maxIterations` |
| `testFuzz_distributionSumCorrect` | `sum(distributeOverflow outputs) <= overflow`, deficit <= N wei |

Use `bound()` to constrain inputs:
- Balances: 1e15 to 1e24
- Thresholds: 1e15 to 1e24 (threshold >= 1e15)
- Nodes: 2 to 20
- Weights: each 0 to 1e18, sum = 1e18

### 1.4 Gas Snapshots

Wrap key operations in `vm.startSnapshotGas` / `vm.stopSnapshotGas`:
- `converge_3nodes_linear`
- `converge_5nodes_diamond`
- `converge_10nodes_random`
- `converge_20nodes_random`
- `converge_50nodes_random`

These snapshots validate the feasibility claim: ~1.2M gas for 100 nodes on L2.

---

## Package 2: `web/` (Next.js 14)

### 2.1 Project Setup

```bash
npx create-next-app@14 web --typescript --tailwind --app --src-dir
cd web
npx shadcn@latest init
```

Dependencies:
- `next@14`, `react@18`, `typescript`
- `tailwindcss`, `@shadcn/ui` components (button, card, slider, input, table, badge, separator)
- No D3, no wagmi, no blockchain libs — this is a pure TypeScript simulator

### 2.2 TypeScript TBFF Engine — `src/lib/tbff/`

Mirror the Solidity library in TypeScript.

**Precision strategy:** TypeScript uses `number` (float64) with dollar amounts. This gives 15-16 significant digits — more than sufficient for monetary amounts up to $1 trillion with cent precision. Cross-validation with Solidity (which uses uint256/WAD) must account for rounding: tolerance is **$0.01 per node** (1 cent). Tests compare at dollar precision, not wei precision.

**`engine.ts`:**

```typescript
interface Allocation {
  target: string;  // participant ID
  weight: number;  // 0-1 (1 = 100%)
}

interface Participant {
  id: string;
  name: string;
  emoji: string;
  role: string;
  balance: number;         // current balance (dollars)
  minThreshold: number;    // sustainability floor (dollars) — display only in Phase 1
  maxThreshold: number;    // overflow ceiling (dollars) — used by the equation
  allocations: Allocation[];
}

interface IterationSnapshot {
  iteration: number;
  balances: Record<string, number>;
  overflows: Record<string, number>;
  transfers: { from: string; to: string; amount: number }[];
  changed: boolean;
}

interface ConvergenceResult {
  finalBalances: Record<string, number>;
  iterations: number;
  converged: boolean;
  snapshots: IterationSnapshot[];
  totalRedistributed: number;
}

function capToThreshold(balance: number, threshold: number): number;
function computeOverflow(balance: number, threshold: number): number;
function distributeOverflow(overflow: number, weights: number[]): number[];
function iterateOnce(participants: Participant[]): { newBalances: Record<string, number>; changed: boolean; snapshot: IterationSnapshot };
function converge(participants: Participant[], maxIterations?: number): ConvergenceResult;
```

**`mock-data.ts`:**

8 participants with realistic cross-allocations:

| Name | Role | Emoji | Min $/mo | Max $/mo | Allocations |
|---|---|---|---|---|---|
| Ygg | AI Infrastructure | 🌲 | 3,000 | 6,000 | Eve 30%, Artem 40%, Darren 30% |
| Eve | Community Design | 🌿 | 2,000 | 4,500 | Kwaxala 50%, Regen CoLab 50% |
| Artem | Protocol Research | 🔬 | 2,500 | 5,000 | Ygg 30%, Cascadia 40%, Eve 30% |
| Carol Anne | Indigenomics | 🪶 | 3,500 | 7,000 | Kwaxala 60%, Cascadia 40% |
| Darren | GPU Engineering | ⚡ | 2,800 | 5,500 | Ygg 50%, Artem 50% |
| Cascadia Fund | Bioregional Commons | 🏔️ | 5,000 | 12,000 | Kwaxala 30%, Regen CoLab 30%, Carol Anne 40% |
| Regen CoLab | Registry Systems | ♻️ | 4,000 | 8,000 | Artem 40%, Eve 30%, Cascadia 30% |
| Kwaxala | Forest Alliance | 🌳 | 2,000 | 5,000 | Carol Anne 50%, Cascadia 50% |

Sum of minimums: $24,800/mo
Sum of maximums: $53,000/mo

### 2.3 Simulator Page — `src/app/simulator/page.tsx`

A single-page application with three panels:

**Panel 1: Input Configuration**
- List of participants with editable: name, initial balance, minThreshold (display), maxThreshold (used by equation)
- Allocation matrix editor: for each participant, set % allocations to others (must sum to 100%)
- "Total External Funding" slider: $10,000 to $80,000/month
- Pre-loaded with mock data, fully editable
- Add/remove participant buttons

**Panel 2: Visualization**
- Node-link diagram (SVG, no D3 dependency):
  - **Layout:** Circular layout — nodes positioned equally spaced on a circle (radius proportional to viewport). This is deterministic, requires no force simulation, and works for up to ~15 nodes. For Phase 1 with 8 mock participants, this is ideal.
  - Circles for nodes, radius proportional to maxThreshold, colored by status:
    - Green: balance <= maxThreshold (healthy)
    - Yellow: balance > maxThreshold * 0.8 (approaching overflow)
    - Red: balance > maxThreshold (overflowing, pre-redistribution)
    - Teal: balance was reduced by redistribution (received or gave overflow)
  - Node label: emoji + name inside/below the circle
  - Lines for allocation edges, thickness proportional to weight
  - Directed arrows (SVG markers) showing allocation direction
  - Curved paths (quadratic bezier) to distinguish bidirectional edges (A→B and B→A)
- Step-through controls:
  - "Next Iteration" button showing balance changes per step
  - "Run All" button to converge
  - "Reset" to go back to initial state
  - Iteration counter and convergence status indicator

**Panel 3: Data Table**
- Table of balances at each iteration step
- Columns: Participant | Initial | Iter 1 | Iter 2 | ... | Final | Δ
- Highlight cells that changed in each iteration
- Summary row: Total (must be constant — conservation proof)
- Metrics: iterations to convergence, total overflow redistributed, max overflow in any iteration

### 2.4 Layout

Minimal layout:
- Top bar: "TBFF Simulator" title + "Phase 1 MVP" badge
- No sidebar, no auth, no wallet connection
- Responsive: stacks panels vertically on mobile
- Dark mode default using Tailwind `dark` class

### 2.5 Tests — `src/lib/tbff/__tests__/engine.test.ts`

Using Vitest:

| Test | What it proves |
|---|---|
| `underfunded scenario` | When inflow < sum(thresholds): no redistribution needed, all balances stay |
| `exact funding` | When all balances == thresholds: zero overflow, single iteration |
| `overfunded linear` | A→B→C chain: overflow cascades correctly |
| `circular allocations` | A→B→C→A cycle: converges, no infinite loop |
| `self-allocation` | 100% self-allocation: funds don't multiply |
| `conservation of funds` | For any input: `sum(final) == sum(initial)` within epsilon ($0.01) |
| `all below threshold after convergence` | Every final balance <= its threshold |
| `convergence within 50 iterations` | Random networks of 2-20 nodes always converge |
| `empty network` | 0 participants: returns empty result without error |
| `single participant` | 1 participant with no allocations: balance unchanged |
| `matches Solidity known outputs` | Same inputs produce same outputs as Solidity tests (cross-validation) |

---

## Monorepo Structure

```
tbff2/
├── contracts/
│   ├── foundry.toml
│   ├── src/
│   │   └── libraries/
│   │       └── TBFFMath.sol
│   ├── test/
│   │   ├── unit/
│   │   │   └── TBFFMath.t.sol
│   │   └── helpers/
│   │       └── TestSetup.sol
│   ├── lib/          (forge dependencies — empty in Phase 1, populated in Phase 2)
│   └── Makefile
├── web/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          (redirects to /simulator)
│   │   │   └── simulator/
│   │   │       └── page.tsx
│   │   └── lib/
│   │       └── tbff/
│   │           ├── engine.ts
│   │           ├── mock-data.ts
│   │           └── __tests__/
│   │               └── engine.test.ts
│   ├── vitest.config.ts
│   └── tsconfig.json
├── CLAUDE.md
└── README.md
```

---

## Acceptance Criteria

### Contracts
- [ ] `forge build` compiles with zero warnings
- [ ] `forge test` passes all concrete tests
- [ ] `forge test --fuzz-runs 1000` passes all fuzz tests
- [ ] Gas snapshots generated and documented
- [ ] Conservation invariant: `sum(final) == sum(initial)` holds for all fuzz inputs

### Web Simulator
- [ ] `npm run dev` starts without errors
- [ ] Simulator page loads with mock data pre-populated
- [ ] Clicking "Run All" produces convergence with correct final balances
- [ ] Step-through ("Next Iteration") shows balance changes per iteration
- [ ] Total row in data table is constant across all iterations (conservation)
- [ ] SVG visualization updates node colors based on balance/threshold status
- [ ] Adding/removing participants works without errors
- [ ] Allocation percentages enforce sum-to-100% constraint
- [ ] `npm run test` passes all Vitest tests

### Cross-Validation
- [ ] TypeScript engine and Solidity library produce matching outputs for the same inputs within $0.01/node tolerance (documented in at least 3 test cases: linear chain, diamond topology, circular allocation)
- [ ] Cross-validation test cases are committed as `web/src/lib/tbff/__tests__/cross-validation.test.ts` with hardcoded expected values from Solidity test output

---

## What Phase 1 Does NOT Include

- No Superfluid integration (that's Phase 2)
- No wallet connection or blockchain interaction
- No Super App or streaming callbacks
- No GDA pools
- No keeper/automation
- No security hardening or access control
- No UUPS upgradeability
- No production design system (minimal Tailwind/shadcn only)
- No D3.js (plain SVG)
- No deployment scripts

---

## Build Sequence

1. Initialize monorepo structure
2. `contracts/`: Foundry setup + TBFFMath.sol (pure math functions)
3. `contracts/`: Unit tests for each function
4. `contracts/`: Fuzz tests for invariants
5. `contracts/`: Gas snapshot tests
6. `web/`: Next.js setup + Tailwind + shadcn
7. `web/`: TypeScript TBFF engine (mirror of Solidity)
8. `web/`: Vitest tests for engine
9. `web/`: Simulator page (input panel + data table)
10. `web/`: SVG node-link visualization
11. `web/`: Step-through controls
12. Cross-validate: document matching outputs between Solidity and TypeScript
13. Final validation: run all tests, verify all acceptance criteria

---

## Key Design Decisions

### Why pure library, not a contract?
TBFFMath.sol has no storage and no state. This makes it:
- Gas-efficient (all computation in memory)
- Testable (pure functions are trivially unit-testable)
- Reusable (any contract can import it)
- Auditable (small surface area)

### Why CSR (Compressed Sparse Row) for in-memory allocation graph?
The in-memory `NetworkState` uses a flat offset array (`allocOffsets[i]` indexes into parallel `allocTargets`/`allocWeights` arrays) — the same CSR format used in scientific computing for sparse matrices. For 100 nodes with average degree 5, this stores 500 entries instead of 10,000 — **95% memory reduction** vs. a dense matrix. It also avoids Solidity's prohibition on memory mappings.

For **storage** (Phase 2+), the calling contract will use `mapping(address => Allocation[])` where `Allocation` packs `address target` (160 bits) + `uint96 weight` (96 bits) into a single 256-bit slot. The contract loads from storage into `NetworkState` once before calling `converge()`.

### Why WAD (1e18)?
The DeFi standard for fixed-point arithmetic. `1e18 = 100%` gives 18 decimal places of precision, matching Superfluid's flow rate format and ERC-20 decimal conventions. Using `uint96` for weights provides 28 decimal digits of range while fitting in a single slot alongside an address.

### Why TypeScript mirror?
The browser simulator serves as an independent reference implementation. If the Solidity and TypeScript engines produce matching outputs for the same inputs (within $0.01 tolerance per node due to float64 vs. uint256/WAD precision difference), we have high confidence both are correct. This cross-validation strategy catches bugs that testing either implementation alone would miss.

### Why no D3?
For Phase 1, plain SVG is sufficient for the node-link diagram. D3 adds ~100KB to the bundle and introduces complexity (force simulation, transitions) that isn't needed for a static/step-through visualization. D3 will be introduced in Phase 2+ when we need animated streaming flows and force-directed layout.

---

## Estimated Effort

| Component | Estimated Complexity |
|---|---|
| Foundry setup + dependencies | Low |
| TBFFMath.sol (5 functions) | Medium |
| Solidity unit tests | Medium |
| Solidity fuzz tests | Medium |
| Gas snapshots | Low |
| Next.js setup + shadcn | Low |
| TypeScript engine | Medium (mirror of Solidity) |
| Vitest tests | Medium |
| Simulator page (inputs + table) | Medium |
| SVG visualization | Medium |
| Step-through controls | Low-Medium |
| Cross-validation docs | Low |

**Total: One focused implementation session per package, ~2 sessions total.**

---

## Phase 2 Preview (Not in scope)

Phase 2 will add:
- Superfluid V2.5 testing infrastructure (ERC1820 registry, framework deployer)
- Streaming balance tests proving understanding of Superfluid's balance model
- TBFF + streaming math integration tests
- "Streaming Mode" toggle in the web simulator with time-based balance accumulation
- Gas estimation panel reading from Foundry test output
