# Threshold-Based Flow Funding (TBFF)

**A self-regulating resource allocation mechanism inspired by natural watershed dynamics.**

Threshold-Based Flow Funding addresses sustainable funding in decentralized networks by establishing minimum viability thresholds for participants while preventing resource concentration through controlled overflow redistribution. When any participant receives more than their maximum threshold, the excess "overflows" to others according to their allocation preferences — creating recursive flows where funds move through multiple hops before finding equilibrium. Like water in a watershed, resources automatically flow from areas of excess to areas of need.

## Core Equation

```
x^(k+1) = min(x^(k), t) + P^T · max(0, x^(k) - t)
```

In plain English: **cap each participant's balance at their threshold, then distribute the overflow to their chosen recipients according to weighted preferences.** Repeat until no one is above threshold. Conservation of funds is guaranteed when all allocation weights sum to 1.0.

## Project Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Pure math library + browser simulator | Complete |
| Phase 2 | Superfluid V2.5 streaming integration | Spec'd |

## Architecture

```
tbff2/
├── contracts/          # Foundry — Solidity math library (TBFFMath.sol)
│   ├── src/libraries/  # Pure library: capToThreshold, computeOverflow, distributeOverflow, iterateOnce, converge
│   └── test/           # 22 unit + fuzz + gas tests
├── web/                # Next.js 14 — TypeScript simulator
│   ├── src/lib/tbff/   # Engine (TypeScript mirror of TBFFMath.sol) + mock data
│   ├── src/components/ # NetworkGraph (SVG), DataTable, AllocationEditor
│   └── src/app/        # Simulator page with step-through controls
└── .claude/local/      # Research, specs, transcripts
```

The **engine mirror pattern** keeps Solidity and TypeScript implementations in lockstep. Cross-validation tests verify both produce identical outputs for the same inputs.

## Getting Started

### Contracts (Foundry)

```bash
cd contracts
~/.foundry/bin/forge test -v          # Run all 22 tests
~/.foundry/bin/forge test --gas-report # Gas benchmarks
```

### Web Simulator (Next.js)

```bash
cd web
npm install
npm run test    # Vitest — engine + cross-validation tests
npm run dev     # http://localhost:3000/simulator
npm run build   # Production build
```

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
