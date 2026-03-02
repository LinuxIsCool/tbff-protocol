// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ISuperToken {
    function realtimeBalanceOfNow(address account)
        external
        view
        returns (int256 availableBalance, uint256 deposit, uint256 owedDeposit, uint256 timestamp);

    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}
