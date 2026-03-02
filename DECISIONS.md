# TBFF Decision Log

Decisions made during Phase 1 build, backfilled from the Mycopunks transcript and implementation session.

---

## 1. Pure Library, Not Contract

**Decision**: TBFFMath.sol is a pure Solidity library with no storage, no state, no side effects.

**Why**: The calling contract controls storage layout. This makes the math testable in isolation, upgradeable without proxy complexity in Phase 1, and reusable across different network contract designs in later phases.

---

## 2. CSR Format for Allocation Graph

**Decision**: Use Compressed Sparse Row (CSR) format for the allocation matrix in Solidity.

**Why**: For N nodes with average degree K, CSR stores N+1 offsets + N*K targets/weights instead of N^2 entries. For 100 nodes with degree 5: 500 entries vs 10,000. The math library accepts `allocOffsets[]`, `allocTargets[]`, `allocWeights[]` as flat arrays — cache-friendly and gas-efficient.

---

## 3. WAD (1e18) for Fixed-Point

**Decision**: All Solidity weights use WAD (1e18 = 100%) precision. `uint96` for weights.

**Why**: DeFi standard. `uint96` (max ~7.9e28) fits 1e18 with headroom, and packs with a 160-bit `address` into a single 256-bit storage slot. Rounding dust from distribution is at most (len-1) wei — assigned to the last recipient.

---

## 4. TypeScript Mirror as Reference Implementation

**Decision**: The web simulator implements the exact same equation in TypeScript (`float64`) as the Solidity library.

**Why**: Cross-validation tests verify both produce identical outputs. TypeScript runs in the browser for instant feedback. Solidity proves on-chain correctness. Any divergence is a bug.

---

## 5. Plain SVG, No D3

**Decision**: Phase 1 network visualization uses hand-rolled SVG, not D3.js.

**Why**: For 5-8 nodes in a circle layout, D3's force simulation is overkill. Plain SVG with quadratic Bezier curves for edges is ~150 lines of code. D3 comes in Phase 5+ when we need force-directed layouts for 50+ nodes.

---

## 6. Five Real Participants ($8K Global Max)

**Decision**: Replace fictional mock data with 5 real Mycopunks members: Shawn, Jeff, Darren, Simon, Christina. All share $3K min / $8K max thresholds.

**Why**: This is a demo for Funding the Commons mid-March 2026. Real names and roles make the demo tangible. Christina starts at $10K (above threshold) so the overflow mechanism activates immediately on first run.

---

## 7. Contract-First Phase 2 (Superfluid)

**Decision**: Phase 2 adds Superfluid V2.5 testing infrastructure to the existing Foundry project before touching the web layer.

**Why**: The playbook specifies contracts first, then web extensions. Superfluid test setup (ERC1820 registry, framework deployment, TBFFx token) is the foundation for all streaming tests. Web gets streaming mode toggle only after contract tests prove the streaming model works.

---

## 8. Self-Service Allocation Model

**Decision**: Each participant sets their own overflow allocation preferences. No central authority decides where funds flow.

**Why**: Core design principle from the Mycopunks transcript. Network intelligence > central planning. "The people in the system know more than any central authority about where resources should go." This is what makes TBFF a collective intelligence mechanism rather than a top-down distribution scheme.

---

## 9. $3K Min / $8K Max Starting Thresholds

**Decision**: All 5 participants start with identical $3,000 minimum and $8,000 maximum thresholds.

**Why**: Simplifies the Phase 1 demo. Equal thresholds make the overflow math visually obvious. The min threshold is display-only in Phase 1 (the equation only uses max). Real threshold differentiation comes when the self-service UI allows editing in Phase 2+.

---

## 10. Single TBFFNetwork Contract (Not Per-Node Super Apps)

**Decision**: Use a single `TBFFNetwork` contract that manages all participants, rather than deploying a Super App per node.

**Why**: Per-node Super Apps would require each to implement `afterAgreementCreated`/`Updated`/`Terminated` callbacks, with complex inter-app coordination for the redistribution logic. A single controller contract is simpler to reason about, cheaper to deploy, and sufficient for the 5-node demo. The trade-off is that `settle()` is called externally rather than being trigger-reactive — acceptable for a demo where we control the trigger.

---

## 11. Fork-Based Testing (Not Local Framework Deployment)

**Decision**: Integration tests fork Base Sepolia rather than deploying the full Superfluid framework locally.

**Why**: Superfluid's local deployment requires ERC1820, Host, CFA, SuperTokenFactory, and governance contracts — hundreds of lines of setup code that's fragile across SDK versions. Forking Base Sepolia gives us real, battle-tested contracts with zero deployment code. Tests run against the same contracts the demo will use. Trade-off: requires an RPC URL and is slower than pure local tests.

---

## 12. Minimal Interfaces (Not Full Superfluid Monorepo)

**Decision**: Define only the function signatures we actually call (`ISuperToken`, `ICFAv1Forwarder`) rather than importing the full `@superfluid-finance/ethereum-contracts` package.

**Why**: The Superfluid monorepo is large, has complex build requirements, and version-pins Solidity. We only need ~10 function signatures total. Minimal interfaces keep compilation fast, avoid dependency conflicts, and make the contract's external surface explicit.

---

## 13. Operator Pattern (Participants Keep Custody)

**Decision**: Each participant holds their own TBFFx tokens. The TBFFNetwork contract acts as a CFA operator — participants grant it permission to create/update/delete streams on their behalf.

**Why**: Participants never transfer custody to the contract. They can revoke permissions at any time. This matches the self-sovereign ethos from the Mycopunks transcript. The network contract is a coordinator, not a custodian. For the demo, `GrantPermissions.s.sol` handles the setup.
