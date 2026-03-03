Use context7 often to ensure optimal use of tooling.

# TBFF — Project Context for AI Assistants

## Architecture

**Monorepo** with two packages mirroring the same math:

- `contracts/` — Foundry project. Pure Solidity library (`TBFFMath.sol`) + `TBFFNetwork.sol` (on-chain redistribution via Superfluid streams).
- `web/` — Next.js 14 App Router. TypeScript engine (`engine.ts`) mirrors the Solidity exactly. shadcn/ui components. wagmi v2 + RainbowKit for `/live` page.

**Engine Mirror Pattern**: Solidity and TypeScript implementations must produce identical outputs for identical inputs. Cross-validation tests enforce this. Any change to the equation in one must be reflected in the other.

## Core Equation

```
x^(k+1) = min(x^(k), t) + P^T · max(0, x^(k) - t)
```

- `x` = value vector (dimensionally agnostic: balance in WAD, or income rate in WAD/second)
- `t` = threshold vector (maxThreshold per participant)
- `P` = allocation matrix (sparse, weights sum to 1.0 per row)

## Conventions

- **Solidity**: WAD (1e18) fixed-point. `uint96` weights pack with `address` into one slot.
- **TypeScript**: `float64` (JS `number`). Dollar amounts directly.
- **Epsilon**: 1e-10 in TypeScript, exact match in Solidity (0 tolerance).
- **Cross-validation tolerance**: $0.01 per node.
- **CSR format**: Allocation graph uses Compressed Sparse Row in Solidity (`allocOffsets`, `allocTargets`, `allocWeights`).

## Key Types

```typescript
// web/src/lib/tbff/engine.ts
interface Allocation { target: string; weight: number; }  // 0-1
interface Participant { id, name, emoji, role, value, minThreshold, maxThreshold, allocations[] }
interface IterationSnapshot { iteration, values, overflows, transfers, changed }
interface ConvergenceResult { finalValues, iterations, converged, snapshots, totalRedistributed }
```

## Real Participants

5 Mycopunks members with $8K global max threshold. Demo target: Funding the Commons, mid-March 2026.

| ID | Name | Role |
|----|------|------|
| shawn | Shawn | AI Infrastructure |
| jeff | Jeff | Protocol Engineering |
| darren | Darren | GPU Engineering |
| simon | Simon | Systems Design |
| christina | Christina | Network Facilitation |

## File Map

