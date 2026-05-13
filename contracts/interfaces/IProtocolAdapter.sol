// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IProtocolAdapter
 * @notice 通用 DeFi 协议适配器接口
 * @dev 定义了所有协议适配器必须实现的通用功能
 */
interface IProtocolAdapter {
    /**
     * @notice 协议类型枚举
     */
    enum ProtocolType {
        AAVE,
        COMPOUND,
        MAKER,
        UNISWAP
    }

    /**
     * @notice 用户账户数据结构
     */
    struct UserAccountData {
        uint256 healthFactor;
        uint256 totalCollateralBase;
        uint256 totalDebtBase;
        uint256 availableBorrowsBase;
        uint256 currentLiquidationThreshold;
        uint256 ltv;
    }

    /**
     * @notice 获取协议类型
     * @return protocolType 协议类型
     */
    function getProtocolType() external view returns (ProtocolType);

    /**
     * @notice 获取协议名称
     * @return name 协议名称
     */
    function getProtocolName() external view returns (string memory);

    /**
     * @notice 获取用户账户数据
     * @param user 用户地址
     * @return data 用户账户数据
     */
    function getUserAccountData(address user) external view returns (UserAccountData memory data);

    /**
     * @notice 获取健康因子
     * @param user 用户地址
     * @return healthFactor 健康因子 (1e18 精度)
     */
    function getHealthFactor(address user) external view returns (uint256);

    /**
     * @notice 增加抵押品
     * @param asset 资产地址
     * @param amount 金额
     * @param user 用户地址
     * @return success 是否成功
     */
    function supplyCollateral(address asset, uint256 amount, address user) external returns (bool);

    /**
     * @notice 偿还债务
     * @param asset 资产地址
     * @param amount 金额
     * @param user 用户地址
     * @return success 是否成功
     */
    function repayDebt(address asset, uint256 amount, address user) external returns (bool);

    /**
     * @notice 检查协议是否支持该资产
     * @param asset 资产地址
     * @return isSupported 是否支持
     */
    function isAssetSupported(address asset) external view returns (bool);

    /**
     * @notice 获取支持的资产列表
     * @return assets 资产地址数组
     */
    function getSupportedAssets() external view returns (address[] memory);
}
