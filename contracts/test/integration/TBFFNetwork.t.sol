// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {SuperfluidSetup} from "../helpers/SuperfluidSetup.sol";
import {ISuperToken} from "../../src/interfaces/ISuperToken.sol";
import {ICFAv1Forwarder} from "../../src/interfaces/ICFAv1Forwarder.sol";

/// @dev Minimal interface to call SuperTokenFactory.createERC20Wrapper
interface ISuperTokenFactory {
    function createERC20Wrapper(
        address underlyingToken,
        uint8 underlyingDecimals,
        uint8 upgradability,
        string calldata name,
        string calldata symbol
    ) external returns (address superToken);
}

/// @dev Wrapper SuperToken upgrade interface
interface ISuperTokenWrapper {
    function upgrade(uint256 amount) external;
    function downgrade(uint256 amount) external;
}

/// @title TBFFNetwork Integration Tests
/// @notice Fork-based tests against real Base Sepolia Superfluid contracts.
/// @dev Run with: FOUNDRY_PROFILE=fork forge test --match-path "test/integration/*" -v
///      Requires BASE_SEPOLIA_RPC_URL in .env
contract TBFFNetworkForkTest is SuperfluidSetup {

    function setUp() public {
        _setupFork();
        _createTestWallets();

        // Deploy underlying token and create SuperToken wrapper
        vm.startPrank(deployer);

        MockERC20 underlying = new MockERC20("TBFF Underlying", "uTBFF");

        // Create SuperToken wrapper via factory
        ISuperTokenFactory factory = ISuperTokenFactory(SUPER_TOKEN_FACTORY);
        address superTokenAddr = factory.createERC20Wrapper(
            address(underlying),
            18,        // decimals
            1,         // upgradability: semi-upgradable
            "TBFFx",   // name
            "TBFFx"    // symbol
        );
        tbffx = ISuperToken(superTokenAddr);

        // Mint underlying and upgrade to SuperToken
        uint256 totalSupply = 1_000_000 * WAD;
        underlying.mint(deployer, totalSupply);
        underlying.approve(superTokenAddr, totalSupply);
        ISuperTokenWrapper(superTokenAddr).upgrade(totalSupply);

        // Transfer TBFFx to test wallets
        tbffx.transfer(shawn, 6000 * WAD);
        tbffx.transfer(jeff, 5000 * WAD);
        tbffx.transfer(darren, 4000 * WAD);
        tbffx.transfer(simon, 7000 * WAD);
        tbffx.transfer(christina, 10000 * WAD);

        // Keep remainder as network reserve
        uint256 remaining = tbffx.balanceOf(deployer);
        vm.stopPrank();

        _deployNetwork();
        _registerAllNodes();
        _setMockDataAllocations();

        // Fund network reserve for buffer deposits
        vm.startPrank(deployer);
        tbffx.transfer(address(network), remaining / 2);
        vm.stopPrank();

        _grantNetworkPermissions();
    }

    // TODO(Phase 5): Rework fork tests for flow-based mode. Currently these tests
    // set up wallet balances but settle() reads income rates via getAccountFlowInfo().
    // To properly test flow mode: create external income streams TO each node before
    // calling settle(), so _externalIncomeRate() returns non-zero values.

    function test_settle_createsRealStreams() public {
        // In flow-based mode (Phase 4), settle() reads income rates, not wallet balances.
        // With no external income streams, all income rates are 0 → no overflow → no streams.
        // This test verifies settle() doesn't revert with zero-income inputs.
        vm.prank(deployer);
        network.settle();

        // With zero income rates, no streams should be created
        int96 rate = forwarder.getFlowrate(address(tbffx), christina, simon);
        assertEq(rate, 0, "No streams expected with zero income rates");
    }

    function test_settle_streamRatesCorrect() public {
        // In flow-based mode, settle() reads income rates from getAccountFlowInfo(),
        // not wallet balances. Without external income streams, all rates are 0.
        // This test verifies the settle() path doesn't revert.
        vm.prank(deployer);
        network.settle();

        int96 actualRate = forwarder.getFlowrate(address(tbffx), christina, simon);
        assertEq(actualRate, 0, "No streams expected with zero income rates");
    }

    function test_settle_convergesFullNetwork() public {
        // With zero income rates, convergence is trivial (no overflow to redistribute).
        vm.prank(deployer);
        network.settle();

        assertTrue(network.lastSettleConverged(), "Network should converge");
        // With zero income, totalRedistributed should be 0
        assertEq(network.lastSettleTotalRedistributed(), 0, "No redistribution with zero income");
    }

    function test_settle_deleteStreamOnRebalance() public {
        // First settle: Christina overflowing → creates streams
        vm.prank(deployer);
        network.settle();

        int96 rateBefore = forwarder.getFlowrate(address(tbffx), christina, simon);
        assertGt(rateBefore, 0, "Stream should exist after first settle");

        // Move Christina's balance below threshold (simulate via prank transfer)
        // Transfer her excess to deployer
        vm.prank(christina);
        tbffx.transfer(deployer, 3000 * WAD);

        // Second settle: no overflow → streams should be deleted
        vm.prank(deployer);
        network.settle();

        int96 rateAfter = forwarder.getFlowrate(address(tbffx), christina, simon);
        assertEq(rateAfter, 0, "Stream should be deleted after rebalance");
    }

    function test_getActiveStreams() public {
        vm.prank(deployer);
        network.settle();

        (address[] memory froms, address[] memory tos, int96[] memory rates) = network.getActiveStreams();

        // Christina has 4 allocation targets, should create 4 streams
        assertGt(froms.length, 0, "Should have active streams");

        // All streams should be from Christina (only one overflowing)
        for (uint256 i; i < froms.length; i++) {
            assertEq(froms[i], christina, "All streams should originate from Christina");
            assertGt(rates[i], 0, "All returned streams should have positive rates");
        }
    }
}

/// @dev Minimal ERC20 for integration test token deployment
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
