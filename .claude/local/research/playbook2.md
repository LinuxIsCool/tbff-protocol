# Building TBFF: a 10-phase streaming protocol development blueprint

**Threshold-Based Flow Funding can be built incrementally on Superfluid V2.5 using a memory-first on-chain redistribution engine, sparse adjacency storage, and Super App callbacks — with each phase validated through a web-based visualization layer.** The research across Superfluid's current architecture, Foundry testing patterns, frontend tooling, and comparable streaming protocols (Sablier, Drips, LlamaPay) converges on a clear optimal sequence. The key insight is that TBFF's iterative equation is gas-feasible on L2s for networks up to ~100 nodes (**~1.2M gas per redistribution cycle on Arbitrum/Base**), and the Superfluid GDA agreement eliminates the need for individual CFA streams during 1-to-many overflow redistribution. Each of the 10 phases below adds smart contract functionality and a companion web visualization that proves correctness visually.

---

## Architecture decisions that shape every phase

Before diving into the prompts, several foundational choices propagate through the entire build. **Superfluid V2.5** (ethereum-contracts v1.15.0, February 2026) mandates OpenZeppelin v5, Solidity 0.8.30, and the EVM target `cancun`. On-chain interactions must use `SuperTokenV1Library` with the `using SuperTokenV1Library for ISuperToken` pattern, while frontend interactions go through `CFAv1Forwarder` (address `0xcfA132E353cB4E398080B9700609bb008eceB125` on all chains) and `GDAv1Forwarder`. The `CFASuperAppBase` was refactored in v1.14.1 — `onFlowDeleted` split into `onInFlowDeleted` and `onOutFlowDeleted`, and `flowRate` was added to `onFlowCreated`/`onFlowUpdated` signatures.

The allocation matrix P should use a **sparse adjacency list** (`mapping(address => Allocation[])` where `Allocation` packs `address target` + `uint96 weight` into a single 256-bit slot) rather than a dense matrix. For 100 nodes with average degree 5, this stores 500 edges instead of 10,000 — a **95% storage reduction**. Weights use `uint96` with `1e18 = 100%` precision, matching the DeFi WAD standard while fitting perfectly alongside a 160-bit address in one slot.

The frontend stack is **Next.js 14+ (App Router) + wagmi v2 + viem v2 + RainbowKit + TanStack Query**, with D3.js force-directed graphs for network visualization and `requestAnimationFrame` for streaming balance animation. Anvil serves as the local testnet. The contract architecture uses **UUPS proxies** throughout — the same pattern Superfluid itself uses — enabling iterative upgrades during development with a path to immutability at maturity.

---

## Phase 1 — Project scaffold, TBFF math library, and browser simulator

```
PROMPT 1:

Create a monorepo with two packages: `contracts/` (Foundry) and `web/` (Next.js 14 App Router).

CONTRACTS:
- Initialize Foundry project. Install dependencies:
  forge install superfluid-finance/protocol-monorepo@dev
  forge install OpenZeppelin/openzeppelin-contracts@v5.4.0
- Configure remappings: @superfluid-finance/=lib/protocol-monorepo/packages/ethereum-contracts/
  @openzeppelin-v5/=lib/openzeppelin-contracts/
- Create src/libraries/TBFFMath.sol — a pure Solidity library implementing:
  1. `capToThreshold(uint256 balance, uint256 threshold) returns (uint256)` — min(balance, threshold)
  2. `computeOverflow(uint256 balance, uint256 threshold) returns (uint256)` — max(0, balance - threshold)
  3. `distributeOverflow(uint256 overflow, uint96[] memory weights) returns (uint256[] memory)` —
     multiply overflow by each weight (WAD, 1e18=100%), return array of distribution amounts
  4. `iterateOnce(uint256[] memory balances, uint256[] memory thresholds, 
     address[] memory nodes, mapping(address => Allocation[]) storage allocations) 
     returns (uint256[] memory newBalances, bool changed)` — one full pass of:
     x^(k+1) = min(x^(k), t) + P^T · max(0, x^(k) - t)
  5. `converge(... same params ..., uint256 maxIterations) returns (uint256[] memory finalBalances, uint256 iterations)` — 
     loop iterateOnce until !changed or maxIterations reached, all in memory
  Use unchecked math for loop counters. Use WAD (1e18) for all fixed-point operations.
  All storage reads happen once at the start; all computation in memory; storage writes once at end.
  struct Allocation { address target; uint96 weight; }

- Create test/unit/TBFFMath.t.sol with:
  - test_capToThreshold with known values
  - test_computeOverflow with known values
  - test_distributeOverflow verifies sum of outputs == overflow (no rounding loss > 1 wei)
  - testFuzz_conservationOfFunds(uint256[] balances, uint256[] thresholds) — 
    after converge(), sum(finalBalances) == sum(initialBalances) (within 1 wei tolerance per node)
  - testFuzz_allBelowThreshold — after convergence, every balance <= its threshold
  - testFuzz_convergenceTerminates — converge() always terminates within maxIterations for reasonable inputs
  Use bound() to constrain inputs to realistic ranges (1e15 to 1e24 for balances, 2-20 nodes).

WEB:
- Initialize Next.js 14 with TypeScript, Tailwind CSS, shadcn/ui.
- Create app/simulator/page.tsx — a pure TypeScript TBFF simulator (NO blockchain connection):
  - Input panel: Add/remove nodes with name, initial balance, min threshold, max threshold
  - Allocation matrix editor: for each node, set percentage allocations to other nodes (must sum to 100%)
  - "Run Simulation" button that executes the TBFF equation in TypeScript step-by-step
  - Visualization: Show a simple node-link diagram (use SVG, no D3 yet) with:
    - Circles for nodes, sized by balance, colored green/yellow/red based on threshold status
    - Lines for allocation edges, thickness proportional to weight
    - Step-through controls: "Next Iteration" button showing balance changes per step
    - Convergence counter showing iteration number and whether converged
  - Display a table of balances at each iteration step
  This is a standalone JS simulation — it validates the math logic independently of Solidity.
```

