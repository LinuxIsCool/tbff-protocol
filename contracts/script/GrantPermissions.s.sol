// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {ICFAv1Forwarder} from "../src/interfaces/ICFAv1Forwarder.sol";

/// @title GrantPermissions
/// @notice Each Mycopunk grants the TBFFNetwork contract operator permissions
///         to create/update/delete CFA streams on their behalf.
/// @dev Must be run once per member with their private key:
///   MEMBER_PRIVATE_KEY=0x... forge script script/GrantPermissions.s.sol --rpc-url $RPC --broadcast
contract GrantPermissionsScript is Script {
    address internal constant CFA_FORWARDER = 0xcfA132E353cB4E398080B9700609bb008eceB125;

    function run() external {
        uint256 memberKey = vm.envUint("MEMBER_PRIVATE_KEY");
        address superTokenAddr = vm.envAddress("SUPER_TOKEN_ADDRESS");
        address networkAddr = vm.envAddress("TBFF_NETWORK_ADDRESS");

        vm.startBroadcast(memberKey);

        ICFAv1Forwarder forwarder = ICFAv1Forwarder(CFA_FORWARDER);
        forwarder.grantPermissions(superTokenAddr, networkAddr);

        console2.log("Permissions granted");
        console2.log("  Member:", vm.addr(memberKey));
        console2.log("  Network:", networkAddr);
        console2.log("  Token:", superTokenAddr);

        vm.stopBroadcast();
    }
}
