// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IProtocolAdapter.sol";

/**
 * @title MultiProtocolManager
 * @notice 多协议管理器
 * @dev 管理多个 DeFi 协议适配器，提供统一的接口
 */
contract MultiProtocolManager is Ownable {
    /**
     * @notice 协议信息结构
     */
    struct ProtocolInfo {
        address adapter;
        IProtocolAdapter.ProtocolType protocolType;
        string name;
        bool active;
    }

    mapping(IProtocolAdapter.ProtocolType => ProtocolInfo) public protocols;
    IProtocolAdapter.ProtocolType[] public protocolTypes;
    mapping(IProtocolAdapter.ProtocolType => bool) public typeExists;

    event ProtocolAdded(IProtocolAdapter.ProtocolType indexed protocolType, address indexed adapter, string name);
    event ProtocolRemoved(IProtocolAdapter.ProtocolType indexed protocolType);
    event ProtocolUpdated(IProtocolAdapter.ProtocolType indexed protocolType, address indexed newAdapter);
    event ProtocolActivated(IProtocolAdapter.ProtocolType indexed protocolType);
    event ProtocolDeactivated(IProtocolAdapter.ProtocolType indexed protocolType);

    /**
     * @notice 构造函数
     * @param initialOwner 初始所有者
     */
    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice 添加新协议
     * @param protocolType 协议类型
     * @param adapter 协议适配器地址
     */
    function addProtocol(
        IProtocolAdapter.ProtocolType protocolType,
        address adapter
    ) external onlyOwner {
        require(!typeExists[protocolType], "Protocol already exists");
        require(adapter != address(0), "Invalid adapter address");

        IProtocolAdapter adapterContract = IProtocolAdapter(adapter);
        string memory name = adapterContract.getProtocolName();

        protocols[protocolType] = ProtocolInfo({
            adapter: adapter,
            protocolType: protocolType,
            name: name,
            active: true
        });

        protocolTypes.push(protocolType);
        typeExists[protocolType] = true;

        emit ProtocolAdded(protocolType, adapter, name);
    }

    /**
     * @notice 更新协议适配器
     * @param protocolType 协议类型
     * @param newAdapter 新的协议适配器地址
     */
    function updateProtocolAdapter(
        IProtocolAdapter.ProtocolType protocolType,
        address newAdapter
    ) external onlyOwner {
        require(typeExists[protocolType], "Protocol does not exist");
        require(newAdapter != address(0), "Invalid adapter address");

        IProtocolAdapter adapterContract = IProtocolAdapter(newAdapter);
        protocols[protocolType].adapter = newAdapter;
        protocols[protocolType].name = adapterContract.getProtocolName();

        emit ProtocolUpdated(protocolType, newAdapter);
    }

    /**
     * @notice 激活协议
     * @param protocolType 协议类型
     */
    function activateProtocol(IProtocolAdapter.ProtocolType protocolType) external onlyOwner {
        require(typeExists[protocolType], "Protocol does not exist");
        require(!protocols[protocolType].active, "Protocol already active");

        protocols[protocolType].active = true;
        emit ProtocolActivated(protocolType);
    }

    /**
     * @notice 停用协议
     * @param protocolType 协议类型
     */
    function deactivateProtocol(IProtocolAdapter.ProtocolType protocolType) external onlyOwner {
        require(typeExists[protocolType], "Protocol does not exist");
        require(protocols[protocolType].active, "Protocol already inactive");

        protocols[protocolType].active = false;
        emit ProtocolDeactivated(protocolType);
    }

    /**
     * @notice 移除协议
     * @param protocolType 协议类型
     */
    function removeProtocol(IProtocolAdapter.ProtocolType protocolType) external onlyOwner {
        require(typeExists[protocolType], "Protocol does not exist");

        delete protocols[protocolType];
        typeExists[protocolType] = false;

        // 从数组中移除
        for (uint256 i = 0; i < protocolTypes.length; i++) {
            if (protocolTypes[i] == protocolType) {
                protocolTypes[i] = protocolTypes[protocolTypes.length - 1];
                protocolTypes.pop();
                break;
            }
        }

        emit ProtocolRemoved(protocolType);
    }

    /**
     * @notice 获取协议适配器
     * @param protocolType 协议类型
     * @return adapter 协议适配器地址
     */
    function getProtocolAdapter(
        IProtocolAdapter.ProtocolType protocolType
    ) external view returns (address) {
        require(typeExists[protocolType], "Protocol does not exist");
        require(protocols[protocolType].active, "Protocol not active");
        return protocols[protocolType].adapter;
    }

    /**
     * @notice 获取所有活跃的协议
     * @return activeProtocols 活跃协议类型数组
     */
    function getActiveProtocols() external view returns (IProtocolAdapter.ProtocolType[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < protocolTypes.length; i++) {
            if (protocols[protocolTypes[i]].active) {
                activeCount++;
            }
        }

        IProtocolAdapter.ProtocolType[] memory activeProtocols = new IProtocolAdapter.ProtocolType[](activeCount);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < protocolTypes.length; i++) {
            if (protocols[protocolTypes[i]].active) {
                activeProtocols[currentIndex] = protocolTypes[i];
                currentIndex++;
            }
        }

        return activeProtocols;
    }

    /**
     * @notice 获取所有协议
     * @return allProtocols 所有协议类型数组
     */
    function getAllProtocols() external view returns (IProtocolAdapter.ProtocolType[] memory) {
        return protocolTypes;
    }

    /**
     * @notice 获取协议信息
     * @param protocolType 协议类型
     * @return info 协议信息
     */
    function getProtocolInfo(
        IProtocolAdapter.ProtocolType protocolType
    ) external view returns (ProtocolInfo memory) {
        require(typeExists[protocolType], "Protocol does not exist");
        return protocols[protocolType];
    }

    /**
     * @notice 批量获取用户在所有协议中的健康因子
     * @param user 用户地址
     * @return healthFactors 健康因子数组
     * @return protocolTypesArray 协议类型数组
     */
    function batchGetHealthFactors(
        address user
    ) external view returns (uint256[] memory, IProtocolAdapter.ProtocolType[] memory) {
        uint256[] memory healthFactors = new uint256[](protocolTypes.length);
        IProtocolAdapter.ProtocolType[] memory typesArray = new IProtocolAdapter.ProtocolType[](protocolTypes.length);

        for (uint256 i = 0; i < protocolTypes.length; i++) {
            typesArray[i] = protocolTypes[i];
            if (protocols[protocolTypes[i]].active) {
                try IProtocolAdapter(protocols[protocolTypes[i]].adapter).getHealthFactor(user) returns (uint256 hf) {
                    healthFactors[i] = hf;
                } catch {
                    healthFactors[i] = 0;
                }
            } else {
                healthFactors[i] = 0;
            }
        }

        return (healthFactors, typesArray);
    }

    /**
     * @notice 批量获取用户在所有协议中的账户数据
     * @param user 用户地址
     * @return accountDataArray 账户数据数组
     * @return protocolTypesArray 协议类型数组
     */
    function batchGetAccountData(
        address user
    ) external view returns (IProtocolAdapter.UserAccountData[] memory, IProtocolAdapter.ProtocolType[] memory) {
        IProtocolAdapter.UserAccountData[] memory accountDataArray = new IProtocolAdapter.UserAccountData[](protocolTypes.length);
        IProtocolAdapter.ProtocolType[] memory typesArray = new IProtocolAdapter.ProtocolType[](protocolTypes.length);

        for (uint256 i = 0; i < protocolTypes.length; i++) {
            typesArray[i] = protocolTypes[i];
            if (protocols[protocolTypes[i]].active) {
                try IProtocolAdapter(protocols[protocolTypes[i]].adapter).getUserAccountData(user) returns (IProtocolAdapter.UserAccountData memory data) {
                    accountDataArray[i] = data;
                } catch {
                    accountDataArray[i] = IProtocolAdapter.UserAccountData({
                        healthFactor: 0,
                        totalCollateralBase: 0,
                        totalDebtBase: 0,
                        availableBorrowsBase: 0,
                        currentLiquidationThreshold: 0,
                        ltv: 0
                    });
                }
            } else {
                accountDataArray[i] = IProtocolAdapter.UserAccountData({
                    healthFactor: 0,
                    totalCollateralBase: 0,
                    totalDebtBase: 0,
                    availableBorrowsBase: 0,
                    currentLiquidationThreshold: 0,
                    ltv: 0
                });
            }
        }

        return (accountDataArray, typesArray);
    }

    /**
     * @notice 计算用户的综合风险分数
     * @param user 用户地址
     * @return riskScore 综合风险分数 (0-100)
     */
    function calculateAggregateRiskScore(address user) external view returns (uint256) {
        uint256 totalScore = 0;
        uint256 activeCount = 0;

        for (uint256 i = 0; i < protocolTypes.length; i++) {
            if (protocols[protocolTypes[i]].active) {
                try IProtocolAdapter(protocols[protocolTypes[i]].adapter).getHealthFactor(user) returns (uint256 hf) {
                    uint256 protocolScore = _calculateProtocolRiskScore(hf);
                    totalScore += protocolScore;
                    activeCount++;
                } catch {
                    // 跳过失败的协议
                }
            }
        }

        if (activeCount == 0) {
            return 50;
        }

        return totalScore / activeCount;
    }

    /**
     * @notice 计算单个协议的风险分数
     * @param healthFactor 健康因子
     * @return riskScore 风险分数 (0-100)
     */
    function _calculateProtocolRiskScore(uint256 healthFactor) internal pure returns (uint256) {
        if (healthFactor >= 2e18) {
            return 10;
        } else if (healthFactor >= 1.5e18) {
            return 25;
        } else if (healthFactor >= 1.2e18) {
            return 45;
        } else if (healthFactor >= 1.1e18) {
            return 60;
        } else if (healthFactor >= 1e18) {
            return 75;
        } else {
            return 95;
        }
    }
}
