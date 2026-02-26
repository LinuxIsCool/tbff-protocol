// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../src/libraries/TBFFMath.sol";

/// @title TestSetup
/// @notice Helper contract that exposes TBFFMath's internal functions for testing
///         and provides utilities for building NetworkState structs.
contract TestSetup is Test {
    using TBFFMath for *;

    uint256 internal constant WAD = 1e18;

    /// @dev Build a NetworkState from arrays. Validates lengths.
    function buildNetworkState(
        uint256[] memory balances,
        uint256[] memory thresholds,
        uint256[] memory allocTargets,
        uint96[] memory allocWeights,
        uint256[] memory allocOffsets
    ) internal pure returns (TBFFMath.NetworkState memory) {
        require(balances.length == thresholds.length, "length mismatch: balances/thresholds");
        require(allocOffsets.length == balances.length + 1, "length mismatch: allocOffsets");
        require(allocTargets.length == allocWeights.length, "length mismatch: targets/weights");

        return TBFFMath.NetworkState({
            n: balances.length,
            balances: balances,
            thresholds: thresholds,
            allocTargets: allocTargets,
            allocWeights: allocWeights,
            allocOffsets: allocOffsets
        });
    }

    /// @dev Sum all elements in an array.
    function sumArray(uint256[] memory arr) internal pure returns (uint256 total) {
        for (uint256 i; i < arr.length;) {
            total += arr[i];
            unchecked { ++i; }
        }
    }

    /// @dev Expose capToThreshold for testing.
    function exposed_capToThreshold(uint256 balance, uint256 threshold) public pure returns (uint256) {
        return TBFFMath.capToThreshold(balance, threshold);
    }

    /// @dev Expose computeOverflow for testing.
    function exposed_computeOverflow(uint256 balance, uint256 threshold) public pure returns (uint256) {
        return TBFFMath.computeOverflow(balance, threshold);
    }

    /// @dev Expose distributeOverflow for testing.
    function exposed_distributeOverflow(
        uint256 overflow,
        uint96[] memory weights
    ) public pure returns (uint256[] memory) {
        return TBFFMath.distributeOverflow(overflow, weights);
    }

    /// @dev Expose iterateOnce for testing.
    function exposed_iterateOnce(
        TBFFMath.NetworkState memory state
    ) public pure returns (uint256[] memory, bool) {
        return TBFFMath.iterateOnce(state);
    }

    /// @dev Expose converge for testing.
    function exposed_converge(
        TBFFMath.NetworkState memory state,
        uint256 maxIterations
    ) public pure returns (uint256[] memory, uint256) {
        return TBFFMath.converge(state, maxIterations);
    }
}
