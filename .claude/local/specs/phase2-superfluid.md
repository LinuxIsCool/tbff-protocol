# Phase 2 Specification: Superfluid V2.5 Integration

## Overview

Phase 2 bridges Phase 1's pure math library to Superfluid's streaming reality. The goal is to prove that TBFF's iterative equation works correctly when balances change continuously over time (via CFA streams) rather than in discrete snapshots.

Phase 1 proved: **the math is correct** (convergence, conservation, cross-validation).
Phase 2 proves: **the math works with streaming balances** (time-varying inputs, real-time threshold detection).

Phase 2 does NOT deploy a production TBFF contract. It builds test infrastructure and extends the simulator.

---

## Contracts: Superfluid V2.5 Test Infrastructure

### Prerequisites

```bash
cd contracts
~/.foundry/bin/forge install superfluid-finance/protocol-monorepo@dev
~/.foundry/bin/forge install OpenZeppelin/openzeppelin-contracts@v5.4.0
```

Update `foundry.toml` remappings:
```toml
remappings = [
  "forge-std/=lib/forge-std/src/",
  "@superfluid-finance/=lib/protocol-monorepo/packages/ethereum-contracts/",
  "@openzeppelin-v5/=lib/openzeppelin-contracts/"
]
```

### File 1: `test/helpers/SuperfluidSetup.sol`

Base test contract that boots the entire Superfluid framework in a Foundry test environment.

**Responsibilities:**
1. Etch the ERC1820 registry at its canonical address (required by Superfluid host)
2. Deploy `SuperfluidFrameworkDeployer` and call `deployTestFramework()`
3. Extract the Framework struct: `sf.host`, `sf.cfa`, `sf.gda`
4. Deploy a test wrapper SuperToken ("TBFFx") via `deployer.deployWrapperSuperToken()`
5. Provide helper functions:
   - `fundAccount(address account, uint256 amount)` — mint underlying + upgrade to SuperToken
   - `createStream(address from, address to, int96 flowRate)` — CFA stream via `vm.startPrank`
   - `getRealtimeBalance(address account) returns (int256)` — `token.realtimeBalanceOfNow()`
   - `advanceTime(uint256 seconds)` — `vm.warp(block.timestamp + seconds)`

**Critical detail**: Use `vm.startPrank` (not `vm.prank`) everywhere to warm the `SuperTokenV1Library` cache. Single-call `vm.prank` causes library cache misses that produce cryptic reverts.

### File 2: `test/unit/StreamingBalance.t.sol`

5 tests proving understanding of Superfluid's balance model before integrating TBFF math.

| Test | What it proves |
|------|----------------|
| `test_streamingBalanceIncreasesOverTime` | Create stream A->B at 1e18/sec, warp 100s, verify B's balance increased by ~100e18 |
| `test_netFlowRateCalculation` | A streams to B and C, verify A's netFlowRate is negative sum of outflows |
| `test_bufferDepositLocked` | Verify buffer = flowRate * 3600 (1hr on testnet) is locked on stream creation |
| `test_multipleStreamsAccumulate` | 3 senders stream to 1 receiver, verify receiver balance is sum of all flows |
| `testFuzz_balanceLinearInTime(uint96 flowRate, uint256 duration)` | Verify balance = flowRate * duration (linear model) |

### File 3: `test/unit/TBFFMathWithStreaming.t.sol`

Tests combining Phase 1 math with streaming balance inputs.

**Setup**: 3 nodes (Alice, Bob, Carol). Alice receives an external stream giving her 100 tokens/hour. Alice threshold = 50. Alice allocates 60% to Bob, 40% to Carol.

| Test | What it proves |
|------|----------------|
| `test_overflowDetectedAfterTimeAdvance` | Warp until Alice > 50, verify `computeOverflow()` returns correct amount |
| `test_redistributionMatchesSimulator` | Compare Solidity `converge()` output with hardcoded TypeScript simulator output for same inputs |

### Extended Gas Snapshots

Add to existing `TBFFGas.t.sol`:

| Snapshot | Configuration |
|----------|--------------|
| `converge_5nodes_streaming` | 5 nodes, balances loaded from `realtimeBalanceOfNow()`, 3 iterations |
| `converge_streaming_overhead` | Same 5-node config as Phase 1, measuring overhead of streaming balance reads |

---

## Web: Simulator Extensions

### Feature 1: Streaming Mode Toggle

Add a toggle switch to the simulator page header: **Snapshot Mode** (default, Phase 1 behavior) | **Streaming Mode** (Phase 2).

**Streaming Mode behavior:**
- Each participant has an `inflowRate` (tokens/second), configurable via the input panel
- A `requestAnimationFrame` loop advances simulated time, accumulating balances:
  ```typescript
  displayBalance = baseBalance + inflowRate * (Date.now() / 1000 - startTimestamp)
  ```
