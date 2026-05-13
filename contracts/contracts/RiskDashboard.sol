// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IProtocolAdapter.sol";

/**
 * @title RiskDashboard
 * @notice 风险仪表盘
 * @dev 聚合和显示来自多个来源的风险数据
 */
contract RiskDashboard is Ownable {
    /**
     * @notice 风险指标结构
     */
    struct RiskMetrics {
        uint256 timestamp;
        uint256 aggregateRiskScore;
        uint256 usersAtRisk;
        uint256 totalValueAtRisk;
        uint256 healthFactorDistribution;
        uint256 protocolRiskCount;
        bytes32 dataHash;
    }

    /**
     * @notice 协议风险快照
     */
    struct ProtocolRiskSnapshot {
        address protocolAdapter;
        IProtocolAdapter.ProtocolType protocolType;
        string protocolName;
        uint256 totalUsers;
        uint256 atRiskUsers;
        uint256 averageHealthFactor;
        uint256 totalDebt;
        uint256 totalCollateral;
        uint256 timestamp;
    }

    /**
     * @notice 用户风险概况
     */
    struct UserRiskProfile {
        address user;
        uint256 lastUpdate;
        uint256[] protocolHealthFactors;
        IProtocolAdapter.ProtocolType[] protocolTypes;
        uint256 aggregateRiskScore;
        bool hasInsurance;
        uint256 insuranceCoverage;
        bytes32 profileHash;
    }

    mapping(uint256 => RiskMetrics) public historicalMetrics;
    uint256[] public metricTimestamps;
    uint256 public latestMetricTimestamp;

    mapping(address => UserRiskProfile) public userProfiles;
    address[] public trackedUsers;

    mapping(IProtocolAdapter.ProtocolType => ProtocolRiskSnapshot) public protocolSnapshots;
    IProtocolAdapter.ProtocolType[] public trackedProtocols;

    address public multiProtocolManager;
    address public insuranceManager;
    address public crossChainMonitor;

    uint256 public constant RISK_THRESHOLD_LOW = 30;
    uint256 public constant RISK_THRESHOLD_MEDIUM = 60;
    uint256 public constant RISK_THRESHOLD_HIGH = 80;

    event MetricsUpdated(uint256 indexed timestamp, uint256 aggregateRiskScore);
    event UserProfileUpdated(address indexed user, uint256 aggregateRiskScore);
    event ProtocolSnapshotUpdated(IProtocolAdapter.ProtocolType indexed protocolType, uint256 atRiskUsers);
    event AlertTriggered(uint256 indexed riskLevel, string message, uint256 timestamp);

    /**
     * @notice 构造函数
     * @param initialOwner 初始所有者
     */
    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice 设置合约地址
     * @param _multiProtocolManager 多协议管理器地址
     * @param _insuranceManager 保险管理器地址
     * @param _crossChainMonitor 跨链监控器地址
     */
    function setContracts(
        address _multiProtocolManager,
        address _insuranceManager,
        address _crossChainMonitor
    ) external onlyOwner {
        multiProtocolManager = _multiProtocolManager;
        insuranceManager = _insuranceManager;
        crossChainMonitor = _crossChainMonitor;
    }

    /**
     * @notice 添加跟踪的用户
     * @param user 用户地址
     */
    function addTrackedUser(address user) external onlyOwner {
        require(user != address(0), "Invalid user address");
        if (userProfiles[user].user == address(0)) {
            trackedUsers.push(user);
        }
        userProfiles[user].user = user;
    }

    /**
     * @notice 移除跟踪的用户
     * @param user 用户地址
     */
    function removeTrackedUser(address user) external onlyOwner {
        delete userProfiles[user];
        for (uint256 i = 0; i < trackedUsers.length; i++) {
            if (trackedUsers[i] == user) {
                trackedUsers[i] = trackedUsers[trackedUsers.length - 1];
                trackedUsers.pop();
                break;
            }
        }
    }

    /**
     * @notice 更新用户风险概况
     * @param user 用户地址
     * @param healthFactors 健康因子数组
     * @param protocolTypes 协议类型数组
     */
    function updateUserProfile(
        address user,
        uint256[] calldata healthFactors,
        IProtocolAdapter.ProtocolType[] calldata protocolTypes
    ) external {
        require(healthFactors.length == protocolTypes.length, "Array length mismatch");
        require(userProfiles[user].user != address(0), "User not tracked");

        uint256 aggregateScore = calculateUserRiskScore(healthFactors);

        userProfiles[user] = UserRiskProfile({
            user: user,
            lastUpdate: block.timestamp,
            protocolHealthFactors: healthFactors,
            protocolTypes: protocolTypes,
            aggregateRiskScore: aggregateScore,
            hasInsurance: false,
            insuranceCoverage: 0,
            profileHash: keccak256(abi.encode(user, healthFactors, block.timestamp))
        });

        emit UserProfileUpdated(user, aggregateScore);

        if (aggregateScore >= RISK_THRESHOLD_HIGH) {
            emit AlertTriggered(3, "High risk detected for user", block.timestamp);
        } else if (aggregateScore >= RISK_THRESHOLD_MEDIUM) {
            emit AlertTriggered(2, "Medium risk detected for user", block.timestamp);
        }
    }

    /**
     * @notice 更新协议风险快照
     * @param protocolType 协议类型
     * @param snapshot 快照数据
     */
    function updateProtocolSnapshot(
        IProtocolAdapter.ProtocolType protocolType,
        ProtocolRiskSnapshot calldata snapshot
    ) external onlyOwner {
        protocolSnapshots[protocolType] = snapshot;

        bool found = false;
        for (uint256 i = 0; i < trackedProtocols.length; i++) {
            if (trackedProtocols[i] == protocolType) {
                found = true;
                break;
            }
        }
        if (!found) {
            trackedProtocols.push(protocolType);
        }

        emit ProtocolSnapshotUpdated(protocolType, snapshot.atRiskUsers);
    }

    /**
     * @notice 更新聚合风险指标
     * @param metrics 风险指标
     */
    function updateMetrics(RiskMetrics calldata metrics) external onlyOwner {
        historicalMetrics[metrics.timestamp] = metrics;
        metricTimestamps.push(metrics.timestamp);
        latestMetricTimestamp = metrics.timestamp;

        emit MetricsUpdated(metrics.timestamp, metrics.aggregateRiskScore);

        if (metrics.aggregateRiskScore >= RISK_THRESHOLD_HIGH) {
            emit AlertTriggered(3, "High system-wide risk detected", metrics.timestamp);
        } else if (metrics.aggregateRiskScore >= RISK_THRESHOLD_MEDIUM) {
            emit AlertTriggered(2, "Medium system-wide risk detected", metrics.timestamp);
        }
    }

    /**
     * @notice 计算用户风险分数
     * @param healthFactors 健康因子数组
     * @return riskScore 风险分数
     */
    function calculateUserRiskScore(uint256[] memory healthFactors) public pure returns (uint256) {
        if (healthFactors.length == 0) {
            return 0;
        }

        uint256 totalScore = 0;
        for (uint256 i = 0; i < healthFactors.length; i++) {
            totalScore += calculateSingleHealthFactorScore(healthFactors[i]);
        }

        return totalScore / healthFactors.length;
    }

    /**
     * @notice 计算单个健康因子的分数
     * @param healthFactor 健康因子
     * @return score 分数
     */
    function calculateSingleHealthFactorScore(uint256 healthFactor) public pure returns (uint256) {
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

    /**
     * @notice 获取最新风险指标
     * @return metrics 最新指标
     */
    function getLatestMetrics() external view returns (RiskMetrics memory) {
        return historicalMetrics[latestMetricTimestamp];
    }

    /**
     * @notice 获取历史指标
     * @param limit 返回数量限制
     * @return metricsArray 指标数组
     */
    function getHistoricalMetrics(uint256 limit) external view returns (RiskMetrics[] memory) {
        uint256 actualLimit = limit;
        if (actualLimit > metricTimestamps.length) {
            actualLimit = metricTimestamps.length;
        }

        RiskMetrics[] memory metricsArray = new RiskMetrics[](actualLimit);
        for (uint256 i = 0; i < actualLimit; i++) {
            uint256 index = metricTimestamps.length - actualLimit + i;
            metricsArray[i] = historicalMetrics[metricTimestamps[index]];
        }

        return metricsArray;
    }

    /**
     * @notice 获取所有跟踪的用户
     * @return users 用户数组
     */
    function getTrackedUsers() external view returns (address[] memory) {
        return trackedUsers;
    }

    /**
     * @notice 获取高风险用户
     * @return highRiskUsers 高风险用户数组
     */
    function getHighRiskUsers() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < trackedUsers.length; i++) {
            if (userProfiles[trackedUsers[i]].aggregateRiskScore >= RISK_THRESHOLD_HIGH) {
                count++;
            }
        }

        address[] memory highRiskUsers = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < trackedUsers.length; i++) {
            if (userProfiles[trackedUsers[i]].aggregateRiskScore >= RISK_THRESHOLD_HIGH) {
                highRiskUsers[index] = trackedUsers[i];
                index++;
            }
        }

        return highRiskUsers;
    }

    /**
     * @notice 获取所有协议快照
     * @return snapshots 快照数组
     */
    function getAllProtocolSnapshots() external view returns (ProtocolRiskSnapshot[] memory) {
        ProtocolRiskSnapshot[] memory snapshots = new ProtocolRiskSnapshot[](trackedProtocols.length);
        for (uint256 i = 0; i < trackedProtocols.length; i++) {
            snapshots[i] = protocolSnapshots[trackedProtocols[i]];
        }
        return snapshots;
    }

    /**
     * @notice 获取用户风险概况
     * @param user 用户地址
     * @return profile 用户风险概况
     */
    function getUserProfile(address user) external view returns (UserRiskProfile memory) {
        return userProfiles[user];
    }
}
