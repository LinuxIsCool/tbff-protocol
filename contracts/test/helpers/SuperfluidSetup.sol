// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ISuperToken} from "../../src/interfaces/ISuperToken.sol";
import {ICFAv1Forwarder} from "../../src/interfaces/ICFAv1Forwarder.sol";
import {TBFFNetwork} from "../../src/TBFFNetwork.sol";

/// @title SuperfluidSetup
/// @notice Base contract for fork-based integration tests against Base Sepolia Superfluid.
/// @dev Requires BASE_SEPOLIA_RPC_URL environment variable.
abstract contract SuperfluidSetup is Test {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant STREAM_EPOCH = 30 days;
    uint256 internal constant THRESHOLD = 8000 * WAD;

    // Base Sepolia Superfluid addresses
    address internal constant CFA_FORWARDER = 0xcfA132E353cB4E398080B9700609bb008eceB125;
    address internal constant SUPER_TOKEN_FACTORY = 0x7447E94Dfe3d804a9f46Bf12838d467c912C8F6C;

    ICFAv1Forwarder internal forwarder = ICFAv1Forwarder(CFA_FORWARDER);

    TBFFNetwork internal network;
    ISuperToken internal tbffx;

    // Test wallets (funded via vm.deal)
    address internal shawn;
    address internal jeff;
    address internal darren;
    address internal simon;
    address internal christina;
    address internal deployer;

    uint256 internal forkId;

    function _setupFork() internal {
        string memory rpcUrl = vm.envString("BASE_SEPOLIA_RPC_URL");
        forkId = vm.createFork(rpcUrl);
        vm.selectFork(forkId);
    }

    function _createTestWallets() internal {
        deployer = makeAddr("deployer");
        shawn = makeAddr("shawn");
        jeff = makeAddr("jeff");
        darren = makeAddr("darren");
        simon = makeAddr("simon");
        christina = makeAddr("christina");

        // Fund ETH for gas
        vm.deal(deployer, 10 ether);
        vm.deal(shawn, 1 ether);
        vm.deal(jeff, 1 ether);
        vm.deal(darren, 1 ether);
        vm.deal(simon, 1 ether);
        vm.deal(christina, 1 ether);
    }

    function _deployNetwork() internal {
        vm.startPrank(deployer);
        network = new TBFFNetwork(CFA_FORWARDER, address(tbffx), STREAM_EPOCH);
        vm.stopPrank();
    }

    function _registerAllNodes() internal {
        vm.startPrank(deployer);
        network.registerNode(shawn, THRESHOLD);
        network.registerNode(jeff, THRESHOLD);
        network.registerNode(darren, THRESHOLD);
        network.registerNode(simon, THRESHOLD);
        network.registerNode(christina, THRESHOLD);
        vm.stopPrank();
    }

    function _setMockDataAllocations() internal {
        vm.startPrank(deployer);

        // Shawn → Jeff 30%, Darren 40%, Simon 30%
        {
            uint256[] memory t = new uint256[](3);
            uint96[] memory w = new uint96[](3);
            t[0] = 1; t[1] = 2; t[2] = 3;
            w[0] = uint96(WAD * 30 / 100);
            w[1] = uint96(WAD * 40 / 100);
            w[2] = uint96(WAD - uint256(w[0]) - uint256(w[1]));
            network.setAllocations(shawn, t, w);
        }

        // Jeff → Shawn 40%, Christina 30%, Darren 30%
        {
            uint256[] memory t = new uint256[](3);
            uint96[] memory w = new uint96[](3);
            t[0] = 0; t[1] = 4; t[2] = 2;
            w[0] = uint96(WAD * 40 / 100);
            w[1] = uint96(WAD * 30 / 100);
            w[2] = uint96(WAD - uint256(w[0]) - uint256(w[1]));
            network.setAllocations(jeff, t, w);
        }

        // Darren → Shawn 50%, Jeff 50%
        {
            uint256[] memory t = new uint256[](2);
            uint96[] memory w = new uint96[](2);
            t[0] = 0; t[1] = 1;
            w[0] = uint96(WAD / 2);
            w[1] = uint96(WAD - uint256(w[0]));
            network.setAllocations(darren, t, w);
        }

        // Simon → Christina 50%, Shawn 25%, Jeff 25%
        {
            uint256[] memory t = new uint256[](3);
            uint96[] memory w = new uint96[](3);
            t[0] = 4; t[1] = 0; t[2] = 1;
            w[0] = uint96(WAD * 50 / 100);
            w[1] = uint96(WAD * 25 / 100);
            w[2] = uint96(WAD - uint256(w[0]) - uint256(w[1]));
            network.setAllocations(simon, t, w);
        }

        // Christina → Simon 30%, Darren 30%, Jeff 20%, Shawn 20%
        {
            uint256[] memory t = new uint256[](4);
            uint96[] memory w = new uint96[](4);
            t[0] = 3; t[1] = 2; t[2] = 1; t[3] = 0;
            w[0] = uint96(WAD * 30 / 100);
            w[1] = uint96(WAD * 30 / 100);
            w[2] = uint96(WAD * 20 / 100);
            w[3] = uint96(WAD - uint256(w[0]) - uint256(w[1]) - uint256(w[2]));
            network.setAllocations(christina, t, w);
        }

        vm.stopPrank();
    }

    function _grantNetworkPermissions() internal {
        address networkAddr = address(network);
        address tokenAddr = address(tbffx);

        vm.prank(shawn);
        forwarder.grantPermissions(tokenAddr, networkAddr);
        vm.prank(jeff);
        forwarder.grantPermissions(tokenAddr, networkAddr);
        vm.prank(darren);
        forwarder.grantPermissions(tokenAddr, networkAddr);
        vm.prank(simon);
        forwarder.grantPermissions(tokenAddr, networkAddr);
        vm.prank(christina);
        forwarder.grantPermissions(tokenAddr, networkAddr);
    }
}
