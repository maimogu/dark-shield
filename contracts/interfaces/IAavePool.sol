// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAavePool
 * @notice Aave V3 Pool 接口（简化版）
 * @dev 提供与 Aave V3 协议交互所需的核心函数签名
 */
interface IAavePool {
    /**
     * @notice 获取用户在 Aave 中的账户数据
     * @param user 用户地址
     * @return totalCollateralBase 用户总抵押品（以 8 位精度表示）
     * @return totalDebtBase 用户总债务（以 8 位精度表示）
     * @return availableBorrowsBase 用户可用借款额度（以 8 位精度表示）
     * @return currentLiquidationThreshold 当前清算阈值（以 4 位精度表示，如 8000 = 80%）
     * @return ltv 贷款价值比（以 4 位精度表示，如 7500 = 75%）
     * @return healthFactor 健康因子（以 1e18 精度表示，低于 1e18 则可被清算）
     */
    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );

    /**
     * @notice 向 Aave 协议提供资产
     * @param asset 资产地址
     * @param amount 供应数量（传入 type(uint256).max 表示供应全部余额）
     * @param onBehalfOf 代表哪个地址供应
     * @param referralCode 推荐码
     */
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /**
     * @notice 从 Aave 协议提取资产
     * @param asset 资产地址
     * @param amount 提取数量（传入 type(uint256).max 表示提取全部）
     * @param to 提取到的目标地址
     */
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external;

    /**
     * @notice 执行闪电贷（简化版）
     * @param receiverAddress 接收闪电贷资金的合约地址，需实现 IFlashLoanReceiver 接口
     * @param asset 借款资产地址
     * @param amount 借款数量
     * @param params 传递给回调函数的参数
     * @param referralCode 推荐码
     */
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}