- When any participant's display balance crosses their `maxThreshold`, a visual pulse indicates "threshold breach detected"
- The TBFF redistribution can be triggered manually or auto-triggered on breach
- After redistribution, base balances reset to post-redistribution values

**UI additions:**
- Toggle switch in header bar (next to Phase badge)
- Per-participant `inflowRate` input field (visible only in streaming mode)
- Animated balance counters that smoothly increment in real-time
- "Auto-redistribute" checkbox that triggers `converge()` on any threshold breach

### Feature 2: Gas Estimation Panel

Display gas snapshots from Foundry tests in a collapsible panel below the network visualization.

**Data source:** Static JSON file at `web/public/gas-snapshots.json`, generated by:
```bash
cd contracts && forge test --gas-report --json > ../web/public/gas-snapshots.json
```

**Display:**
- Table with columns: Scenario, Nodes, Iterations, Gas Used, Est. Cost (Base L2)
- Color coding: green (<500K gas), yellow (500K-1.5M), red (>1.5M)
- Comparison row showing Phase 1 vs Phase 2 overhead

### Feature 3: Convergence Charts

SVG line charts showing balance of each participant over iterations.

**Implementation:**
- X-axis: iteration number (from `snapshots[]`)
- Y-axis: balance (dollars)
- One colored line per participant
- Horizontal dashed lines for each participant's `maxThreshold`
- Tooltip on hover showing exact balance at each iteration
- Pure SVG with `<polyline>` elements — no charting library needed for 5 participants

---

## Acceptance Criteria

### Contracts
- [ ] `SuperfluidSetup.sol` successfully deploys framework + TBFFx token
- [ ] All 5 `StreamingBalance` tests pass
- [ ] Both `TBFFMathWithStreaming` tests pass
- [ ] Cross-validation: streaming test outputs match TypeScript simulator for same inputs
- [ ] Gas snapshots generated and saved to JSON

### Web
- [ ] Streaming mode toggle works without breaking snapshot mode
- [ ] Balance counters animate smoothly in streaming mode (60fps)
- [ ] Gas panel displays data from JSON file
- [ ] Convergence chart renders for all 5 participants
- [ ] `npm run build` produces clean output
- [ ] All existing Phase 1 tests still pass

---

## Build Sequence

1. **Contracts first**: Install Superfluid + OZ deps, create SuperfluidSetup, write StreamingBalance tests
2. **Streaming math tests**: TBFFMathWithStreaming tests, verify cross-validation
3. **Gas snapshots**: Extend TBFFGas.t.sol, export to JSON
4. **Web streaming mode**: Toggle UI, inflowRate inputs, rAF animation loop
5. **Web gas panel**: Read JSON, render table
6. **Web convergence charts**: SVG line charts from snapshot data
7. **Integration verification**: All tests pass, clean build, visual check

---

## What Phase 2 Does NOT Include

- **No on-chain TBFF contract**: Phase 2 only tests Superfluid infrastructure, not a deployed TBFF network
- **No CFA/GDA stream creation from TBFF**: That's Phase 4 (two-node redistribution)
- **No wallet connection**: The web simulator remains pure TypeScript, no wagmi/viem
- **No Anvil interaction**: Tests run in Foundry's built-in EVM, not against a local node
- **No Super App callbacks**: Phase 3 introduces TBFFNode as a Super App
- **No production deployment**: Everything runs locally
- **No D3.js**: SVG line charts are hand-rolled, matching Phase 1's plain SVG approach

---

## Dependencies on Phase 1

Phase 2 assumes all of the following from Phase 1:

- `TBFFMath.sol` library with `capToThreshold`, `computeOverflow`, `distributeOverflow`, `iterateOnce`, `converge`
- `TestSetup.sol` helper with `buildNetworkState()` function
- `engine.ts` TypeScript mirror with identical function signatures
- `mock-data.ts` with 5 real participants
- Existing 22 Solidity tests and 15+ TypeScript tests all passing
- shadcn/ui components: Button, Badge, Card, Input, Slider, Separator, Table

---

## Estimated Effort

| Component | Complexity | Notes |
|-----------|-----------|-------|
| SuperfluidSetup.sol | Medium | ERC1820 etching is fiddly; once working, reusable forever |
| StreamingBalance tests | Low | Straightforward Superfluid API exercise |
| TBFFMathWithStreaming tests | Low | Reuses existing TestSetup + TBFFMath |
| Streaming mode UI | Medium | rAF animation loop needs careful state management |
| Gas panel | Low | Static JSON display |
| Convergence charts | Low-Medium | SVG polylines with basic interaction |