| File | Description |
|------|-------------|
| `contracts/src/libraries/TBFFMath.sol` | Pure Solidity math library (capToThreshold, computeOverflow, distributeOverflow, iterateOnce, converge) |
| `contracts/test/unit/TBFFMath.t.sol` | 14 unit + fuzz tests for math library |
| `contracts/test/unit/TBFFGas.t.sol` | Gas snapshot tests (5/10/20/50 nodes) |
| `contracts/test/helpers/TestSetup.sol` | Shared test setup (builds NetworkState from configs) |
| `contracts/src/TBFFNetwork.sol` | On-chain redistribution controller (CSR storage, settle(), Superfluid streams) |
| `contracts/src/interfaces/ISuperToken.sol` | Minimal Superfluid SuperToken interface |
| `contracts/src/interfaces/ICFAv1Forwarder.sol` | Minimal Superfluid CFA forwarder interface |
| `contracts/src/mocks/MockSuperToken.sol` | Configurable mock for unit tests |
| `contracts/src/mocks/MockCFAv1Forwarder.sol` | Records all stream operations for test assertions |
| `contracts/test/unit/TBFFNetworkUnit.t.sol` | 36 unit + fuzz tests for TBFFNetwork (Phase 3 + Phase 4) |
| `contracts/test/helpers/SuperfluidSetup.sol` | Fork test base with wallet + deployment setup |
| `contracts/test/integration/TBFFNetwork.t.sol` | Fork-based integration tests against Base Sepolia |
| `contracts/script/Deploy.s.sol` | Deploys TBFFNetwork, registers nodes, sets allocations, funds wallets |
| `contracts/script/GrantPermissions.s.sol` | Grants operator permissions for each member |
| `web/src/lib/tbff/engine.ts` | TypeScript mirror of TBFFMath.sol |
| `web/src/lib/tbff/mock-data.ts` | 5 real participants with cross-allocations |
| `web/src/lib/tbff/allocation-utils.ts` | normalizeWeights, validateAllocations |
| `web/src/lib/tbff/__tests__/engine.test.ts` | 12 engine unit + integration tests |
| `web/src/lib/tbff/__tests__/cross-validation.test.ts` | TypeScript vs Solidity output matching |
| `web/src/lib/tbff/__tests__/allocation-editor.test.ts` | Allocation utility + engine integration tests |
| `web/src/app/simulator/page.tsx` | Main simulator page with step-through controls |
| `web/src/components/NetworkGraph.tsx` | SVG network visualization (circle layout) |
| `web/src/components/DataTable.tsx` | Balance history table with conservation check |
| `web/src/components/AllocationEditor.tsx` | Interactive weight editing with normalization |
| `web/src/lib/web3/wagmi-config.ts` | wagmi + RainbowKit config (Base Sepolia + Anvil) |
| `web/src/app/providers.tsx` | Client-side providers (Wagmi, QueryClient, RainbowKit dark theme) |
| `web/src/lib/tbff/abis/TBFFNetwork.ts` | Typed ABI for TBFFNetwork contract |
| `web/src/lib/tbff/abis/CFAv1Forwarder.ts` | Typed ABI for CFAv1Forwarder |
| `web/src/lib/tbff/chain-bridge.ts` | WAD↔USD conversion, address→metadata mapping |
| `web/src/lib/tbff/live-config.ts` | Contract addresses and chain ID constants |
| `web/src/lib/hooks/useTBFFNetwork.ts` | Reads on-chain network state (15s polling) |
| `web/src/lib/hooks/useSuperfluidStreams.ts` | Reads active CFA streams (30s polling) |
| `web/src/lib/hooks/useAnimatedBalances.ts` | 60fps balance interpolation via RAF |
| `web/src/lib/hooks/useRedistribute.ts` | settle() transaction lifecycle |
| `web/src/app/live/page.tsx` | Live blockchain-connected page with animated balances |

## Commands

```bash
# Contracts — Unit tests
cd contracts && make test-unit

# Contracts — Fork tests (requires BASE_SEPOLIA_RPC_URL in .env)
cd contracts && make test-fork

# Contracts — Deploy to Anvil
cd contracts && make deploy-anvil

# Contracts — Gas
cd contracts && ~/.foundry/bin/forge test --gas-report

# Web
cd web && npm run test    # Vitest (32 tests)
cd web && npm run dev     # Dev server
cd web && npm run build   # Production build
```

## On-Chain Architecture

**TBFFNetwork** is a single contract that manages all participants. It:
1. Reads external income rates via `getAccountFlowInfo()`, stripping TBFF's own streams
2. Runs `TBFFMath.converge()` on income rates (WAD/second) to compute overflow distribution
3. Creates/updates/deletes CFA streams via `CFAv1Forwarder.setFlowrateFrom()`

Phase 4 (flow-based convergence): values are income rates, not wallet balances. Overflow rate IS the stream rate directly — no epoch division.

**Key constants:**
- CFAv1Forwarder: `0xcfA132E353cB4E398080B9700609bb008eceB125` (all chains)
- SuperTokenFactory: `0x7447E94Dfe3d804a9f46Bf12838d467c912C8F6C` (Base Sepolia)
- WAD→USD: `Number(wad / BigInt(1e12)) / 1e6`
<claude-mem-context>
# Recent Activity

<!-- This section is auto-generated by claude-mem. Edit content outside the tags. -->

*No recent activity*
</claude-mem-context>
