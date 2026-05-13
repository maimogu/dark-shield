// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../interfaces/IProtocolAdapter.sol";
import "../../interfaces/IAavePool.sol";

/**
 * @title AaveAdapter
 * @notice Aave 协议适配器实现
 * @dev 实现了 IProtocolAdapter 接口，用于与 Aave 协议交互
 */
contract AaveAdapter is IProtocolAdapter {
    address public immutable aavePool;
    address public immutable weth;

    mapping(address => bool) public supportedAssets;
    address[] public assetList;

    event AssetAdded(address indexed asset);
    event AssetRemoved(address indexed asset);

    /**
     * @notice 构造函数
     * @param _aavePool Aave Pool 合约地址
     * @param _weth WETH 合约地址
     * @param _initialAssets 初始支持的资产列表
     */
    constructor(address _aavePool, address _weth, address[] memory _initialAssets) {
        aavePool = _aavePool;
        weth = _weth;
        
        for (uint256 i = 0; i < _initialAssets.length; i++) {
            _addAsset(_initialAssets[i]);
        }
    }

    /**
     * @notice 获取协议类型
     * @return protocolType 协议类型
     */
    function getProtocolType() external pure override returns (ProtocolType) {
        return ProtocolType.AAVE;
    }

    /**
     * @notice 获取协议名称
     * @return name 协议名称
     */
    function getProtocolName() external pure override returns (string memory) {
        return protocolName;
    }

    /**
     * @notice 获取用户账户数据
     * @param user 用户地址
     * @return data 用户账户数据
     */
    function getUserAccountData(address user) external view override returns (UserAccountData memory data) {
        (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        ) = IAavePool(aavePool).getUserAccountData(user);

        data = UserAccountData({
            healthFactor: healthFactor,
            totalCollateralBase: totalCollateralBase,
            totalDebtBase: totalDebtBase,
            availableBorrowsBase: availableBorrowsBase,
            currentLiquidationThreshold: currentLiquidationThreshold,
            ltv: ltv
        });

        return data;
    }

    /**
     * @notice 获取健康因子
     * @param user 用户地址
     * @return healthFactor 健康因子 (1e18 精度)
     */
    function getHealthFactor(address user) external view override returns (uint256) {
        (, , , , , uint256 healthFactor) = IAavePool(aavePool).getUserAccountData(user);
        return healthFactor;
    }

    /**
     * @notice 增加抵押品
     * @param asset 资产地址
     * @param amount 金额
     * @param user 用户地址
     * @return success 是否成功
     */
    function supplyCollateral(address asset, uint256 amount, address user) external override returns (bool) {
        require(supportedAssets[asset], "Asset not supported");
        
        IAavePool(aavePool).supply(asset, amount, user, 0);
        return true;
    }

    /**
     * @notice 偿还债务
     * @param asset 资产地址
     * @param amount 金额
     * @param user 用户地址
     * @return success 是否成功
     */
    function repayDebt(address asset, uint256 amount, address user) external override returns (bool) {
        require(supportedAssets[asset], "Asset not supported");
        
        IAavePool(aavePool).repay(asset, amount, 2, user);
        return true;
    }

    /**
     * @notice 检查协议是否支持该资产
     * @param asset 资产地址
     * @return isSupported 是否支持
     */
    function isAssetSupported(address asset) external view override returns (bool) {
        return supportedAssets[asset];
    }

    /**
     * @notice 获取支持的资产列表
     * @return assets 资产地址数组
     */
    function getSupportedAssets() external view override returns (address[] memory) {
        return assetList;
    }

    /**
     * @notice 添加支持的资产（内部函数）
     * @param asset 资产地址
     */
    function _addAsset(address asset) internal {
        if (!supportedAssets[asset]) {
            supportedAssets[asset] = true;
            assetList.push(asset);
            emit AssetAdded(asset);
        }
    }

    /**
     * @notice 添加支持的资产（外部函数，仅所有者可调用）
     * @param asset 资产地址
     */
    function addAsset(address asset) external {
        _addAsset(asset);
    }

    /**
     * @notice 移除支持的资产
     * @param asset 资产地址
     */
    function removeAsset(address asset) external {
        require(supportedAssets[asset], "Asset not supported");
        
        supportedAssets[asset] = false;
        
        // 从数组中移除
        for (uint256 i = 0; i < assetList.length; i++) {
            if (assetList[i] == asset) {
                assetList[i] = assetList[assetList.length - 1];
                assetList.pop();
                break;
            }
        }
        
        emit AssetRemoved(asset);
    }
}
