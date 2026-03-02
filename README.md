# Threshold-Based Flow Funding (TBFF)

**A self-regulating resource allocation mechanism inspired by natural watershed dynamics.**

Threshold-Based Flow Funding addresses sustainable funding in decentralized networks by establishing minimum viability thresholds for participants while preventing resource concentration through controlled overflow redistribution. When any participant receives more than their maximum threshold, the excess "overflows" to others according to their allocation preferences — creating recursive flows where funds move through multiple hops before finding equilibrium. Like water in a watershed, resources automatically flow from areas of excess to areas of need.

## Core Equation

$$\mathbf{x}^{(k+1)} = \min\!\bigl(\mathbf{x}^{(k)},\; \mathbf{t}\bigr) \;+\; \mathbf{P}^{\!\top} \cdot \max\!\bigl(\mathbf{0},\; \mathbf{x}^{(k)} - \mathbf{t}\bigr)$$

| Symbol | Type | Meaning |
|--------|------|---------|
| $\mathbf{x}^{(k)}$ | vector $\in \mathbb{R}^n$ | Balance of each participant at iteration $k$ |
| $\mathbf{t}$ | vector $\in \mathbb{R}^n$ | Maximum threshold per participant (the "lake level") |
| $\mathbf{P}$ | matrix $\in \mathbb{R}^{n \times n}$ | Allocation matrix — row $i$ encodes how node $i$'s overflow is split among recipients (rows sum to 1) |
| $\mathbf{P}^{\!\top}$ | matrix $\in \mathbb{R}^{n \times n}$ | Transpose of $\mathbf{P}$ — columns become rows so overflow *arrives at* recipients |
| $\min(\mathbf{x}, \mathbf{t})$ | vector | Element-wise minimum: cap each balance at its threshold |
| $\max(\mathbf{0}, \mathbf{x} - \mathbf{t})$ | vector | Element-wise overflow: how much each balance exceeds its threshold (zero if below) |
| $k$ | scalar | Iteration counter — the equation is applied repeatedly until convergence |

In plain English: **cap each participant's balance at their threshold, then distribute the overflow to their chosen recipients according to weighted preferences.** Repeat until no one is above threshold. Conservation of funds is guaranteed when all allocation weights sum to 1.0.

## Project Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Pure math library + browser simulator | Complete |
| Phase 2 | On-chain proof with Superfluid streams | Complete |

## Architecture

```
tbff2/
├── contracts/              # Foundry — Solidity
│   ├── src/libraries/      # TBFFMath.sol — pure math library
│   ├── src/TBFFNetwork.sol # On-chain redistribution via Superfluid streams
│   ├── src/interfaces/     # Minimal ISuperToken, ICFAv1Forwarder
│   ├── src/mocks/          # Mock contracts for unit tests
│   ├── test/unit/          # 39 unit + fuzz + gas tests
│   ├── test/integration/   # Fork-based tests against Base Sepolia
│   └── script/             # Deploy + permissions scripts
├── web/                    # Next.js 14 — TypeScript
│   ├── src/lib/tbff/       # Engine, ABIs, chain bridge, mock data
│   ├── src/lib/hooks/      # useTBFFNetwork, useAnimatedBalances, etc.
│   ├── src/components/     # NetworkGraph, DataTable, AllocationEditor
│   └── src/app/            # /simulator (Phase 1) + /live (Phase 2)
└── .claude/local/          # Research, specs, transcripts
```

The **engine mirror pattern** keeps Solidity and TypeScript implementations in lockstep. Cross-validation tests verify both produce identical outputs for the same inputs.

## Getting Started

### Contracts (Foundry)

```bash
cd contracts
make test-unit             # Unit tests (TBFFMath + TBFFNetwork)
make test-fork             # Fork tests against Base Sepolia (needs .env)
make deploy-anvil          # Deploy to local Anvil
~/.foundry/bin/forge test --gas-report  # Gas benchmarks
```

### Web (Next.js)

```bash
cd web
npm install
npm run test    # Vitest — 32 engine + cross-validation tests
npm run dev     # http://localhost:3000/simulator (offline)
                # http://localhost:3000/live (on-chain)
npm run build   # Production build
```

### Live Demo (Base Sepolia)

1. Copy `.env.example` to `.env` and fill in values
2. Deploy: `cd contracts && make deploy-sepolia`
3. Grant permissions: run `GrantPermissions.s.sol` for each member
4. Set web env vars: `NEXT_PUBLIC_TBFF_NETWORK_ADDRESS`, `NEXT_PUBLIC_SUPER_TOKEN_ADDRESS`
5. Start dev server: `cd web && npm run dev`
6. Open `/live`, connect wallet, click "Trigger Redistribution"

## The Team

Five members of the Mycopunks collective building TBFF for a demo at **Funding the Commons, mid-March 2026**:

- **Shawn** — AI Infrastructure
- **Jeff** — Protocol Engineering
- **Darren** — GPU Engineering
- **Simon** — Systems Design
- **Christina** — Network Facilitation

## How It Works (Watershed Analogy)

| Natural System | TBFF Equivalent |
|---------------|-----------------|
| Rain | External funding arriving |
| Lakes | Maximum thresholds (once full, water flows out) |
| Riverbeds | Minimum thresholds (need to fill first) |
| Channels | Allocation preferences (where overflow goes) |
| Watershed | The entire participant network |

Water finds its level naturally. So does funding.

## License

MIT