This phase establishes the mathematical foundation. The TypeScript simulator serves as a **reference implementation** that every subsequent Solidity contract is tested against. The conservation-of-funds fuzz test (`sum(final) == sum(initial)`) is the single most important invariant in the entire protocol.

---

## Phase 2 — Superfluid framework integration and streaming math tests

```
PROMPT 2:

Extend the contracts/ package to integrate Superfluid V2.5 testing infrastructure.

CONTRACTS:
- Create test/helpers/SuperfluidSetup.sol — a base test contract that:
  1. Etches the ERC1820 registry: vm.etch(ERC1820RegistryCompiled.at, ERC1820RegistryCompiled.bin)
  2. Deploys SuperfluidFrameworkDeployer and calls deployTestFramework()
  3. Gets the Framework struct (sf.host, sf.cfa, sf.gda)
  4. Deploys a test wrapper SuperToken ("TBFFx") via deployer.deployWrapperSuperToken()
  5. Creates helper functions: fundAccount(address, uint256), createStream(from, to, flowRate),
     getRealtimeBalance(address), advanceTime(uint256 seconds) using vm.warp
  6. IMPORTANT: Use vm.startPrank (not vm.prank) everywhere to warm SuperTokenV1Library cache

- Create test/unit/StreamingBalance.t.sol — tests proving understanding of Superfluid's balance model:
  - test_streamingBalanceIncreasesOverTime: create stream A→B at 1e18/sec, warp 100s, 
    verify B's balance increased by ~100e18
  - test_netFlowRateCalculation: A streams to B and C, verify A's netFlowRate is negative sum
  - test_bufferDepositLocked: verify buffer = flowRate * 3600 (1hr on testnet) is locked on stream creation
  - test_multipleStreamsAccumulate: 3 senders stream to 1 receiver, verify receiver balance is sum
  - testFuzz_balanceLinearInTime(uint256 flowRate, uint256 duration): verify balance = flowRate * duration

- Create test/unit/TBFFMathWithStreaming.t.sol — tests combining TBFF math with streaming:
  - Setup: 3 nodes (Alice, Bob, Carol). Alice has flowRate giving her 100 tokens/hour.
    Alice threshold = 50. Alice allocates 60% to Bob, 40% to Carol.
  - test_overflowDetectedAfterTimeAdvance: warp until Alice > 50, verify computeOverflow returns correct amount
  - test_redistributionMatchesSimulator: compare Solidity converge() output with hardcoded TypeScript simulator output for same inputs

- Add gas snapshots: wrap key operations in vm.startSnapshotGas/vm.stopSnapshotGas:
  - "converge_5nodes_3iterations", "converge_20nodes_10iterations", "converge_50nodes_15iterations"

WEB — Extend the simulator page:
- Add a "Streaming Mode" toggle that simulates time-based balance accumulation:
  - Each node has an inflow rate (tokens/second) 
  - A timer advances simulated time, balances grow in real-time using requestAnimationFrame
  - When any node crosses its max threshold, the TBFF redistribution automatically triggers
  - Show the redistribution happening with animated balance transfers between nodes
- Add a gas estimation panel that displays the gas snapshots from the Foundry tests
  (read from a static JSON file generated by forge test)
- Add convergence charts: plot balance of each node over iterations (line chart using SVG paths)
```

---

## Phase 3 — Single-node Super App with threshold detection

