// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../interfaces/IAavePool.sol";

contract MockAavePool is IAavePool {
    struct UserData {
        uint256 totalCollateral;
        uint256 totalDebt;
        uint256 healthFactor;
    }

    mapping(address => UserData) private userData;

    function setUserAccountData(
        address user,
        uint256 _totalCollateral,
        uint256 _totalDebt,
        uint256 _healthFactor
    ) external {
        userData[user] = UserData({
            totalCollateral: _totalCollateral,
            totalDebt: _totalDebt,
            healthFactor: _healthFactor
        });
    }

    function getUserAccountData(address user)
        external
        view
        override
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {
        UserData memory data = userData[user];
        return (
            data.totalCollateral,
            data.totalDebt,
            0,
            0,
            0,
            data.healthFactor
        );
    }

    function supply(
        address,
        uint256,
        address,
        uint16
    ) external pure override {
    }

    function withdraw(
        address,
        uint256,
        address
    ) external pure override {
    }

    function flashLoanSimple(
        address,
        address,
        uint256,
        bytes calldata,
        uint16
    ) external pure override {
    }
}
