// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {TBFFNetwork} from "../src/TBFFNetwork.sol";
import {ISuperToken} from "../src/interfaces/ISuperToken.sol";

/// @title Deploy
/// @notice Deploys TBFFNetwork, registers 5 Mycopunks, sets allocations, funds wallets.
/// @dev Usage:
///   Anvil: forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///   Sepolia: forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
contract DeployScript is Script {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant STREAM_EPOCH = 30 days;
    uint256 internal constant THRESHOLD = 8000 * WAD;
    uint256 internal constant MIN_THRESH = 3000 * WAD;

    // Base Sepolia Superfluid addresses
    address internal constant CFA_FORWARDER = 0xcfA132E353cB4E398080B9700609bb008eceB125;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address superTokenAddr = vm.envAddress("SUPER_TOKEN_ADDRESS");

        // Mycopunk addresses — set these in env or override
        address shawn = vm.envOr("SHAWN_ADDRESS", address(0x1));
        address jeff = vm.envOr("JEFF_ADDRESS", address(0x2));
        address darren = vm.envOr("DARREN_ADDRESS", address(0x3));
        address simon = vm.envOr("SIMON_ADDRESS", address(0x4));
        address christina = vm.envOr("CHRISTINA_ADDRESS", address(0x5));

        vm.startBroadcast(deployerKey);

        // 1. Deploy TBFFNetwork
        TBFFNetwork network = new TBFFNetwork(CFA_FORWARDER, superTokenAddr, STREAM_EPOCH);
        console2.log("TBFFNetwork deployed at:", address(network));

        // 2. Register 5 Mycopunks
        network.registerNode(shawn, THRESHOLD, MIN_THRESH);
        network.registerNode(jeff, THRESHOLD, MIN_THRESH);
        network.registerNode(darren, THRESHOLD, MIN_THRESH);
        network.registerNode(simon, THRESHOLD, MIN_THRESH);
        network.registerNode(christina, THRESHOLD, MIN_THRESH);
        console2.log("Registered 5 nodes");

        // 3. Set allocations matching mock-data.ts
        // Shawn (0) → Jeff(1) 30%, Darren(2) 40%, Simon(3) 30%
        {
            uint256[] memory t = new uint256[](3);
            uint96[] memory w = new uint96[](3);
            t[0] = 1; t[1] = 2; t[2] = 3;
            w[0] = uint96(WAD * 30 / 100);
            w[1] = uint96(WAD * 40 / 100);
            w[2] = uint96(WAD - uint256(w[0]) - uint256(w[1]));
            network.setAllocations(shawn, t, w);
        }

        // Jeff (1) → Shawn(0) 40%, Christina(4) 30%, Darren(2) 30%
        {
            uint256[] memory t = new uint256[](3);
            uint96[] memory w = new uint96[](3);
            t[0] = 0; t[1] = 4; t[2] = 2;
            w[0] = uint96(WAD * 40 / 100);
            w[1] = uint96(WAD * 30 / 100);
            w[2] = uint96(WAD - uint256(w[0]) - uint256(w[1]));
            network.setAllocations(jeff, t, w);
        }

        // Darren (2) → Shawn(0) 50%, Jeff(1) 50%
        {
            uint256[] memory t = new uint256[](2);
            uint96[] memory w = new uint96[](2);
            t[0] = 0; t[1] = 1;
            w[0] = uint96(WAD / 2);
            w[1] = uint96(WAD - uint256(w[0]));
            network.setAllocations(darren, t, w);
        }

        // Simon (3) → Christina(4) 50%, Shawn(0) 25%, Jeff(1) 25%
        {
            uint256[] memory t = new uint256[](3);
            uint96[] memory w = new uint96[](3);
            t[0] = 4; t[1] = 0; t[2] = 1;
            w[0] = uint96(WAD * 50 / 100);
            w[1] = uint96(WAD * 25 / 100);
            w[2] = uint96(WAD - uint256(w[0]) - uint256(w[1]));
            network.setAllocations(simon, t, w);
        }

        // Christina (4) → Simon(3) 30%, Darren(2) 30%, Jeff(1) 20%, Shawn(0) 20%
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
        console2.log("Allocations set");

        // 4. Set profiles for bootstrapped Mycopunks
        network.setProfileFor(shawn, "Shawn", unicode"🌲", "AI Infrastructure");
        network.setProfileFor(jeff, "Jeff", unicode"🔧", "Protocol Engineering");
        network.setProfileFor(darren, "Darren", unicode"⚡", "GPU Engineering");
        network.setProfileFor(simon, "Simon", unicode"🏗️", "Systems Design");
        network.setProfileFor(christina, "Christina", unicode"🌐", "Network Facilitation");
        console2.log("Profiles set for 5 Mycopunks");

        // 5. Fund Mycopunks with initial TBFFx balances
        ISuperToken superToken = ISuperToken(superTokenAddr);
        superToken.transfer(shawn, 6000 * WAD);
        superToken.transfer(jeff, 5000 * WAD);
        superToken.transfer(darren, 4000 * WAD);
        superToken.transfer(simon, 7000 * WAD);
        superToken.transfer(christina, 10000 * WAD);
        console2.log("Funded 5 wallets");

        // 6. Fund network reserve (stream buffer + seed amounts for ~100 registrations)
        uint256 reserveAmount = 60000 * WAD; // 50K stream buffer + 10K seed reserve
        superToken.transfer(address(network), reserveAmount);
        console2.log("Network reserve funded:", reserveAmount / WAD, "TBFFx");

        vm.stopBroadcast();

        // Summary
        console2.log("");
        console2.log("=== Deployment Summary ===");
        console2.log("Network:", address(network));
        console2.log("Token:", superTokenAddr);
        console2.log("Forwarder:", CFA_FORWARDER);
        console2.log("Epoch:", STREAM_EPOCH, "seconds");
    }
}
