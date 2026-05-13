// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../interfaces/IProtocolAdapter.sol";

/**
 * @title ICompoundComptroller
 * @notice Compound Comptroller 接口
 */
interface ICompoundComptroller {
    function getAccountLiquidity(address account) external view returns (
        uint256 error,
        uint256 liquidity,
        uint256 shortfall
    );
    
    function enterMarkets(address[] calldata cTokens) external returns (uint256[] memory);
    
    function exitMarket(address cToken) external returns (uint256);
    
    function markets(address cToken) external view returns (
        bool isListed,
        uint256 collateralFactorMantissa,
        bool isComped
    );
    
    function getAllMarkets() external view returns (address[] memory);
}

/**
 * @title ICompoundCToken
 * @notice Compound CToken 接口
 */
interface ICompoundCToken {
    function mint(uint256 mintAmount) external returns (uint256);
    function redeem(uint256 redeemTokens) external returns (uint256);
    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);
    function borrow(uint256 borrowAmount) external returns (uint256);
    function repayBorrow(uint256 repayAmount) external returns (uint256);
    function repayBorrowBehalf(address borrower, uint256 repayAmount) external returns (uint256);
    
    function balanceOf(address owner) external view returns (uint256);
    function borrowBalanceCurrent(address account) external returns (uint256);
    function borrowBalanceStored(address account) external view returns (uint256);
    function exchangeRateCurrent() external returns (uint256);
    function exchangeRateStored() external view returns (uint256);
    function getCash() external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function totalBorrows() external view returns (uint256);
    function supplyRatePerBlock() external view returns (uint256);
    function borrowRatePerBlock() external view returns (uint256);
    function underlying() external view returns (address);
    function comptroller() external view returns (address);
}

/**
 * @title CompoundAdapter
 * @notice Compound 协议适配器实现
 * @dev 实现了 IProtocolAdapter 接口，用于与 Compound 协议交互
 */
contract CompoundAdapter is IProtocolAdapter {
    address public immutable comptroller;
    string public constant PROTOCOL_NAME = "Compound";
    
    mapping(address => address) public underlyingToCToken;
    mapping(address => address) public cTokenToUnderlying;
    address[] public cTokens;
    
    event CTokenAdded(address indexed cToken, address indexed underlying);
    event CTokenRemoved(address indexed cToken, address indexed underlying);

    /**
     * @notice 构造函数
     * @param _comptroller Compound Comptroller 合约地址
     * @param _cTokens 初始支持的 cToken 列表
     */
    constructor(address _comptroller, address[] memory _cTokens) {
        comptroller = _comptroller;
        
        for (uint256 i = 0; i < _cTokens.length; i++) {
            _addCToken(_cTokens[i]);
        }
    }

    /**
     * @notice 获取协议类型
     * @return protocolType 协议类型
     */
    function getProtocolType() external pure override returns (ProtocolType) {
        return ProtocolType.COMPOUND;
    }

    /**
     * @notice 获取协议名称
     * @return name 协议名称
     */
    function getProtocolName() external pure override returns (string memory) {
        return PROTOCOL_NAME;
    }

    /**
     * @notice 获取用户账户数据
     * @param user 用户地址
     * @return data 用户账户数据
     */
    function getUserAccountData(address user) external view override returns (UserAccountData memory data) {
        (, uint256 liquidity, uint256 shortfall) = ICompoundComptroller(comptroller).getAccountLiquidity(user);
        
        uint256 totalCollateralBase = liquidity;
        uint256 totalDebtBase = shortfall;
        
        uint256 healthFactor;
        if (totalDebtBase == 0) {
            healthFactor = 2e18;
        } else if (totalCollateralBase == 0) {
            healthFactor = 0;
        } else {
            healthFactor = (totalCollateralBase * 1e18) / totalDebtBase;
        }
        
        uint256 availableBorrowsBase = liquidity;
        uint256 currentLiquidationThreshold = 80;
        uint256 ltv = 75;
        
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
        (, uint256 liquidity, uint256 shortfall) = ICompoundComptroller(comptroller).getAccountLiquidity(user);
        
        if (shortfall == 0) {
            return 2e18;
        }
        if (liquidity == 0) {
            return 0;
        }
        return (liquidity * 1e18) / shortfall;
    }

    /**
     * @notice 增加抵押品
     * @param asset 资产地址
     * @param amount 金额
     * @param user 用户地址
     * @return success 是否成功
     */
    function supplyCollateral(address asset, uint256 amount, address user) external override returns (bool) {
        address cToken = underlyingToCToken[asset];
        require(cToken != address(0), "Asset not supported");
        
        // Transfer asset to this contract
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        IERC20(asset).approve(cToken, amount);
        
        // Mint cTokens
        require(ICompoundCToken(cToken).mint(amount) == 0, "Mint failed");
        
        // If not caller, transfer cTokens to user
        if (user != address(this)) {
            uint256 cTokenBalance = ICompoundCToken(cToken).balanceOf(address(this));
            ICompoundCToken(cToken).transfer(user, cTokenBalance);
        }
        
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
        address cToken = underlyingToCToken[asset];
        require(cToken != address(0), "Asset not supported");
        
        // Transfer asset to this contract
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        IERC20(asset).approve(cToken, amount);
        
        // Repay borrow on behalf of user
        require(ICompoundCToken(cToken).repayBorrowBehalf(user, amount) == 0, "Repay failed");
        
        return true;
    }

    /**
     * @notice 检查协议是否支持该资产
     * @param asset 资产地址
     * @return isSupported 是否支持
     */
    function isAssetSupported(address asset) external view override returns (bool) {
        return underlyingToCToken[asset] != address(0);
    }

    /**
     * @notice 获取支持的资产列表
     * @return assets 资产地址数组
     */
    function getSupportedAssets() external view override returns (address[] memory) {
        address[] memory assets = new address[](cTokens.length);
        for (uint256 i = 0; i < cTokens.length; i++) {
            assets[i] = cTokenToUnderlying[cTokens[i]];
        }
        return assets;
    }

    /**
     * @notice 添加 cToken（内部函数）
     * @param cToken cToken 地址
     */
    function _addCToken(address cToken) internal {
        if (underlyingToCToken[ICompoundCToken(cToken).underlying()] == address(0)) {
            address underlying = ICompoundCToken(cToken).underlying();
            underlyingToCToken[underlying] = cToken;
            cTokenToUnderlying[cToken] = underlying;
            cTokens.push(cToken);
            emit CTokenAdded(cToken, underlying);
        }
    }

    /**
     * @notice 添加 cToken（外部函数）
     * @param cToken cToken 地址
     */
    function addCToken(address cToken) external {
        _addCToken(cToken);
    }

    /**
     * @notice 移除 cToken
     * @param cToken cToken 地址
     */
    function removeCToken(address cToken) external {
        address underlying = cTokenToUnderlying[cToken];
        require(underlying != address(0), "cToken not supported");
        
        delete underlyingToCToken[underlying];
        delete cTokenToUnderlying[cToken];
        
        // 从数组中移除
        for (uint256 i = 0; i < cTokens.length; i++) {
            if (cTokens[i] == cToken) {
                cTokens[i] = cTokens[cTokens.length - 1];
                cTokens.pop();
                break;
            }
        }
        
        emit CTokenRemoved(cToken, underlying);
    }
}

/**
 * @title IERC20
 * @notice ERC20 标准接口
 */
interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