```
PROMPT 3:

Build the first on-chain TBFF component: a Super App that detects when streaming
inflows push a node's balance past its threshold.

CONTRACTS:
- Create src/core/TBFFNode.sol — a contract inheriting CFASuperAppBase that represents one TBFF node:
  - State: ISuperToken public token; uint256 public maxThreshold; uint256 public minThreshold;
    address public owner;
  - Constructor registers as Super App with the Superfluid Host (use BEFORE_AGREEMENT_CREATED_NOOP 
    etc. to only enable afterAgreement* callbacks)
  - Implement onFlowCreated(ISuperToken, address sender, int96 flowRate, bytes ctx):
    1. Calculate projected time until threshold breach: 
       timeToThreshold = (maxThreshold - currentBalance) / totalNetFlowRate
    2. Emit ThresholdProjection(address node, uint256 secondsUntilBreach)
  - Implement onFlowUpdated and onInFlowDeleted similarly
  - View function: getCurrentBalance() returns the real-time balance using 
    token.realtimeBalanceOfNow(address(this))
  - View function: isAboveThreshold() returns getCurrentBalance() > maxThreshold
  - View function: getOverflow() returns computeOverflow(getCurrentBalance(), maxThreshold)
  - Admin functions: setThresholds(uint256 min, uint256 max) onlyOwner

- Create src/core/TBFFNodeFactory.sol:
  - createNode(ISuperToken token, uint256 minThreshold, uint256 maxThreshold) → deploys TBFFNode
  - Tracks all created nodes in address[] public nodes and mapping(address => bool) public isNode

- Create test/integration/TBFFNode.t.sol extending SuperfluidSetup:
  - test_nodeDetectsThresholdBreach: fund node, create inbound stream, warp until balance > threshold,
    verify isAboveThreshold() returns true
  - test_thresholdProjectionEvent: verify ThresholdProjection event emitted with correct timing
  - test_nodeHandlesFlowDeletion: create stream, delete it, verify callbacks don't revert
  - test_multipleInboundStreams: 3 senders stream to node, verify netFlowRate is positive sum
  - testFuzz_thresholdDetection(uint96 flowRate, uint256 threshold, uint256 warpTime):
    verify isAboveThreshold matches manual calculation

WEB:
- Create app/node-monitor/page.tsx — connects to local Anvil:
  - Deploy button: deploys TBFFNodeFactory + creates one TBFFNode on local Anvil
  - Shows the node's real-time balance using the requestAnimationFrame animation technique:
    fetch realtimeBalanceOfNow once, then calculate client-side: 
    displayBalance = fetchedBalance + netFlowRate * (Date.now()/1000 - fetchTimestamp)
  - Visual threshold indicator: a vertical bar showing balance relative to min/max thresholds
    (green zone between min and max, red below min, yellow above max)
  - "Create Inbound Stream" button: sends a CFA stream to the node via CFAv1Forwarder
  - Live event log: subscribes to ThresholdProjection events and displays countdown
  - Stream management panel: list active inbound streams with sender, flowRate, and delete button
  Use wagmi v2 hooks (useReadContract, useWriteContract, useWatchContractEvent).
  Connect to Anvil at http://127.0.0.1:8545 using the foundry chain config.
  Use one of Anvil's default accounts (private key 0xac0974...) for transactions.
```

---

## Phase 4 — Two-node overflow redistribution via CFA streams

```
PROMPT 4:

Implement the first actual redistribution: when Node A exceeds its threshold, 
overflow automatically streams to Node B via a CFA stream.

CONTRACTS:
- Extend TBFFNode.sol with overflow redistribution capabilities:
  - New state: Allocation[] public allocations (array of {address target, uint96 weight})
  - Function setAllocations(Allocation[] calldata _allocs) onlyOwner — validates weights sum to 1e18
  - Internal function _redistributeOverflow(bytes memory ctx) returns (bytes memory newCtx):
    1. Calculate current overflow: overflow = getOverflow()
    2. If overflow > dustThreshold (configurable, default 1e15):
       For each allocation, compute target flowRate = (overflow / REDISTRIBUTION_PERIOD) * weight / 1e18
       Use ctx-chained SuperTokenV1Library calls to create/update outgoing streams:
       newCtx = token.createFlowWithCtx(ctx, target, flowRate) or updateFlowWithCtx
    3. Track outgoing redistribution streams in mapping(address => int96) outgoingFlows
  - Call _redistributeOverflow from afterAgreementCreated and afterAgreementUpdated callbacks
  - Handle afterAgreementTerminated with try/catch (MUST NOT revert)
  - Add ACL: the TBFFNode grants itself maxFlowPermissions to manage streams on behalf of its token balance

- Create src/core/TBFFRouter.sol — orchestrator contract:
  - registerNode(address node) — adds to tracked nodes, verifies it's a TBFFNode
  - triggerRedistribution(address node) — external trigger for redistribution check
  - checkAllNodes() view — returns list of nodes currently above threshold

- Create test/integration/TwoNodeRedistribution.t.sol:
  - Setup: NodeA (threshold=100e18), NodeB (threshold=1000e18). 
    NodeA allocates 100% to NodeB.
    External sender streams to NodeA at 1e18/sec.
  - test_overflowCreatesOutboundStream: warp 200s, trigger redistribution, 
    verify CFA stream exists from NodeA to NodeB
  - test_overflowAmountCorrect: verify the outbound flowRate matches expected overflow redistribution
  - test_nodeABalanceStabilizes: after redistribution, verify NodeA balance stays near threshold
  - test_nodeBReceivesOverflow: verify NodeB balance increases from the redistributed stream
  - test_streamDeletionHandledGracefully: delete inbound stream to NodeA, verify no revert
  - testFuzz_twoNodeConservation(uint96 inflowRate, uint256 thresholdA):
    total value entering system == total value in NodeA + NodeB (within tolerance)

WEB:
- Create app/two-node/page.tsx — two-node visualization:
  - Deploy and setup: creates NodeA and NodeB with configurable thresholds
  - Visual: Two large circles (nodes) connected by an animated line (stream)
    - Each node shows real-time animated balance, threshold markers (horizontal lines at min/max)
    - Inbound stream to NodeA shown as an arrow from the left
    - When overflow triggers, an animated arrow appears from NodeA → NodeB with flowRate label
    - Node colors change: green (normal), yellow (approaching threshold), red (above threshold → redistributing)
  - Control panel: 
    - Slider to set inbound flowRate to NodeA
    - Inputs for NodeA threshold
    - "Trigger Redistribution" button
    - Real-time display of: NodeA balance, NodeB balance, overflow amount, outbound flowRate
  - Timeline: scrolling log of events (StreamCreated, ThresholdProjection, redistribution triggers)
  Use D3.js for the two-node visualization with smooth transitions and animated flow particles 
  moving along the stream edges proportional to flowRate.
```

