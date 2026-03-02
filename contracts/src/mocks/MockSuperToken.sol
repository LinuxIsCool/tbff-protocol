// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ISuperToken} from "../interfaces/ISuperToken.sol";

/// @notice Minimal mock for testing TBFFNetwork without real Superfluid deployment.
contract MockSuperToken is ISuperToken {
    mapping(address => uint256) public override balanceOf;
    mapping(address => int256) public realtimeBalance;
    mapping(address => mapping(address => uint256)) public allowance;

    function setBalance(address account, uint256 amount) external {
        balanceOf[account] = amount;
        realtimeBalance[account] = int256(amount);
    }

    function setRealtimeBalance(address account, int256 amount) external {
        realtimeBalance[account] = amount;
        if (amount > 0) {
            balanceOf[account] = uint256(amount);
        } else {
            balanceOf[account] = 0;
        }
    }

    function realtimeBalanceOfNow(address account)
        external
        view
        override
        returns (int256 availableBalance, uint256 deposit, uint256 owedDeposit, uint256 timestamp)
    {
        return (realtimeBalance[account], 0, 0, block.timestamp);
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        realtimeBalance[msg.sender] -= int256(amount);
        realtimeBalance[to] += int256(amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        realtimeBalance[from] -= int256(amount);
        realtimeBalance[to] += int256(amount);
        return true;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}
