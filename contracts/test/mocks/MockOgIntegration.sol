// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockOgIntegration {
    mapping(address => bool) public predictions;

    function recordPrediction(
        address _user,
        uint256,
        uint256
    ) external {
        predictions[_user] = true;
    }

    function getPrediction(address) external pure returns (uint256, uint256, uint256, bytes32) {
        return (0, 0, 0, bytes32(0));
    }
}