---

## Phase 5 — Multi-node network with on-chain allocation matrix

```
PROMPT 5:

Scale to N nodes with a full allocation matrix and on-chain iterative convergence.

CONTRACTS:
- Create src/core/TBFFNetwork.sol — the core network contract (replaces per-node approach for gas efficiency):
  - Storage (using EIP-7201 namespaced storage for upgrade safety):
    struct NodeConfig { uint96 minThreshold; uint96 maxThreshold; uint64 lastUpdated; }
    mapping(address => NodeConfig) public nodes;
    address[] public nodeList;
    mapping(address => uint256) public nodeIndex;
    mapping(address => Allocation[]) public allocations; // sparse adjacency list
    mapping(address => mapping(address => uint96)) public allocationWeights; // O(1) lookup
    ISuperToken public token;
    uint256 public constant MAX_ITERATIONS = 50;
    uint256 public constant DUST_THRESHOLD = 1e15;
    
  - registerNode(address node, uint96 minThresh, uint96 maxThresh) onlyOwner
  - setAllocations(address node, Allocation[] calldata allocs) onlyOwner — validates sum == 1e18
  - removeNode(address node) onlyOwner
  
  - computeRedistribution() public view returns (uint256[] memory finalBalances, uint256 iterations):
    1. Load all node balances into memory array (use token.realtimeBalanceOfNow for each)
    2. Load thresholds into memory array
    3. Call TBFFMath.converge() — all iteration happens in memory
    4. Return final balance targets and iteration count
  
  - executeRedistribution() external nonReentrant:
    1. Call computeRedistribution() to get target balances
    2. Compare target vs current for each node
    3. For nodes that need to send: create/update CFA streams from network contract
       (network contract holds SuperToken and manages all streams via ACL)
    4. For nodes that should receive: CFA streams directed to them
    5. Emit RedistributionExecuted(uint256 iterations, uint256 totalRedistributed)
    
  - Use ReentrancyGuard. Follow CEI pattern: compute all in memory, update state, then external calls last.

- Create test/integration/MultiNodeNetwork.t.sol:
  - Setup: 5 nodes in a diamond topology: 
    Source → Hub1, Hub2 → Sink1, Sink2. Hub1 splits 50/50 to sinks. Hub2 splits 70/30.
  - test_fiveNodeConvergence: fund source above threshold, execute redistribution, 
    verify all nodes at or below threshold
  - test_multiHopRedistribution: overflow from Source → Hub → Sink (two hops)
  - test_conservationAcrossNetwork: sum of all balances before == sum after
  - test_convergenceInReasonableIterations: verify iterations < 20 for 5-node network
  - test_gasScaling: benchmark gas for 5, 10, 20, 50 node networks
  - invariant_networkConservation: handler creates random streams, triggers redistribution,
    invariant checks total supply conservation

- Create test/fork/SuperfluidFork.t.sol:
  - Fork Base Sepolia (or Optimism Sepolia where Superfluid is deployed)
  - Test against live Superfluid deployment: create real SuperToken streams, verify TBFF integration

WEB:
- Create app/network/page.tsx — full network visualization dashboard:
  - Network builder (using React Flow / @xyflow/react):
    - Drag-and-drop to add nodes, connect with edges
    - Click node to set thresholds, click edge to set allocation weight
    - Validation: edge weights from each node must sum to 100%
  - Live visualization (using D3.js force-directed graph):
    - Nodes: circles with real-time animated balance counters inside
    - Balance bar inside each node showing fill level relative to min/max threshold
    - Edges: lines with animated particles flowing proportional to stream flowRate
    - Color coding: nodes below min=red, between min/max=blue, above max=green(overflowing)
  - Simulation panel:
    - "Compute Redistribution" button — calls view function, shows proposed changes
    - "Execute Redistribution" button — sends transaction
    - Convergence animation: step through iterations showing balance changes at each step
    - Display iteration count, gas used, total redistributed
  - Data table: all nodes with address, balance, thresholds, netFlowRate, status
  Connect to Anvil. Deploy full network via frontend buttons.
```

---

## Phase 6 — GDA pools for gas-efficient one-to-many distribution

