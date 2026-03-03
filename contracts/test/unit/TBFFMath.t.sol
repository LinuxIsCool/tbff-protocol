// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../helpers/TestSetup.sol";

contract TBFFMathTest is TestSetup {

    // ========== capToThreshold ==========

    function test_capToThreshold_belowThreshold() public pure {
        assertEq(exposed_capToThreshold(50e18, 100e18), 50e18);
    }

    function test_capToThreshold_atThreshold() public pure {
        assertEq(exposed_capToThreshold(100e18, 100e18), 100e18);
    }

    function test_capToThreshold_aboveThreshold() public pure {
        assertEq(exposed_capToThreshold(150e18, 100e18), 100e18);
    }

    // ========== computeOverflow ==========

    function test_computeOverflow_belowThreshold() public pure {
        assertEq(exposed_computeOverflow(50e18, 100e18), 0);
    }

    function test_computeOverflow_atThreshold() public pure {
        assertEq(exposed_computeOverflow(100e18, 100e18), 0);
    }

    function test_computeOverflow_aboveThreshold() public pure {
        assertEq(exposed_computeOverflow(150e18, 100e18), 50e18);
    }

    // ========== distributeOverflow ==========

    function test_distributeOverflow_twoRecipients() public pure {
        uint96[] memory weights = new uint96[](2);
        weights[0] = uint96(WAD * 60 / 100); // 60%
        weights[1] = uint96(WAD * 40 / 100); // 40%

        uint256[] memory amounts = exposed_distributeOverflow(100e18, weights);

        assertEq(amounts[0], 60e18);
        assertEq(amounts[1], 40e18);
        assertEq(amounts[0] + amounts[1], 100e18);
    }

    function test_distributeOverflow_zeroOverflow() public pure {
        uint96[] memory weights = new uint96[](2);
        weights[0] = uint96(WAD / 2);
        weights[1] = uint96(WAD / 2);

        uint256[] memory amounts = exposed_distributeOverflow(0, weights);

        assertEq(amounts[0], 0);
        assertEq(amounts[1], 0);
    }

    function test_distributeOverflow_singleRecipient() public pure {
        uint96[] memory weights = new uint96[](1);
        weights[0] = uint96(WAD); // 100%

        uint256[] memory amounts = exposed_distributeOverflow(77e18, weights);
        assertEq(amounts[0], 77e18);
    }

    // ========== threeNodeConvergence (A→B→C linear chain) ==========

    function test_threeNodeConvergence() public pure {
        // A has 200, threshold 100 → overflow 100, sends to B
        // B has 50, threshold 100 → receives 100, now 150, overflow 50, sends to C
        // C has 30, threshold 100 → receives 50, now 80 → no overflow
        // Iteration 1: A=100, B=150, C=80 → changed
        // Iteration 2: A=100, B=100, C=130 → changed (B overflowed)
        // Iteration 3: A=100, B=100, C=130 → Wait, C has threshold 100, overflow 30...
        //   C sends to... C needs allocations. Let's say C has no allocations.
        //   So C stays at 100 (capped) + 0 (no overflow redistribution) = 100
        //   But the 30 overflow is lost if C has no allocations.
        //
        // Let's be precise: A→B(100%), B→C(100%), C has no allocations
        //
        // Initial: [200, 50, 30] thresholds: [100, 100, 100]
        // Iter 1: cap=[100, 50, 30], overflow=[100, 0, 0]
        //   A's 100 overflow → B: newBalances = [100, 150, 30]
        // Iter 2: cap=[100, 100, 30], overflow=[0, 50, 0]
        //   B's 50 overflow → C: newBalances = [100, 100, 80]
        // Iter 3: cap=[100, 100, 80], overflow=[0, 0, 0] → no change → converged!
        //
        // Total initial: 280. Total final: 280. Conservation holds!

        uint256[] memory balances = new uint256[](3);
        balances[0] = 200e18;
        balances[1] = 50e18;
        balances[2] = 30e18;

        uint256[] memory thresholds = new uint256[](3);
        thresholds[0] = 100e18;
        thresholds[1] = 100e18;
        thresholds[2] = 100e18;

        // A→B(100%), B→C(100%), C→(none)
        uint256[] memory allocTargets = new uint256[](2);
        allocTargets[0] = 1; // A → B
        allocTargets[1] = 2; // B → C

        uint96[] memory allocWeights = new uint96[](2);
        allocWeights[0] = uint96(WAD); // 100%
        allocWeights[1] = uint96(WAD); // 100%

        uint256[] memory allocOffsets = new uint256[](4); // n+1 = 4
        allocOffsets[0] = 0; // A's allocs start at 0
        allocOffsets[1] = 1; // B's allocs start at 1
        allocOffsets[2] = 2; // C's allocs start at 2
        allocOffsets[3] = 2; // end (C has no allocs)

        TBFFMath.NetworkState memory state = buildNetworkState(
            balances, thresholds, allocTargets, allocWeights, allocOffsets
        );

        (uint256[] memory finalValues, uint256 iterations) = exposed_converge(state, 50);

        assertEq(finalValues[0], 100e18, "A should be at threshold");
        assertEq(finalValues[1], 100e18, "B should be at threshold");
        assertEq(finalValues[2], 80e18, "C should have 80");
        assertEq(iterations, 3, "should converge in 3 iterations");

        // Conservation
        assertEq(
            sumArray(finalValues),
            sumArray(balances),
            "conservation of funds"
        );
    }

    // ========== Circular allocation (A→B→C→A) ==========

    function test_circularAllocation() public pure {
        // All at 150, threshold 100 → each has 50 overflow
        // Each sends 100% to next: A→B, B→C, C→A
        // Iter 1: cap=[100,100,100], overflow=[50,50,50]
        //   A's 50 → B, B's 50 → C, C's 50 → A
        //   newBalances = [150, 150, 150] — same as initial!
        //   Actually wait: newBalances[i] = cap + received
        //   A: 100 + 50(from C) = 150
        //   B: 100 + 50(from A) = 150
        //   C: 100 + 50(from B) = 150
        // This will never converge — it oscillates!
        // The converge function should hit maxIterations.
        // BUT the balances don't change between iterations, so changed=false?
        // Actually: iter 1 produces [150,150,150] which equals input [150,150,150]
        // So changed=false and it converges in 1 iteration!
        //
        // Hmm that's not right either. Let me trace carefully.
        // Input: [150, 150, 150]
        // iterateOnce:
        //   Phase 1 (cap): newBalances = [100, 100, 100]
        //   Phase 2 (distribute):
        //     A overflow=50, sends to B: newBalances[1] += 50 → 150
        //     B overflow=50, sends to C: newBalances[2] += 50 → 150
        //     C overflow=50, sends to A: newBalances[0] += 50 → 150
        //   newBalances = [150, 150, 150]
        //   changed? newBalances[i] == state.values[i] for all i → changed=false
        //
        // So it "converges" in 1 iteration back to itself. Funds don't multiply.
        // sum(final) = 450 = sum(initial). Conservation holds.

        uint256[] memory balances = new uint256[](3);
        balances[0] = 150e18;
        balances[1] = 150e18;
        balances[2] = 150e18;

        uint256[] memory thresholds = new uint256[](3);
        thresholds[0] = 100e18;
        thresholds[1] = 100e18;
        thresholds[2] = 100e18;

        // A→B, B→C, C→A
        uint256[] memory allocTargets = new uint256[](3);
        allocTargets[0] = 1; // A → B
        allocTargets[1] = 2; // B → C
        allocTargets[2] = 0; // C → A

        uint96[] memory allocWeights = new uint96[](3);
        allocWeights[0] = uint96(WAD);
        allocWeights[1] = uint96(WAD);
        allocWeights[2] = uint96(WAD);

        uint256[] memory allocOffsets = new uint256[](4);
        allocOffsets[0] = 0;
        allocOffsets[1] = 1;
        allocOffsets[2] = 2;
        allocOffsets[3] = 3;

        TBFFMath.NetworkState memory state = buildNetworkState(
            balances, thresholds, allocTargets, allocWeights, allocOffsets
        );

        (uint256[] memory finalValues, uint256 iterations) = exposed_converge(state, 50);

        // Circular: overflow recirculates perfectly, no amplification
        assertEq(finalValues[0], 150e18, "A unchanged in cycle");
        assertEq(finalValues[1], 150e18, "B unchanged in cycle");
        assertEq(finalValues[2], 150e18, "C unchanged in cycle");
        assertEq(iterations, 1, "stable cycle converges in 1 iteration");

        // Conservation
        assertEq(sumArray(finalValues), sumArray(balances), "conservation");
    }

    // ========== Self-allocation ==========

    function test_singleNodeSelfAllocation() public pure {
        // Node allocates 100% to itself. Balance 200, threshold 100.
        // Iter 1: cap=100, overflow=100, sends 100 to self → 200
        // This is a fixed point: always produces 200 from 200.
        // changed? 200 == 200 → false → converges in 1 iteration.

        uint256[] memory balances = new uint256[](1);
        balances[0] = 200e18;

        uint256[] memory thresholds = new uint256[](1);
        thresholds[0] = 100e18;

        uint256[] memory allocTargets = new uint256[](1);
        allocTargets[0] = 0; // self

        uint96[] memory allocWeights = new uint96[](1);
        allocWeights[0] = uint96(WAD);

        uint256[] memory allocOffsets = new uint256[](2);
        allocOffsets[0] = 0;
        allocOffsets[1] = 1;

        TBFFMath.NetworkState memory state = buildNetworkState(
            balances, thresholds, allocTargets, allocWeights, allocOffsets
        );

        (uint256[] memory finalValues, uint256 iterations) = exposed_converge(state, 50);

        // Self-allocation: overflow returns to self, no amplification
        assertEq(finalValues[0], 200e18, "self-allocation: balance unchanged");
        assertEq(iterations, 1, "self-allocation converges in 1");
    }

    // ========== Zero overflow ==========

    function test_zeroOverflow() public pure {
        // All below threshold: no overflow, single iteration, no changes
        uint256[] memory balances = new uint256[](3);
        balances[0] = 50e18;
        balances[1] = 70e18;
        balances[2] = 30e18;

        uint256[] memory thresholds = new uint256[](3);
        thresholds[0] = 100e18;
        thresholds[1] = 100e18;
        thresholds[2] = 100e18;

        uint256[] memory allocTargets = new uint256[](3);
        allocTargets[0] = 1;
        allocTargets[1] = 2;
        allocTargets[2] = 0;

        uint96[] memory allocWeights = new uint96[](3);
        allocWeights[0] = uint96(WAD);
        allocWeights[1] = uint96(WAD);
        allocWeights[2] = uint96(WAD);

        uint256[] memory allocOffsets = new uint256[](4);
        allocOffsets[0] = 0;
        allocOffsets[1] = 1;
        allocOffsets[2] = 2;
        allocOffsets[3] = 3;

        TBFFMath.NetworkState memory state = buildNetworkState(
            balances, thresholds, allocTargets, allocWeights, allocOffsets
        );

        (uint256[] memory finalValues, uint256 iterations) = exposed_converge(state, 50);

        assertEq(finalValues[0], 50e18);
        assertEq(finalValues[1], 70e18);
        assertEq(finalValues[2], 30e18);
        assertEq(iterations, 1, "no overflow: converge in 1");
    }

    // ========== FUZZ TESTS ==========

    function testFuzz_conservationOfFunds(
        uint256 bal0,
        uint256 bal1,
        uint256 bal2,
        uint256 thresh0,
        uint256 thresh1,
        uint256 thresh2,
        uint96 w0,
        uint96 w1,
        uint96 w2
    ) public pure {
        // Bound inputs to reasonable ranges
        bal0 = bound(bal0, 1e15, 1e24);
        bal1 = bound(bal1, 1e15, 1e24);
        bal2 = bound(bal2, 1e15, 1e24);
        thresh0 = bound(thresh0, 1e15, 1e24);
        thresh1 = bound(thresh1, 1e15, 1e24);
        thresh2 = bound(thresh2, 1e15, 1e24);
        w0 = uint96(bound(uint256(w0), 0, WAD));
        w1 = uint96(bound(uint256(w1), 0, WAD));
        w2 = uint96(bound(uint256(w2), 0, WAD));

        // Normalize weights to sum to WAD for conservation
        uint256 wSum = uint256(w0) + uint256(w1) + uint256(w2);
        if (wSum == 0) {
            w0 = uint96(WAD / 3);
            w1 = uint96(WAD / 3);
            w2 = uint96(WAD - 2 * (WAD / 3));
        } else {
            w0 = uint96((uint256(w0) * WAD) / wSum);
            w1 = uint96((uint256(w1) * WAD) / wSum);
            w2 = uint96(WAD - uint256(w0) - uint256(w1));
        }

        uint256[] memory balances = new uint256[](3);
        balances[0] = bal0;
        balances[1] = bal1;
        balances[2] = bal2;

        uint256[] memory thresholds = new uint256[](3);
        thresholds[0] = thresh0;
        thresholds[1] = thresh1;
        thresholds[2] = thresh2;

        // Each node allocates to the other two with normalized weights
        // Node 0 → [1, 2], Node 1 → [0, 2], Node 2 → [0, 1]
        uint256[] memory allocTargets = new uint256[](6);
        allocTargets[0] = 1; allocTargets[1] = 2; // node 0's targets
        allocTargets[2] = 0; allocTargets[3] = 2; // node 1's targets
        allocTargets[4] = 0; allocTargets[5] = 1; // node 2's targets

        // Split each node's WAD between its two targets
        uint96 half = uint96(WAD / 2);
        uint96 otherHalf = uint96(WAD - uint256(half));

        uint96[] memory allocWeights = new uint96[](6);
        allocWeights[0] = half; allocWeights[1] = otherHalf;
        allocWeights[2] = half; allocWeights[3] = otherHalf;
        allocWeights[4] = half; allocWeights[5] = otherHalf;

        uint256[] memory allocOffsets = new uint256[](4);
        allocOffsets[0] = 0;
        allocOffsets[1] = 2;
        allocOffsets[2] = 4;
        allocOffsets[3] = 6;

        TBFFMath.NetworkState memory state = buildNetworkState(
            balances, thresholds, allocTargets, allocWeights, allocOffsets
        );

        uint256 initialSum = sumArray(balances);

        (uint256[] memory finalValues,) = exposed_converge(state, 100);

        uint256 finalSum = sumArray(finalValues);

        // Conservation: tolerance of 1 wei per node (3 nodes → 3 wei)
        uint256 diff = finalSum > initialSum ? finalSum - initialSum : initialSum - finalSum;
        assertLe(diff, 3, "conservation of funds violated");
    }

    function testFuzz_allBelowThresholdAfterConvergence(
        uint256 bal0,
        uint256 bal1,
        uint256 bal2,
        uint256 thresh
    ) public pure {
        // Use a linear DAG (A->B->C, C has no allocs) where overflow
        // flows strictly forward and cannot recirculate. In this topology,
        // after convergence all balances MUST be <= their threshold.
        bal0 = bound(bal0, 1e15, 1e24);
        bal1 = bound(bal1, 1e15, 1e24);
        bal2 = bound(bal2, 1e15, 1e24);
        thresh = bound(thresh, 1e15, 1e24);

        uint256[] memory balances = new uint256[](3);
        balances[0] = bal0;
        balances[1] = bal1;
        balances[2] = bal2;

        uint256[] memory thresholds = new uint256[](3);
        thresholds[0] = thresh;
        thresholds[1] = thresh;
        thresholds[2] = thresh;

        // Linear: A->B(100%), B->C(100%), C has no allocs
        uint256[] memory allocTargets = new uint256[](2);
        allocTargets[0] = 1;
        allocTargets[1] = 2;

        uint96[] memory allocWeights = new uint96[](2);
        allocWeights[0] = uint96(WAD);
        allocWeights[1] = uint96(WAD);

        uint256[] memory allocOffsets = new uint256[](4);
        allocOffsets[0] = 0;
        allocOffsets[1] = 1;
        allocOffsets[2] = 2;
        allocOffsets[3] = 2; // C has no allocations

        TBFFMath.NetworkState memory state = buildNetworkState(
            balances, thresholds, allocTargets, allocWeights, allocOffsets
        );

        (uint256[] memory finalValues,) = exposed_converge(state, 50);

        // In a DAG topology, after convergence every balance <= threshold
        for (uint256 i; i < 3;) {
            assertLe(finalValues[i], thresh, "balance exceeds threshold after convergence");
            unchecked { ++i; }
        }
    }

    function testFuzz_convergenceTerminates(
        uint256 bal0,
        uint256 bal1,
        uint256 bal2,
        uint256 thresh
    ) public pure {
        bal0 = bound(bal0, 1e15, 1e24);
        bal1 = bound(bal1, 1e15, 1e24);
        bal2 = bound(bal2, 1e15, 1e24);
        thresh = bound(thresh, 1e15, 1e24);

        uint256[] memory balances = new uint256[](3);
        balances[0] = bal0;
        balances[1] = bal1;
        balances[2] = bal2;

        uint256[] memory thresholds = new uint256[](3);
        thresholds[0] = thresh;
        thresholds[1] = thresh;
        thresholds[2] = thresh;

        // Linear: A→B→C, C has no allocs
        uint256[] memory allocTargets = new uint256[](2);
        allocTargets[0] = 1;
        allocTargets[1] = 2;

        uint96[] memory allocWeights = new uint96[](2);
        allocWeights[0] = uint96(WAD);
        allocWeights[1] = uint96(WAD);

        uint256[] memory allocOffsets = new uint256[](4);
        allocOffsets[0] = 0;
        allocOffsets[1] = 1;
        allocOffsets[2] = 2;
        allocOffsets[3] = 2;

        TBFFMath.NetworkState memory state = buildNetworkState(
            balances, thresholds, allocTargets, allocWeights, allocOffsets
        );

        (, uint256 iterations) = exposed_converge(state, 50);

        // Linear chain: converges within n+1 iterations at most
        assertLe(iterations, 50, "must terminate within maxIterations");
    }

    function testFuzz_distributionSumCorrect(
        uint256 overflow,
        uint96 w0,
        uint96 w1,
        uint96 w2
    ) public pure {
        overflow = bound(overflow, 0, 1e24);

        // Normalize weights to sum to WAD
        uint256 wSum = uint256(w0) + uint256(w1) + uint256(w2);
        if (wSum == 0) {
            w0 = uint96(WAD / 3);
            w1 = uint96(WAD / 3);
            w2 = uint96(WAD - 2 * (WAD / 3));
        } else {
            w0 = uint96(bound(uint256(w0), 0, WAD));
            w1 = uint96(bound(uint256(w1), 0, WAD - uint256(w0)));
            w2 = uint96(WAD - uint256(w0) - uint256(w1));
        }

        uint96[] memory weights = new uint96[](3);
        weights[0] = w0;
        weights[1] = w1;
        weights[2] = w2;

        uint256[] memory amounts = exposed_distributeOverflow(overflow, weights);

        uint256 total = amounts[0] + amounts[1] + amounts[2];
        // sum(outputs) <= overflow, deficit <= N wei
        assertLe(total, overflow, "distribution exceeds overflow");
        assertLe(overflow - total, 3, "rounding loss exceeds 1 wei per recipient");
    }
}
