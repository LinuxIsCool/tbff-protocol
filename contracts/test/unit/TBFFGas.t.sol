// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../helpers/TestSetup.sol";

/// @title TBFFGas
/// @notice Gas snapshot tests for TBFF convergence at various network sizes.
contract TBFFGas is TestSetup {

    /// @dev Build a network where each node allocates equally to 2 random neighbors.
    ///      Deterministic: uses node index for "random" targets.
    function _buildNetwork(
        uint256 n,
        uint256 valuePerNode,
        uint256 threshold
    ) internal pure returns (TBFFMath.NetworkState memory) {
        uint256[] memory values = new uint256[](n);
        uint256[] memory thresholds = new uint256[](n);

        for (uint256 i; i < n;) {
            values[i] = valuePerNode;
            thresholds[i] = threshold;
            unchecked { ++i; }
        }

        // Each node allocates to next 2 nodes (wrapping)
        uint256 allocsPerNode = 2;
        uint256 totalAllocs = n * allocsPerNode;

        uint256[] memory allocTargets = new uint256[](totalAllocs);
        uint96[] memory allocWeights = new uint96[](totalAllocs);
        uint256[] memory allocOffsets = new uint256[](n + 1);

        uint96 half = uint96(WAD / 2);
        uint96 otherHalf = uint96(WAD - uint256(half));

        for (uint256 i; i < n;) {
            uint256 offset = i * allocsPerNode;
            allocOffsets[i] = offset;
            allocTargets[offset] = (i + 1) % n;
            allocTargets[offset + 1] = (i + 2) % n;
            allocWeights[offset] = half;
            allocWeights[offset + 1] = otherHalf;
            unchecked { ++i; }
        }
        allocOffsets[n] = totalAllocs;

        return TBFFMath.NetworkState({
            n: n,
            values: values,
            thresholds: thresholds,
            allocTargets: allocTargets,
            allocWeights: allocWeights,
            allocOffsets: allocOffsets
        });
    }

    function test_gas_converge_3nodes() public {
        TBFFMath.NetworkState memory state = _buildNetwork(3, 200e18, 100e18);
        vm.startSnapshotGas("converge_3nodes");
        exposed_converge(state, 50);
        uint256 gasUsed = vm.stopSnapshotGas();
        emit log_named_uint("gas_3nodes", gasUsed);
    }

    function test_gas_converge_5nodes() public {
        TBFFMath.NetworkState memory state = _buildNetwork(5, 200e18, 100e18);
        vm.startSnapshotGas("converge_5nodes");
        exposed_converge(state, 50);
        uint256 gasUsed = vm.stopSnapshotGas();
        emit log_named_uint("gas_5nodes", gasUsed);
    }

    function test_gas_converge_10nodes() public {
        TBFFMath.NetworkState memory state = _buildNetwork(10, 200e18, 100e18);
        vm.startSnapshotGas("converge_10nodes");
        exposed_converge(state, 50);
        uint256 gasUsed = vm.stopSnapshotGas();
        emit log_named_uint("gas_10nodes", gasUsed);
    }

    function test_gas_converge_20nodes() public {
        TBFFMath.NetworkState memory state = _buildNetwork(20, 200e18, 100e18);
        vm.startSnapshotGas("converge_20nodes");
        exposed_converge(state, 50);
        uint256 gasUsed = vm.stopSnapshotGas();
        emit log_named_uint("gas_20nodes", gasUsed);
    }

    function test_gas_converge_50nodes() public {
        TBFFMath.NetworkState memory state = _buildNetwork(50, 200e18, 100e18);
        vm.startSnapshotGas("converge_50nodes");
        exposed_converge(state, 50);
        uint256 gasUsed = vm.stopSnapshotGas();
        emit log_named_uint("gas_50nodes", gasUsed);
    }
}
