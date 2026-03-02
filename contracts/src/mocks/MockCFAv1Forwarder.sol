// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ICFAv1Forwarder} from "../interfaces/ICFAv1Forwarder.sol";

/// @notice Mock CFA forwarder that records all stream operations for testing.
contract MockCFAv1Forwarder is ICFAv1Forwarder {
    // token => sender => receiver => flowrate
    mapping(address => mapping(address => mapping(address => int96))) public flowrates;

    // Tracking calls for assertions
    struct FlowCall {
        address token;
        address sender;
        address receiver;
        int96 flowrate;
    }
    FlowCall[] public flowCalls;

    // Permissions tracking
    mapping(address => mapping(address => bool)) public permissions; // token+operator hash

    function setFlowrateFrom(address token, address sender, address receiver, int96 flowrate)
        external
        override
        returns (bool)
    {
        flowrates[token][sender][receiver] = flowrate;
        flowCalls.push(FlowCall(token, sender, receiver, flowrate));
        return true;
    }

    function getFlowrate(address token, address sender, address receiver)
        external
        view
        override
        returns (int96)
    {
        return flowrates[token][sender][receiver];
    }

    function getAccountFlowInfo(address token, address account)
        external
        view
        override
        returns (uint256 lastUpdated, int96 flowrate, uint256 deposit, uint256 owedDeposit)
    {
        // Sum all outgoing flows for this account
        // Simplified: just return 0 for mock
        return (block.timestamp, 0, 0, 0);
    }

    function grantPermissions(address, address) external pure override returns (bool) {
        return true;
    }

    function revokePermissions(address, address) external pure override returns (bool) {
        return true;
    }

    // ─── Test Helpers ────────────────────────────────────────────

    function getFlowCallCount() external view returns (uint256) {
        return flowCalls.length;
    }

    function getFlowCall(uint256 idx) external view returns (FlowCall memory) {
        return flowCalls[idx];
    }

    function resetCalls() external {
        delete flowCalls;
    }
}
