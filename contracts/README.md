# TBFF Contracts — Phase 1

Pure Solidity math library implementing the Threshold-Based Flow Funding equation.

## Core Equation

```
x^(k+1) = min(x^(k), t) + P^T * max(0, x^(k) - t)
```

## Structure

```
src/libraries/TBFFMath.sol   — Pure math library (5 functions)
test/unit/TBFFMath.t.sol     — Unit + fuzz tests (17 tests)
test/unit/TBFFGas.t.sol      — Gas snapshot tests (5 benchmarks)
test/helpers/TestSetup.sol   — Test harness exposing internal functions
```

## Key Invariant

**Conservation of funds:** `sum(finalBalances) == sum(initialBalances)`

This holds when all allocation weights sum to WAD (1e18) per node.

## Usage

```bash
# Build
forge build

# Run all tests
forge test -v

# Deep fuzz (1000 runs)
FOUNDRY_PROFILE=ci forge test --fuzz-runs 1000 -v

# Gas benchmarks
forge test --match-contract TBFFGas -vv
```

## Gas Results (Phase 1)

| Nodes | Gas |
|-------|-----|
| 3 | ~13K |
| 5 | ~21K |
| 10 | ~42K |
| 20 | ~84K |
| 50 | ~208K |

Scaling: ~4.2K gas per node (2 allocations each).
