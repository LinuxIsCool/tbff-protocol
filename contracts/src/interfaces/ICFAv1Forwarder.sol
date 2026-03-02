// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ICFAv1Forwarder {
    function setFlowrateFrom(address token, address sender, address receiver, int96 flowrate)
        external
        returns (bool);

    function getFlowrate(address token, address sender, address receiver) external view returns (int96);

    function getAccountFlowInfo(address token, address account)
        external
        view
        returns (uint256 lastUpdated, int96 flowrate, uint256 deposit, uint256 owedDeposit);

    function grantPermissions(address token, address flowOperator) external returns (bool);
    function revokePermissions(address token, address flowOperator) external returns (bool);
}