```
PROMPT 6:

Replace individual CFA streams for redistribution with Superfluid GDA pools —
each overflowing node distributes to a pool where recipients hold units proportional 
to allocation weights.

CONTRACTS:
- Create src/core/TBFFPoolManager.sol:
  - For each node that can overflow, create a GDA pool: 
    ISuperfluidPool pool = token.createPool(address(this), PoolConfig({
      transferabilityForUnitsOwner: false, distributionFromAnyAddress: false
    }))
  - mapping(address => ISuperfluidPool) public nodePools; // node → its redistribution pool
  - When allocations are set for a node:
    For each allocation target, set pool member units proportional to weight:
    pool.updateMemberUnits(target, uint128(weight / UNIT_SCALE))
    where UNIT_SCALE normalizes weights to reasonable unit counts (e.g., divide 1e18 by 1e14 → max 10000 units)
  - When redistribution triggers for a node:
    Instead of creating N individual CFA streams, flow to the pool:
    token.flowX(address(pool), overflowFlowRate)
    The pool automatically distributes proportionally to all members by units
  - Recipients must connect to pool to receive real-time: call token.connectPool(pool)
    or use GDA autoconnect (tryConnectPoolFor in v1.14.1+)

- Modify TBFFNetwork.sol to use TBFFPoolManager:
  - executeRedistribution now: for each overflowing node, 
    create/update a single GDA flow to that node's pool instead of N individual CFA flows
  - Gas savings: 1 stream creation instead of N per overflowing node
  - Keep CFA for direct 1-to-1 streams where a node has only 1 allocation target

- Create test/integration/GDARedistribution.t.sol:
  - test_poolCreatedPerNode: verify each registered node gets a GDA pool
  - test_unitsMatchAllocationWeights: verify pool member units are proportional to weights
  - test_overflowDistributesThroughPool: trigger overflow, verify recipients receive proportional amounts
  - test_recipientMustConnect: disconnected recipient doesn't receive real-time balance updates
  - test_poolFlowRateMatchesOverflow: verify total flow to pool == computed overflow rate
  - test_gasComparisonCFAvsGDA: benchmark creating N individual CFA streams vs 1 GDA flow
    for N = 2, 5, 10, 20 recipients. Log gas difference.
  - testFuzz_gdaConservation: total distributed via pool == total overflow (within rounding tolerance)

WEB:
- Extend app/network/page.tsx with pool visualization:
  - Each overflowing node shows a "pool" indicator (concentric ring around node)
  - Pool edges shown differently from direct CFA edges (dashed vs solid)
  - Pool detail panel: click a node to see its GDA pool info:
    - Total units, flow rate to pool, per-member units and estimated flow rate
    - Connection status of each member (connected/disconnected)
    - "Connect to Pool" button for each member
  - Gas comparison widget: side-by-side display showing gas costs of CFA-only vs GDA approach
  - Add pool flow animation: show single stream from node to pool "hub", then fan out to members
```

---

## Phase 7 — Automated threshold monitoring and keeper integration

```
PROMPT 7:

Add automated monitoring so redistribution triggers without manual intervention 
when streaming balances cross thresholds.

CONTRACTS:
- Create src/automation/TBFFKeeper.sol implementing Chainlink AutomationCompatibleInterface:
  - checkUpkeep(bytes calldata) external view returns (bool upkeepNeeded, bytes memory performData):
    1. Iterate all registered nodes
    2. For each, compute real-time balance via token.realtimeBalanceOfNow()
    3. If any node's balance > maxThreshold + BUFFER_MARGIN, set upkeepNeeded = true
    4. Encode list of overflowing node addresses into performData
    Note: this runs off-chain as eth_call — computation is free
  - performUpkeep(bytes calldata performData) external:
    1. Decode overflowing node addresses
    2. Re-verify they're still above threshold (prevent stale execution)
    3. Call TBFFNetwork.executeRedistributionForNodes(nodes)
    4. Emit KeeperExecuted(address[] nodes, uint256 gasUsed, uint256 timestamp)
  - Configurable parameters: CHECK_INTERVAL, BUFFER_MARGIN, MIN_OVERFLOW_AMOUNT

- Create src/automation/TBFFGelatoResolver.sol (alternative keeper):
  - checker() external view returns (bool canExec, bytes memory execPayload):
    Same logic as checkUpkeep but in Gelato's interface format

- Extend TBFFNetwork.sol:
  - executeRedistributionForNodes(address[] calldata nodes) external:
    Only process specified nodes (more gas-efficient than checking all)
  - Add rate limiting: mapping(address => uint256) lastRedistributionTime
    Enforce minimum REDISTRIBUTION_COOLDOWN (e.g., 60 seconds) between triggers per node
  - Add event: NodeRedistributed(address indexed node, uint256 overflow, uint256 timestamp)

- Create src/automation/TBFFSuperAppTrigger.sol — alternative trigger via Super App callbacks:
  - Register as Super App
  - When any stream to a TBFF node is created/updated, the callback:
    1. Checks if the receiving node is now projected to exceed threshold
    2. If yes, immediately triggers redistribution within the same transaction (single-hop only)
    3. Emits ThresholdBreachDetected for multi-hop cascade handling by keeper
  - Limitation: Superfluid only executes first-level callbacks, so multi-hop requires external trigger

- Create test/integration/AutomatedRedistribution.t.sol:
  - test_keeperDetectsOverflow: setup node approaching threshold, warp, call checkUpkeep, verify true
  - test_keeperExecutesRedistribution: full cycle: checkUpkeep → performUpkeep → verify redistribution
  - test_rateLimitingPreventsSpam: trigger redistribution, immediately try again, verify cooldown enforced
  - test_superAppCallbackTriggersRedistribution: create stream to node, verify callback triggers redistribution
  - test_stalePerformDataRejected: checkUpkeep returns overflow, but by performUpkeep time the node 
    has received a manual redistribution — verify graceful handling (no revert, just skip)
  - testFuzz_keeperGasCost(uint256 numOverflowNodes): gas for performUpkeep scales linearly

WEB:
- Create app/automation/page.tsx — automation monitoring dashboard:
  - Keeper status panel: shows last check time, last execution time, nodes currently needing attention
  - Simulated keeper: a "Run checkUpkeep" button that calls the view function and displays results
  - Auto-mode toggle: starts a setInterval that calls checkUpkeep every N seconds and auto-executes
    performUpkeep when needed (simulates keeper behavior in the browser)
  - Threshold breach timeline: horizontal timeline showing when each node crossed its threshold 
    and when redistribution was executed (latency visualization)
  - Network view: overlay on the D3 graph showing which nodes are currently being monitored,
    which have pending redistributions, and animated "pulse" effects when keeper triggers
  - Cost tracker: running total of gas spent on keeper executions
  - Alert configuration: set custom thresholds for notification (browser notifications)
```

