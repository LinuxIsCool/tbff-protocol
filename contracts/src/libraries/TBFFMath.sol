// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title TBFFMath
/// @notice Pure math library for Threshold-Based Flow Funding.
/// @dev All functions are internal pure — no storage, no state, no side effects.
///      Uses WAD (1e18) for fixed-point arithmetic.
///      The calling contract loads storage into NetworkState, calls converge(),
///      and writes results back to storage.
library TBFFMath {
    uint256 internal constant WAD = 1e18;

    /// @dev Storage-optimized struct: packs into one 256-bit slot (160 + 96 = 256).
    struct Allocation {
        address target;
        uint96 weight; // WAD: 1e18 = 100%
    }

    /// @dev In-memory representation of the full network for computation.
    ///      Uses CSR (Compressed Sparse Row) format for the allocation graph.
    ///      allocOffsets[i] = start index in allocTargets for node i.
    ///      Node i's allocations span allocTargets[allocOffsets[i]..allocOffsets[i+1]].
    struct NetworkState {
        uint256 n;
        uint256[] values;
        uint256[] thresholds;
        uint256[] allocTargets;  // flat list of target node indices
        uint96[] allocWeights;   // parallel array of WAD weights
        uint256[] allocOffsets;  // length n+1: offsets into allocTargets/allocWeights
    }

    /// @notice Cap a value to its threshold: min(value, threshold).
    function capToThreshold(uint256 value, uint256 threshold) internal pure returns (uint256) {
        return value < threshold ? value : threshold;
    }

    /// @notice Compute overflow above threshold: max(0, value - threshold).
    function computeOverflow(uint256 value, uint256 threshold) internal pure returns (uint256) {
        return value > threshold ? value - threshold : 0;
    }

    /// @notice Distribute overflow according to WAD weights.
    /// @dev REQUIRES: sum(weights) == WAD. If weights sum to > WAD, distributed amount
    ///      may exceed overflow (silent inflation). If weights sum to < WAD, the last
    ///      recipient receives the entire shortfall (unearned funds).
    ///      When weights sum to exactly WAD: sum(outputs) == overflow, with rounding
    ///      dust (at most len-1 wei) assigned to the last recipient.
    /// @param overflow The total overflow to distribute.
    /// @param weights WAD-scaled weights. MUST sum to WAD for conservation guarantee.
    /// @return amounts The amount distributed to each recipient (parallel to weights).
    function distributeOverflow(
        uint256 overflow,
        uint96[] memory weights
    ) internal pure returns (uint256[] memory amounts) {
        uint256 len = weights.length;
        amounts = new uint256[](len);
        if (overflow == 0 || len == 0) return amounts;

        uint256 distributed;
        for (uint256 i; i < len;) {
            amounts[i] = (overflow * uint256(weights[i])) / WAD;
            distributed += amounts[i];
            unchecked { ++i; }
        }

        // Assign rounding dust to last recipient for exact conservation.
        // When weights sum to WAD, dust is at most (len - 1) wei.
        if (distributed < overflow) {
            amounts[len - 1] += overflow - distributed;
        }
    }

    /// @notice Execute one full pass of the TBFF equation across all nodes.
    /// @dev For each node with overflow, distributes it to allocation targets.
    ///      Does NOT mutate state.values — returns a new array.
    /// @param state The full network state (CSR format).
    /// @return newValues The updated values after one iteration.
    /// @return changed True if any value changed (within 1 wei tolerance).
    function iterateOnce(
        NetworkState memory state
    ) internal pure returns (uint256[] memory newValues, bool changed) {
        uint256 n = state.n;
        newValues = new uint256[](n);

        // Phase 1: Cap all values to thresholds
        for (uint256 i; i < n;) {
            newValues[i] = capToThreshold(state.values[i], state.thresholds[i]);
            unchecked { ++i; }
        }

        // Phase 2: Distribute overflows
        for (uint256 i; i < n;) {
            uint256 overflow = computeOverflow(state.values[i], state.thresholds[i]);
            if (overflow > 0) {
                uint256 start = state.allocOffsets[i];
                uint256 end = state.allocOffsets[i + 1];
                uint256 allocLen = end - start;

                if (allocLen > 0) {
                    // Build weights slice for this node
                    uint96[] memory weights = new uint96[](allocLen);
                    for (uint256 j; j < allocLen;) {
                        weights[j] = state.allocWeights[start + j];
                        unchecked { ++j; }
                    }

                    uint256[] memory amounts = distributeOverflow(overflow, weights);

                    for (uint256 j; j < allocLen;) {
                        uint256 target = state.allocTargets[start + j];
                        newValues[target] += amounts[j];
                        unchecked { ++j; }
                    }
                }
                // If no allocations, overflow is lost (capped at threshold).
                // Conservation note: unallocated overflow stays "in the system"
                // only if weights sum to WAD. Rounding dust is acceptable.
            }
            unchecked { ++i; }
        }

        // Check if anything changed (tolerance: 0 — exact match required)
        for (uint256 i; i < n;) {
            if (newValues[i] != state.values[i]) {
                changed = true;
                break;
            }
            unchecked { ++i; }
        }
    }

    /// @notice Iterate the TBFF equation until convergence or max iterations.
    /// @dev The original values array passed in via state is not mutated (contents preserved).
    ///      However, state.values is reassigned internally to point at successive iteration
    ///      results. Callers should not rely on state.values after this call.
    /// @param state The full network state (working copy — state.values will be redirected).
    /// @param maxIterations Safety cap on iterations.
    /// @return finalValues The converged values.
    /// @return iterations Number of iterations executed.
    function converge(
        NetworkState memory state,
        uint256 maxIterations
    ) internal pure returns (uint256[] memory finalValues, uint256 iterations) {
        // Work on a copy so we don't mutate the input
        uint256 n = state.n;
        uint256[] memory currentValues = new uint256[](n);
        for (uint256 i; i < n;) {
            currentValues[i] = state.values[i];
            unchecked { ++i; }
        }

        for (iterations = 0; iterations < maxIterations;) {
            state.values = currentValues;
            (uint256[] memory newValues, bool changed) = iterateOnce(state);

            unchecked { ++iterations; }

            if (!changed) {
                finalValues = newValues;
                return (finalValues, iterations);
            }

            currentValues = newValues;
        }

        // Hit max iterations — return last computed state
        finalValues = currentValues;
    }
}
