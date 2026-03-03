// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ICFAv1Forwarder} from "../interfaces/ICFAv1Forwarder.sol";

/// @notice Mock CFA forwarder that records all stream operations for testing.
/// @dev Auto-computes net flow rate per account from stored flowrates.
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

    // Secondary index for getAccountFlowInfo net flow computation
    // token => sender => receiver => registered in index
    mapping(address => mapping(address => mapping(address => bool))) internal _indexed;
    // token => account => list of addresses they send to
    mapping(address => mapping(address => address[])) internal _outgoing;
    // token => account => list of addresses sending to them
    mapping(address => mapping(address => address[])) internal _incoming;

    function setFlowrateFrom(address token, address sender, address receiver, int96 flowrate)
        external
        override
        returns (bool)
    {
        flowrates[token][sender][receiver] = flowrate;
        flowCalls.push(FlowCall(token, sender, receiver, flowrate));

        // Register in secondary index (idempotent)
        if (!_indexed[token][sender][receiver]) {
            _indexed[token][sender][receiver] = true;
            _outgoing[token][sender].push(receiver);
            _incoming[token][receiver].push(sender);
        }
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
        int96 netRate = 0;

        // Sum incoming (positive)
        address[] storage ins = _incoming[token][account];
        for (uint256 i = 0; i < ins.length; i++) {
            int96 rate = flowrates[token][ins[i]][account];
            if (rate > 0) netRate += rate;
        }

        // Sum outgoing (negative)
        address[] storage outs = _outgoing[token][account];
        for (uint256 i = 0; i < outs.length; i++) {
            int96 rate = flowrates[token][account][outs[i]];
            if (rate > 0) netRate -= rate;
        }

        return (block.timestamp, netRate, 0, 0);
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
