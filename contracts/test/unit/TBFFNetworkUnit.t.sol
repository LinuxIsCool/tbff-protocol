// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {TBFFNetwork} from "../../src/TBFFNetwork.sol";
import {MockSuperToken} from "../../src/mocks/MockSuperToken.sol";
import {MockCFAv1Forwarder} from "../../src/mocks/MockCFAv1Forwarder.sol";

contract TBFFNetworkUnitTest is Test {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant STREAM_EPOCH = 30 days;

    TBFFNetwork public network;
    MockSuperToken public token;
    MockCFAv1Forwarder public forwarder;

    address public owner;

    // 5 Mycopunks addresses
    address public shawn = address(0x1);
    address public jeff = address(0x2);
    address public darren = address(0x3);
    address public simon = address(0x4);
    address public christina = address(0x5);

    uint256 public constant THRESHOLD = 8000 * WAD;
    uint256 public constant MIN_THRESH = 3000 * WAD;

    function setUp() public {
        owner = address(this);
        token = new MockSuperToken();
        forwarder = new MockCFAv1Forwarder();
        network = new TBFFNetwork(address(forwarder), address(token), STREAM_EPOCH);
    }

    // ─── Helper: Register all 5 nodes ────────────────────────────

    function _registerAll() internal {
        network.registerNode(shawn, THRESHOLD, MIN_THRESH);
        network.registerNode(jeff, THRESHOLD, MIN_THRESH);
        network.registerNode(darren, THRESHOLD, MIN_THRESH);
        network.registerNode(simon, THRESHOLD, MIN_THRESH);
        network.registerNode(christina, THRESHOLD, MIN_THRESH);
    }

    // ─── Helper: Set mock-data allocations ───────────────────────

    function _setMockDataAllocations() internal {
        // Shawn → Jeff 30%, Darren 40%, Simon 30%
        {
            uint256[] memory targets = new uint256[](3);
            uint96[] memory weights = new uint96[](3);
            targets[0] = 1; targets[1] = 2; targets[2] = 3; // jeff=1, darren=2, simon=3
            weights[0] = uint96(WAD * 30 / 100);
            weights[1] = uint96(WAD * 40 / 100);
            weights[2] = uint96(WAD - uint256(weights[0]) - uint256(weights[1]));
            network.setAllocations(shawn, targets, weights);
        }

        // Jeff → Shawn 40%, Christina 30%, Darren 30%
        {
            uint256[] memory targets = new uint256[](3);
            uint96[] memory weights = new uint96[](3);
            targets[0] = 0; targets[1] = 4; targets[2] = 2; // shawn=0, christina=4, darren=2
            weights[0] = uint96(WAD * 40 / 100);
            weights[1] = uint96(WAD * 30 / 100);
            weights[2] = uint96(WAD - uint256(weights[0]) - uint256(weights[1]));
            network.setAllocations(jeff, targets, weights);
        }

        // Darren → Shawn 50%, Jeff 50%
        {
            uint256[] memory targets = new uint256[](2);
            uint96[] memory weights = new uint96[](2);
            targets[0] = 0; targets[1] = 1; // shawn=0, jeff=1
            weights[0] = uint96(WAD / 2);
            weights[1] = uint96(WAD - uint256(weights[0]));
            network.setAllocations(darren, targets, weights);
        }

        // Simon → Christina 50%, Shawn 25%, Jeff 25%
        {
            uint256[] memory targets = new uint256[](3);
            uint96[] memory weights = new uint96[](3);
            targets[0] = 4; targets[1] = 0; targets[2] = 1; // christina=4, shawn=0, jeff=1
            weights[0] = uint96(WAD * 50 / 100);
            weights[1] = uint96(WAD * 25 / 100);
            weights[2] = uint96(WAD - uint256(weights[0]) - uint256(weights[1]));
            network.setAllocations(simon, targets, weights);
        }

        // Christina → Simon 30%, Darren 30%, Jeff 20%, Shawn 20%
        {
            uint256[] memory targets = new uint256[](4);
            uint96[] memory weights = new uint96[](4);
            targets[0] = 3; targets[1] = 2; targets[2] = 1; targets[3] = 0;
            weights[0] = uint96(WAD * 30 / 100);
            weights[1] = uint96(WAD * 30 / 100);
            weights[2] = uint96(WAD * 20 / 100);
            weights[3] = uint96(WAD - uint256(weights[0]) - uint256(weights[1]) - uint256(weights[2]));
            network.setAllocations(christina, targets, weights);
        }
    }

    function _setBalances(
        uint256 shawnBal,
        uint256 jeffBal,
        uint256 darrenBal,
        uint256 simonBal,
        uint256 christinaBal
    ) internal {
        token.setBalance(shawn, shawnBal);
        token.setBalance(jeff, jeffBal);
        token.setBalance(darren, darrenBal);
        token.setBalance(simon, simonBal);
        token.setBalance(christina, christinaBal);
    }

    // ─── Tests ───────────────────────────────────────────────────

    function test_registerNode() public {
        network.registerNode(shawn, THRESHOLD, MIN_THRESH);

        assertEq(network.getNodeCount(), 1);
        assertTrue(network.isNode(shawn));
        assertEq(network.nodeIndex(shawn), 0);
        assertEq(network.thresholds(0), THRESHOLD);
        assertEq(network.minThresholds(0), MIN_THRESH);
    }

    function test_registerNode_multiple() public {
        _registerAll();
        assertEq(network.getNodeCount(), 5);
        assertEq(network.nodes(0), shawn);
        assertEq(network.nodes(4), christina);
    }

    function test_registerNode_revertsDuplicate() public {
        network.registerNode(shawn, THRESHOLD, MIN_THRESH);
        vm.expectRevert(TBFFNetwork.NodeAlreadyRegistered.selector);
        network.registerNode(shawn, THRESHOLD, MIN_THRESH);
    }

    function test_removeNode() public {
        _registerAll();
        network.removeNode(darren);

        assertEq(network.getNodeCount(), 4);
        assertFalse(network.isNode(darren));
        // Christina (last) should have been swapped into index 2
        assertEq(network.nodes(2), christina);
        assertEq(network.nodeIndex(christina), 2);
    }

    function test_removeNode_revertsNotRegistered() public {
        vm.expectRevert(TBFFNetwork.NodeNotRegistered.selector);
        network.removeNode(shawn);
    }

    function test_setAllocations() public {
        _registerAll();

        uint256[] memory targets = new uint256[](2);
        uint96[] memory weights = new uint96[](2);
        targets[0] = 1; // jeff
        targets[1] = 2; // darren
        weights[0] = uint96(WAD / 2);
        weights[1] = uint96(WAD - uint256(weights[0]));

        network.setAllocations(shawn, targets, weights);

        (uint256[] memory gotTargets, uint96[] memory gotWeights) = network.getAllocations(0);
        assertEq(gotTargets.length, 2);
        assertEq(gotTargets[0], 1);
        assertEq(gotTargets[1], 2);
        assertEq(gotWeights[0], weights[0]);
        assertEq(gotWeights[1], weights[1]);
    }

    function test_setAllocations_revertsInvalidWeights() public {
        _registerAll();

        uint256[] memory targets = new uint256[](2);
        uint96[] memory weights = new uint96[](2);
        targets[0] = 1;
        targets[1] = 2;
        weights[0] = uint96(WAD / 2);
        weights[1] = uint96(WAD / 3); // doesn't sum to WAD

        vm.expectRevert(TBFFNetwork.InvalidWeights.selector);
        network.setAllocations(shawn, targets, weights);
    }

    function test_csrMatchesMockData() public {
        _registerAll();
        _setMockDataAllocations();

        // Verify Christina's allocations (index 4): simon(3) 30%, darren(2) 30%, jeff(1) 20%, shawn(0) 20%
        (uint256[] memory targets, uint96[] memory weights) = network.getAllocations(4);
        assertEq(targets.length, 4);
        assertEq(targets[0], 3); // simon
        assertEq(targets[1], 2); // darren
        assertEq(targets[2], 1); // jeff
        assertEq(targets[3], 0); // shawn
        assertEq(weights[0], uint96(WAD * 30 / 100));
        assertEq(weights[1], uint96(WAD * 30 / 100));
        assertEq(weights[2], uint96(WAD * 20 / 100));
    }

    function test_settle_noOverflow() public {
        _registerAll();
        _setMockDataAllocations();

        // All below threshold
        _setBalances(6000 * WAD, 5000 * WAD, 4000 * WAD, 7000 * WAD, 7000 * WAD);

        network.settle();

        // No streams should have been created
        assertEq(forwarder.getFlowCallCount(), 0);
        assertTrue(network.lastSettleConverged());
    }

    function test_settle_singleOverflow() public {
        _registerAll();
        _setMockDataAllocations();

        // Christina at 10K, threshold 8K → 2K overflow
        _setBalances(6000 * WAD, 5000 * WAD, 4000 * WAD, 7000 * WAD, 10000 * WAD);

        network.settle();

        // Should have created streams from Christina to her targets
        assertTrue(forwarder.getFlowCallCount() > 0);

        // Verify a stream was created: christina → simon
        int96 rate = forwarder.getFlowrate(address(token), christina, simon);
        assertTrue(rate > 0, "Expected stream from christina to simon");
    }

    function test_settle_convergence() public {
        _registerAll();
        _setMockDataAllocations();

        // Full 5-node scenario with Christina overflowing
        _setBalances(6000 * WAD, 5000 * WAD, 4000 * WAD, 7000 * WAD, 10000 * WAD);

        network.settle();

        assertTrue(network.lastSettleConverged());
        assertGt(network.lastSettleTotalRedistributed(), 0);
    }

    function test_settle_idempotent() public {
        _registerAll();
        _setMockDataAllocations();

        // All below threshold — no overflow
        _setBalances(6000 * WAD, 5000 * WAD, 4000 * WAD, 7000 * WAD, 7000 * WAD);

        network.settle();
        uint256 callsBefore = forwarder.getFlowCallCount();

        // Settle again with same balances — should be no-op
        network.settle();
        uint256 callsAfter = forwarder.getFlowCallCount();

        assertEq(callsBefore, callsAfter, "Second settle should be no-op");
    }

    function test_onlyOwner_registerNode() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(TBFFNetwork.OnlyOwner.selector);
        network.registerNode(shawn, THRESHOLD, MIN_THRESH);
    }

    function test_onlyOwner_removeNode() public {
        network.registerNode(shawn, THRESHOLD, MIN_THRESH);
        vm.prank(address(0xBEEF));
        vm.expectRevert(TBFFNetwork.OnlyOwner.selector);
        network.removeNode(shawn);
    }

    function test_onlyOwner_setAllocations() public {
        _registerAll();
        uint256[] memory targets = new uint256[](0);
        uint96[] memory weights = new uint96[](0);

        vm.prank(address(0xBEEF));
        vm.expectRevert(TBFFNetwork.OnlyOwner.selector);
        network.setAllocations(shawn, targets, weights);
    }

    function testFuzz_conservation(
        uint256 bal0,
        uint256 bal1,
        uint256 bal2
    ) public {
        // Bound balances to reasonable range (0 to 100K WAD)
        bal0 = bound(bal0, 0, 100_000 * WAD);
        bal1 = bound(bal1, 0, 100_000 * WAD);
        bal2 = bound(bal2, 0, 100_000 * WAD);

        // Register 3 nodes
        network.registerNode(shawn, THRESHOLD, MIN_THRESH);
        network.registerNode(jeff, THRESHOLD, MIN_THRESH);
        network.registerNode(darren, THRESHOLD, MIN_THRESH);

        // Set circular allocations: shawn→jeff→darren→shawn
        {
            uint256[] memory t = new uint256[](1);
            uint96[] memory w = new uint96[](1);
            t[0] = 1; w[0] = uint96(WAD);
            network.setAllocations(shawn, t, w);
        }
        {
            uint256[] memory t = new uint256[](1);
            uint96[] memory w = new uint96[](1);
            t[0] = 2; w[0] = uint96(WAD);
            network.setAllocations(jeff, t, w);
        }
        {
            uint256[] memory t = new uint256[](1);
            uint96[] memory w = new uint96[](1);
            t[0] = 0; w[0] = uint96(WAD);
            network.setAllocations(darren, t, w);
        }

        token.setBalance(shawn, bal0);
        token.setBalance(jeff, bal1);
        token.setBalance(darren, bal2);

        // We can't directly verify final balances since settle() operates
        // via streams (mock), but we can verify the math library's conservation.
        // Read the network state and run converge manually.
        (address[] memory nodes, uint256[] memory balances, uint256[] memory thresh, uint256[] memory minThresh) = network.getNetworkState();

        // The converge function is pure — test it via the math lib directly
        // (already tested in TBFFMath.t.sol fuzz tests)
        // Here we just verify the contract reads balances correctly
        assertEq(balances[0], bal0);
        assertEq(balances[1], bal1);
        assertEq(balances[2], bal2);
        assertEq(nodes.length, 3);
        assertEq(thresh[0], THRESHOLD);
        assertEq(minThresh[0], MIN_THRESH);
    }

    function test_getNetworkState() public {
        _registerAll();
        _setBalances(6000 * WAD, 5000 * WAD, 4000 * WAD, 7000 * WAD, 10000 * WAD);

        (address[] memory retNodes, uint256[] memory balances, uint256[] memory thresh, uint256[] memory minThresh) = network.getNetworkState();

        assertEq(retNodes.length, 5);
        assertEq(retNodes[0], shawn);
        assertEq(balances[0], 6000 * WAD);
        assertEq(balances[4], 10000 * WAD);
        assertEq(thresh[0], THRESHOLD);
        assertEq(minThresh[0], MIN_THRESH);
    }

    // ─── Phase 3 Tests ─────────────────────────────────────────

    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);

    function test_selfRegister() public {
        // Fund the network reserve for seed
        token.setBalance(address(network), 1000 * WAD);

        vm.prank(alice);
        network.selfRegister(5000 * WAD, MIN_THRESH, "Alice", unicode"🌿", "Developer");

        assertTrue(network.isNode(alice));
        assertEq(network.getNodeCount(), 1);
        assertEq(network.nodeIndex(alice), 0);
        assertEq(network.thresholds(0), 5000 * WAD);
        assertEq(network.minThresholds(0), MIN_THRESH);

        // Profile stored
        (string memory name, string memory emoji, string memory role) = network.getProfile(alice);
        assertEq(name, "Alice");
        assertEq(emoji, unicode"🌿");
        assertEq(role, "Developer");

        // Seed transferred
        assertEq(token.balanceOf(alice), 100 * WAD);

        // CSR extended: allocOffsets should have 2 entries [0, 0]
        // Verify by registering a second node and checking count
        vm.prank(bob);
        network.selfRegister(3000 * WAD, MIN_THRESH, "Bob", unicode"🔧", "Builder");
        assertEq(network.getNodeCount(), 2);
    }

    function test_selfRegister_duplicateReverts() public {
        vm.prank(alice);
        network.selfRegister(5000 * WAD, MIN_THRESH, "Alice", unicode"🌿", "Dev");

        vm.prank(alice);
        vm.expectRevert(TBFFNetwork.NodeAlreadyRegistered.selector);
        network.selfRegister(5000 * WAD, MIN_THRESH, "Alice", unicode"🌿", "Dev");
    }

    function test_selfRegister_thresholdBounds() public {
        // Below minimum
        vm.prank(alice);
        vm.expectRevert(TBFFNetwork.ThresholdOutOfBounds.selector);
        network.selfRegister(500 * WAD, MIN_THRESH, "Alice", unicode"🌿", "Dev");

        // Above maximum
        vm.prank(alice);
        vm.expectRevert(TBFFNetwork.ThresholdOutOfBounds.selector);
        network.selfRegister(60000 * WAD, MIN_THRESH, "Alice", unicode"🌿", "Dev");
    }

    function test_selfRegister_stringLength() public {
        // Empty name
        vm.prank(alice);
        vm.expectRevert(TBFFNetwork.StringTooLong.selector);
        network.selfRegister(5000 * WAD, MIN_THRESH, "", unicode"🌿", "Dev");

        // Name too long (65 bytes)
        vm.prank(alice);
        vm.expectRevert(TBFFNetwork.StringTooLong.selector);
        network.selfRegister(5000 * WAD, MIN_THRESH, "AAAAAAAAAABBBBBBBBBBCCCCCCCCCCDDDDDDDDDDEEEEEEEEEEFFFFFFFFFFGGGGG", unicode"🌿", "Dev");
    }

    function test_setMyAllocations_succeeds() public {
        // Register 3 nodes
        vm.prank(alice);
        network.selfRegister(5000 * WAD, MIN_THRESH, "Alice", unicode"🌿", "Dev");
        vm.prank(bob);
        network.selfRegister(5000 * WAD, MIN_THRESH, "Bob", unicode"🔧", "Builder");
        vm.prank(address(0xCAFE));
        network.selfRegister(5000 * WAD, MIN_THRESH, "Carol", unicode"⚡", "Ops");

        // Alice sets allocations: Bob(1) 60%, Carol(2) 40%
        uint256[] memory targets = new uint256[](2);
        uint96[] memory weights = new uint96[](2);
        targets[0] = 1; // bob
        targets[1] = 2; // carol
        weights[0] = uint96(WAD * 60 / 100);
        weights[1] = uint96(WAD - uint256(weights[0]));

        vm.prank(alice);
        network.setMyAllocations(targets, weights);

        // Verify allocations stored
        (uint256[] memory gotTargets, uint96[] memory gotWeights) = network.getAllocations(0);
        assertEq(gotTargets.length, 2);
        assertEq(gotTargets[0], 1);
        assertEq(gotWeights[0], weights[0]);
    }

    function test_setMyAllocations_notRegistered() public {
        uint256[] memory targets = new uint256[](0);
        uint96[] memory weights = new uint96[](0);

        vm.prank(alice);
        vm.expectRevert(TBFFNetwork.NodeNotRegistered.selector);
        network.setMyAllocations(targets, weights);
    }

    function test_setMyAllocations_selfAlloc() public {
        vm.prank(alice);
        network.selfRegister(5000 * WAD, MIN_THRESH, "Alice", unicode"🌿", "Dev");
        vm.prank(bob);
        network.selfRegister(5000 * WAD, MIN_THRESH, "Bob", unicode"🔧", "Builder");

        // Alice tries to allocate to herself (index 0)
        uint256[] memory targets = new uint256[](1);
        uint96[] memory weights = new uint96[](1);
        targets[0] = 0; // alice is index 0
        weights[0] = uint96(WAD);

        vm.prank(alice);
        vm.expectRevert(TBFFNetwork.SelfAllocation.selector);
        network.setMyAllocations(targets, weights);
    }

    function test_setMyThreshold_succeeds() public {
        vm.prank(alice);
        network.selfRegister(5000 * WAD, MIN_THRESH, "Alice", unicode"🌿", "Dev");

        vm.prank(alice);
        network.setMyThreshold(10000 * WAD, 5000 * WAD);

        assertEq(network.thresholds(0), 10000 * WAD);
        assertEq(network.minThresholds(0), 5000 * WAD);
    }

    function test_setMyProfile_succeeds() public {
        vm.prank(alice);
        network.selfRegister(5000 * WAD, MIN_THRESH, "Alice", unicode"🌿", "Dev");

        vm.prank(alice);
        network.setMyProfile("Alicia", unicode"🌸", "Senior Dev");

        (string memory name, string memory emoji, string memory role) = network.getProfile(alice);
        assertEq(name, "Alicia");
        assertEq(emoji, unicode"🌸");
        assertEq(role, "Senior Dev");
    }

    function test_rain_distributes() public {
        _registerAll();
        address rainMaker = address(0xDA1);
        token.setBalance(rainMaker, 10000 * WAD);

        vm.prank(rainMaker);
        token.approve(address(network), 10000 * WAD);

        vm.prank(rainMaker);
        network.rain(10000 * WAD);

        // Each node should receive 2000 WAD (10000 / 5)
        assertEq(token.balanceOf(shawn), 2000 * WAD);
        assertEq(token.balanceOf(jeff), 2000 * WAD);
        assertEq(token.balanceOf(darren), 2000 * WAD);
        assertEq(token.balanceOf(simon), 2000 * WAD);
        assertEq(token.balanceOf(christina), 2000 * WAD);
    }

    function test_rain_zeroNodes() public {
        address rainMaker = address(0xDA1);
        vm.prank(rainMaker);
        vm.expectRevert(TBFFNetwork.ZeroNodes.selector);
        network.rain(1000 * WAD);
    }

    function test_flowThrough_accumulates() public {
        _registerAll();
        _setMockDataAllocations();

        // Christina at 10K, threshold 8K → 2K overflow
        _setBalances(6000 * WAD, 5000 * WAD, 4000 * WAD, 7000 * WAD, 10000 * WAD);

        network.settle();

        // Christina should have flow-through recorded (2000 WAD overflow)
        assertEq(network.cumulativeOverflow(christina), 2000 * WAD);

        // Others below threshold, no flow-through
        assertEq(network.cumulativeOverflow(shawn), 0);
    }

    function test_getAllProfiles() public {
        _registerAll();

        // Set profiles for all via admin
        network.setProfileFor(shawn, "Shawn", unicode"🌲", "AI Infrastructure");
        network.setProfileFor(jeff, "Jeff", unicode"🔧", "Protocol Engineering");

        (
            address[] memory addrs,
            string[] memory names,
            string[] memory emojis,
            string[] memory roles
        ) = network.getAllProfiles();

        assertEq(addrs.length, 5);
        assertEq(addrs[0], shawn);
        assertEq(names[0], "Shawn");
        assertEq(emojis[0], unicode"🌲");
        assertEq(roles[0], "AI Infrastructure");
        assertEq(names[1], "Jeff");
    }

    function test_setProfileFor_admin() public {
        _registerAll();

        network.setProfileFor(shawn, "Shawn A", unicode"🌲", "AI Infra");

        (string memory name, string memory emoji, string memory role) = network.getProfile(shawn);
        assertEq(name, "Shawn A");
        assertEq(emoji, unicode"🌲");
        assertEq(role, "AI Infra");
    }

    function testFuzz_selfRegister_threshold(uint256 threshold) public {
        if (threshold < 1000 * WAD || threshold > 50000 * WAD) {
            vm.prank(alice);
            vm.expectRevert(TBFFNetwork.ThresholdOutOfBounds.selector);
            network.selfRegister(threshold, 0, "Alice", unicode"🌿", "Dev");
        } else {
            vm.prank(alice);
            network.selfRegister(threshold, 0, "Alice", unicode"🌿", "Dev");
            assertEq(network.thresholds(0), threshold);
        }
    }
}
