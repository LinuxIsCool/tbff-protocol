// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {TBFFNetwork} from "../src/TBFFNetwork.sol";
import {MockSuperToken} from "../src/mocks/MockSuperToken.sol";
import {MockCFAv1Forwarder} from "../src/mocks/MockCFAv1Forwarder.sol";

/// @title DeployLocal
/// @notice Deploys mock token + forwarder + TBFFNetwork for local Anvil testing.
///         No real Superfluid needed.
contract DeployLocalScript is Script {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant STREAM_EPOCH = 30 days;
    uint256 internal constant THRESHOLD = 8000 * WAD;
    uint256 internal constant MIN_THRESH = 3000 * WAD;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Anvil default accounts 1-5
        address shawn = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        address jeff = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
        address darren = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;
        address simon = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;
        address christina = 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc;

        vm.startBroadcast(deployerKey);

        // 1. Deploy mocks
        MockSuperToken token = new MockSuperToken();
        MockCFAv1Forwarder forwarder = new MockCFAv1Forwarder();
        console2.log("MockSuperToken:", address(token));
        console2.log("MockCFAv1Forwarder:", address(forwarder));

        // 2. Mint tokens to deployer (200K total)
        token.setBalance(deployer, 200_000 * WAD);

        // 3. Deploy TBFFNetwork
        TBFFNetwork network = new TBFFNetwork(address(forwarder), address(token), STREAM_EPOCH);
        console2.log("TBFFNetwork:", address(network));

        // 4. Register 5 Mycopunks
        network.registerNode(shawn, THRESHOLD, MIN_THRESH);
        network.registerNode(jeff, THRESHOLD, MIN_THRESH);
        network.registerNode(darren, THRESHOLD, MIN_THRESH);
        network.registerNode(simon, THRESHOLD, MIN_THRESH);
        network.registerNode(christina, THRESHOLD, MIN_THRESH);

        // 5. Set allocations
        _setAllocations(network, shawn, jeff, darren, simon, christina);

        // 6. Set profiles
        network.setProfileFor(shawn, "Shawn", unicode"🌲", "AI Infrastructure");
        network.setProfileFor(jeff, "Jeff", unicode"🔧", "Protocol Engineering");
        network.setProfileFor(darren, "Darren", unicode"⚡", "GPU Engineering");
        network.setProfileFor(simon, "Simon", unicode"🏗️", "Systems Design");
        network.setProfileFor(christina, "Christina", unicode"🌐", "Network Facilitation");

        // 7. Fund wallets
        token.transfer(shawn, 6000 * WAD);
        token.transfer(jeff, 5000 * WAD);
        token.transfer(darren, 4000 * WAD);
        token.transfer(simon, 7000 * WAD);
        token.transfer(christina, 10000 * WAD);

        // 8. Fund network reserve (stream buffer + seeds)
        token.transfer(address(network), 60000 * WAD);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Local Deployment Complete ===");
        console2.log("Network:", address(network));
        console2.log("Token:", address(token));
        console2.log("Forwarder:", address(forwarder));
        console2.log("");
        console2.log("Set these in web/.env.local:");
        console2.log("NEXT_PUBLIC_TBFF_NETWORK_ADDRESS=", address(network));
        console2.log("NEXT_PUBLIC_SUPER_TOKEN_ADDRESS=", address(token));
    }

    function _setAllocations(
        TBFFNetwork network,
        address shawn, address jeff, address darren, address simon, address christina
    ) internal {
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
    }
}