---

## Phase 8 — Security hardening, invariant testing, and circuit breakers

```
PROMPT 8:

Harden the protocol against known attack vectors and add comprehensive invariant testing.

CONTRACTS — Security:
- Add to TBFFNetwork.sol:
  - Inherit OpenZeppelin Pausable + ReentrancyGuard
  - Circuit breaker: if total redistributed in one epoch > CIRCUIT_BREAKER_THRESHOLD, auto-pause
    uint256 public epochRedistributed; uint256 public epochStart;
    modifier circuitBreaker() { 
      if (block.timestamp > epochStart + EPOCH_DURATION) { epochRedistributed = 0; epochStart = block.timestamp; }
      require(epochRedistributed + amount <= CIRCUIT_BREAKER_THRESHOLD, "circuit breaker");
      _; 
    }
  - Emergency withdraw: whenPaused, allow any node owner to withdraw their node's balance
  - Dust threshold enforcement: reject allocations with weight < MIN_ALLOCATION_WEIGHT (prevents spam edges)
  - Minimum stream threshold: reject redistributions that would create streams below MIN_FLOW_RATE
  - Sybil resistance: require minimum stake (e.g., 0.01 ETH) to register a node. Stake locked while node active.
  - Rate limiting per node: max 1 redistribution per COOLDOWN_PERIOD

- Add to TBFFNode.sol / Super App:
  - Wrap all external calls in afterAgreementTerminated with try/catch (MUST NOT revert — protocol rule)
  - Validate Super App is not jailed before operations
  - Add reentrancy guard specifically for callback chains

- Create src/security/TBFFAccessControl.sol:
  - Role-based access: ADMIN_ROLE, OPERATOR_ROLE, KEEPER_ROLE
  - ADMIN: can pause/unpause, update circuit breaker params, add operators
  - OPERATOR: can register/remove nodes, set allocations
  - KEEPER: can trigger redistributions (Chainlink/Gelato/anyone with role)
  - Use OpenZeppelin AccessControl with DEFAULT_ADMIN_ROLE

CONTRACTS — Invariant Testing:
- Create test/invariant/TBFFInvariants.t.sol:
  - invariant_conservationOfFunds: sum of all node balances + contract balance == initial total deposits
  - invariant_noNodeAboveThresholdAfterRedistribution: after any redistribution, all nodes <= maxThreshold
  - invariant_allocationWeightsSumToOne: for every node, sum(allocation weights) == 1e18 or 0
  - invariant_noNegativeBalances: no node balance underflows
  - invariant_totalInflowEqualsOutflow: total CFA inflow rate to network == total outflow rate
  - invariant_poolUnitsMatchAllocations: GDA pool units always proportional to allocation weights
  - invariant_circuitBreakerNotBypassed: if paused, no redistribution can execute

- Create test/invariant/handlers/TBFFHandler.sol:
  - Functions the fuzzer can call: createStream (random sender/receiver/rate), 
    deleteStream, registerNode, removeNode, setAllocations, triggerRedistribution, advanceTime
  - Use bound() to constrain all inputs to valid ranges
  - Track ghost variables: ghost_totalDeposited, ghost_totalWithdrawn, ghost_activeNodes

- Configure foundry.toml invariant section: runs=512, depth=50, fail_on_revert=false

CONTRACTS — Static Analysis:
- Add Makefile targets:
  - `make slither` — runs slither with --detect reentrancy-eth,reentrancy-no-eth,uninitialized-state
  - `make mythril` — runs mythril on core contracts with 3-transaction depth
  - Configure .slither.config.json to exclude test files and OpenZeppelin libraries

WEB:
- Create app/security/page.tsx — security dashboard:
  - Protocol status panel: paused/active, circuit breaker status, current epoch stats
  - Pause/unpause controls (admin only)
  - Circuit breaker visualization: gauge showing epochRedistributed vs threshold, time remaining in epoch
  - Invariant monitor: displays live checks of key invariants (calls view functions):
    - Total supply conservation ✓/✗
    - All nodes below threshold ✓/✗
    - Allocation weights valid ✓/✗
  - Node registry: list of all nodes with stake amounts, active/inactive status
  - Security log: display all security-relevant events (Paused, Unpaused, CircuitBreakerTriggered,
    NodeStakeSlashed) in a scrolling log
  - Attack simulation panel (testnet only): buttons to simulate known attack patterns:
    - "Dust Attack": create many tiny streams to test dust threshold
    - "Rapid Redistribution": trigger many redistributions quickly to test rate limiting
    - "Circular Flow": create A→B→C→A cycle and trigger redistribution to show convergence
```

---

## Phase 9 — UUPS upgradeability and parameter governance

```
PROMPT 9:

Make all core contracts upgradeable via UUPS proxy pattern, add governance-controlled 
parameter updates, and implement the upgrade testing methodology.

CONTRACTS:
- Refactor TBFFNetwork.sol → TBFFNetworkV1.sol as UUPS-upgradeable:
  - Inherit UUPSUpgradeable, AccessControlUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable
  - Replace constructor with initialize(ISuperToken _token, address admin) public initializer:
    __UUPSUpgradeable_init(); __AccessControl_init(); __Pausable_init(); __ReentrancyGuard_init();
    _grantRole(DEFAULT_ADMIN_ROLE, admin);
  - function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
  - Use EIP-7201 namespaced storage: 
    bytes32 constant STORAGE_SLOT = keccak256("tbff.network.storage.v1");
    struct NetworkStorage { mapping(...) nodes; address[] nodeList; ... }
    function _getStorage() internal pure returns (NetworkStorage storage $) { 
      assembly { $.slot := STORAGE_SLOT } 
    }

- Create TBFFNetworkV2.sol — demonstrates upgrade path:
  - Adds new storage fields (in a new namespace or appended to existing struct)
  - Example new feature: dynamic threshold adjustment based on network-wide metrics
  - reinitializer(2) function for V2-specific initialization

- Create script/Deploy.s.sol using Foundry scripts:
  - Deploy implementation: new TBFFNetworkV1()
  - Deploy ERC1967Proxy pointing to implementation
  - Initialize via proxy
  - Save deployed addresses to JSON file

- Create script/Upgrade.s.sol:
  - Deploy new implementation: new TBFFNetworkV2()
  - Call proxy.upgradeToAndCall(newImpl, abi.encodeCall(TBFFNetworkV2.initializeV2, (...)))

- Refactor TBFFPoolManager.sol and TBFFKeeper.sol similarly as upgradeable

- Create src/governance/TBFFGovernor.sol:
  - Timelock-controlled parameter updates:
    - setCircuitBreakerThreshold(uint256) — 24hr timelock
    - setMaxIterations(uint256) — 24hr timelock  
    - setDustThreshold(uint256) — 24hr timelock
    - emergency pause — NO timelock (immediate)
  - Multi-sig compatible (target: Gnosis Safe as admin)

- Create test/upgrade/UpgradeTest.t.sol:
  - test_upgradePreservesState: deploy V1, register nodes, set allocations, create streams,
    upgrade to V2, verify ALL state is preserved (nodes, allocations, thresholds, pool addresses)
  - test_upgradePreservesActiveStreams: verify active Superfluid streams continue after upgrade
  - test_onlyAdminCanUpgrade: non-admin address cannot call upgradeTo
  - test_initializerCannotBeCalledTwice: verify initialize reverts on re-call
  - test_storageLayoutCompatibility: verify V2 storage doesn't collide with V1

- Create test/upgrade/StorageLayout.t.sol:
  - Use forge inspect to verify storage layout compatibility between V1 and V2
  - Test that adding new storage variables doesn't shift existing slots

WEB:
- Create app/admin/page.tsx — governance and upgrade admin panel:
  - Contract info: current implementation address, proxy address, version number
  - Upgrade panel: input new implementation address, "Propose Upgrade" button 
    (goes through timelock), countdown timer for pending upgrades, "Execute Upgrade" button
  - Parameter governance:
    - Current values for all configurable parameters
    - "Propose Change" for each parameter (with timelock visualization)
    - Pending proposals list with countdown timers
  - Role management: display all role holders, grant/revoke role buttons
  - Storage inspector: read raw storage slots from proxy to verify state preservation
  - Upgrade history: list all past upgrades with implementation addresses and timestamps
  - Network health after upgrade: re-run invariant checks to confirm no state corruption
```

---

## Phase 10 — Full integration, mycorrhizal visualization, and deployment readiness

```
PROMPT 10:

Bring everything together into a production-ready integrated system with a 
mycorrhizal-network-inspired visualization and comprehensive E2E testing.

CONTRACTS — Final Integration:
- Create src/TBFFProtocol.sol — unified facade contract:
  - Single entry point wrapping TBFFNetwork, TBFFPoolManager, TBFFKeeper, AccessControl
  - Functions: registerAndConfigure(address node, NodeConfig config, Allocation[] allocs) — 
    atomic registration with config and allocations in one transaction via host.batchCall
  - Batch operations: registerMultipleNodes, setMultipleAllocations using Superfluid batch calls
  - Full event set for subgraph indexing:
    event NodeRegistered(address indexed node, uint96 minThreshold, uint96 maxThreshold, uint256 stake);
    event AllocationsUpdated(address indexed node, address[] targets, uint96[] weights);
    event RedistributionTriggered(address indexed node, uint256 overflow, uint256 iterations, uint256 gasUsed);
    event NetworkConverged(uint256 totalRedistributed, uint256 iterations, uint256 timestamp);
    event ThresholdBreached(address indexed node, uint256 balance, uint256 threshold);

- Create test/e2e/FullProtocol.t.sol — end-to-end scenario tests:
  - test_mycorrhizalScenario: 
    Setup a "forest" network: 1 Mother Tree (high threshold hub), 3 Mature Trees (medium thresholds),
    5 Seedlings (low thresholds). Mother Tree receives large external stream.
    Overflow flows: Mother → Mature Trees → Seedlings.
    Verify: all seedlings receive sustaining flow, no node above threshold after convergence,
    total conservation holds.
  - test_dynamicNetworkGrowth: start with 3 nodes, add nodes one by one, verify redistribution 
    adapts correctly each time
  - test_nodeFailureResilience: remove a node mid-stream, verify streams reroute and system recovers
  - test_fullCycleWithKeeper: deploy everything, start streams, let keeper auto-trigger redistribution
    over simulated 24 hours (warp in 1-hour increments), verify system reaches and maintains equilibrium
  - test_stressTest100Nodes: 100-node random network, verify gas < 3M on Base, convergence < 30 iterations

- Create subgraph/ directory:
  - schema.graphql: entities for Node, Stream, Redistribution, NetworkSnapshot, AllocationEdge
  - subgraph.yaml: index all TBFF events
  - src/mapping.ts: event handlers that maintain HOL entities
  - Include Superfluid's balance formula for real-time balance calculation in frontend

- Create Makefile with full CI pipeline:
  - make build — compile all contracts
  - make test — forge test (unit + integration)  
  - make fuzz — forge test with 10000 fuzz runs
  - make invariant — forge test with 1000 invariant runs, depth 100
  - make snapshot — forge snapshot for gas tracking
  - make slither — static analysis
  - make deploy-local — anvil + forge script Deploy.s.sol
  - make deploy-testnet — deploy to Base Sepolia
  - make verify — verify contracts on block explorer

WEB — Mycorrhizal Network Visualization:
- Create app/page.tsx (main dashboard) — the flagship visualization:
  - Full-screen D3.js force-directed network graph with mycorrhizal theme:
    - NODES styled as trees: Mother Trees (large, golden glow), Mature Trees (medium, green), 
      Seedlings (small, light green). Size proportional to threshold. 
      Pulsing animation when above threshold (overflowing).
    - EDGES styled as mycelial connections: organic curved paths (use D3 line curves),
      animated particles (small dots) flowing along edges proportional to flowRate,
      edge thickness proportional to allocation weight,
      color gradient: source node color → target node color
    - THRESHOLD VISUALIZATION: each node has a radial "fill gauge" showing balance/maxThreshold,
      with min threshold marked as an inner ring
    - CONVERGENCE ANIMATION: when redistribution triggers, show a ripple effect spreading 
      from the overflowing node outward through the network, with balance counters updating 
      at each hop. Animate iteration by iteration with 500ms delay between steps.
    - BACKGROUND: dark theme with subtle organic patterns suggesting soil/underground network

  - Real-time streaming balances: every node shows live-animated balance using 
    requestAnimationFrame + flowRate calculation

  - Sankey diagram view (toggle): D3 Sankey showing total fund flows from sources through 
    the network to final sinks. Shows how funds find their optimal destination via multi-hop.

  - Control panel (collapsible sidebar):
    - Add/remove nodes with drag-and-drop onto canvas
    - Click to connect nodes (creates allocation edge), set weight via slider
    - Node inspector: click node to see all details (balance, thresholds, inflows, outflows, pool info)
    - "Seed Network" preset buttons: "3-Node Simple", "5-Node Diamond", "10-Node Forest", 
      "20-Node Mycorrhizal" — pre-configured topologies
    - Global controls: Deploy to Anvil, Start Streams, Trigger Redistribution, Enable Auto-Keeper
    - Speed controls for convergence animation

  - Metrics panel (bottom bar):
    - Network health: total nodes, total flow rate, total redistributed, average convergence iterations
    - Gas costs: last redistribution gas, cumulative gas spent
    - Conservation check: total system value (continuously verified)
    - Uptime: time since last redistribution, keeper status

  - Historical view: timeline slider to scrub through past network states 
    (reconstructed from events/subgraph)

  All components responsive. Works on both desktop and mobile (simplified mobile view).
  Use Tailwind CSS + shadcn/ui for UI components. Dark mode default with light mode toggle.
```

---

## Why this sequence optimizes for learning and validation

The 10 phases follow a strict **dependency chain** where each phase builds only on what exists. Phases 1–2 establish mathematical correctness before any blockchain interaction. Phase 3 introduces the simplest possible Superfluid integration — a single node detecting thresholds. Phase 4 proves redistribution works between exactly two nodes. Only then does Phase 5 generalize to N nodes. Phase 6 introduces GDA pools as a gas optimization layer, not a prerequisite. Phases 7–9 add production concerns (automation, security, upgradeability) after core logic is proven correct. Phase 10 integrates everything.

**Every phase has a visual proof of correctness.** The Phase 1 simulator validates math independently. Phase 3's balance monitor proves streaming works. Phase 4's two-node animation shows redistribution flowing. Phase 5's network graph reveals multi-hop convergence. This visual-first approach catches bugs that unit tests miss — particularly timing issues in streaming balance calculations and edge cases in convergence behavior.

The gas profile for the core redistribution on L2 is feasible: **~1.2M gas for 100 nodes with 10 iterations on Base/Arbitrum**, costing roughly $0.02–0.10. The GDA optimization in Phase 6 reduces per-redistribution cost further by replacing N individual CFA streams with a single pool flow. For networks beyond 100 nodes, the architecture supports migration to off-chain computation with on-chain settlement via Chainlink Automation or EigenLayer AVS, though this extension falls outside the 10-phase scope.

## Critical implementation constraints to embed in every prompt

Several Superfluid-specific gotchas must be respected throughout: always etch the **ERC1820 registry** before deploying the framework in tests; use `vm.startPrank` instead of `vm.prank` to warm the SuperTokenV1Library cache; never allow `afterAgreementTerminated` callbacks to revert (wrap in try/catch); ensure GDA pool total units remain significantly lower than total flow rates to avoid rounding collapse; and account for **buffer deposits** (1 hour × flowRate on testnets, 4 hours on mainnet) when calculating available balances for redistribution. The allocation matrix's row-sum constraint (`sum(weights) == 1e18`) mathematically guarantees convergence even in cyclic networks, since overflow diminishes at each hop — this should be enforced on-write and verified as an invariant.
