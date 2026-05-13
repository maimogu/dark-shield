// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title StrategyBacktester
 * @notice 策略回测引擎
 * @dev 允许在历史数据上模拟和测试对冲策略
 */
contract StrategyBacktester is Ownable {
    /**
     * @notice 回测配置结构
     */
    struct BacktestConfig {
        uint256 configId;
        string name;
        address creator;
        uint256 startTime;
        uint256 endTime;
        uint256 initialCapital;
        uint256[] strategyParams;
        bytes32 dataHash;
        bool active;
    }

    /**
     * @notice 回测结果结构
     */
    struct BacktestResult {
        uint256 resultId;
        uint256 configId;
        uint256 finalCapital;
        uint256 totalReturn;
        uint256 maxDrawdown;
        uint256 sharpeRatio;
        uint256 winRate;
        uint256 totalTrades;
        uint256 timestamp;
        bytes32 resultHash;
        bool verified;
    }

    /**
     * @notice 策略执行记录
     */
    struct StrategyExecution {
        uint256 executionId;
        uint256 configId;
        uint256 timestamp;
        uint256 actionType;
        uint256 amount;
        address asset;
        uint256 price;
        bytes32 executionHash;
    }

    mapping(uint256 => BacktestConfig) public configs;
    uint256[] public configIds;
    mapping(uint256 => bool) public configExists;
    uint256 public nextConfigId;

    mapping(uint256 => BacktestResult) public results;
    mapping(uint256 => uint256[]) public configResults;
    uint256 public nextResultId;

    mapping(uint256 => StrategyExecution[]) public executions;
    uint256 public nextExecutionId;

    event ConfigCreated(uint256 indexed configId, address indexed creator, string name);
    event ConfigUpdated(uint256 indexed configId);
    event ConfigDeleted(uint256 indexed configId);
    event ResultSubmitted(uint256 indexed resultId, uint256 indexed configId, uint256 totalReturn);
    event ResultVerified(uint256 indexed resultId);
    event ExecutionRecorded(uint256 indexed executionId, uint256 indexed configId, uint256 actionType);

    /**
     * @notice 构造函数
     * @param initialOwner 初始所有者
     */
    constructor(address initialOwner) Ownable(initialOwner) {
        nextConfigId = 1;
        nextResultId = 1;
        nextExecutionId = 1;
    }

    /**
     * @notice 创建回测配置
     * @param name 配置名称
     * @param startTime 开始时间
     * @param endTime 结束时间
     * @param initialCapital 初始资金
     * @param strategyParams 策略参数
     * @param dataHash 数据哈希
     */
    function createConfig(
        string calldata name,
        uint256 startTime,
        uint256 endTime,
        uint256 initialCapital,
        uint256[] calldata strategyParams,
        bytes32 dataHash
    ) external {
        require(startTime < endTime, "Invalid time range");
        require(initialCapital > 0, "Initial capital must be positive");

        uint256 configId = nextConfigId++;
        configs[configId] = BacktestConfig({
            configId: configId,
            name: name,
            creator: msg.sender,
            startTime: startTime,
            endTime: endTime,
            initialCapital: initialCapital,
            strategyParams: strategyParams,
            dataHash: dataHash,
            active: true
        });

        configIds.push(configId);
        configExists[configId] = true;

        emit ConfigCreated(configId, msg.sender, name);
    }

    /**
     * @notice 更新回测配置
     * @param configId 配置 ID
     * @param name 配置名称
     * @param strategyParams 策略参数
     * @param dataHash 数据哈希
     */
    function updateConfig(
        uint256 configId,
        string calldata name,
        uint256[] calldata strategyParams,
        bytes32 dataHash
    ) external {
        require(configExists[configId], "Config does not exist");
        require(configs[configId].creator == msg.sender || msg.sender == owner(), "Not authorized");

        configs[configId].name = name;
        configs[configId].strategyParams = strategyParams;
        configs[configId].dataHash = dataHash;

        emit ConfigUpdated(configId);
    }

    /**
     * @notice 删除回测配置
     * @param configId 配置 ID
     */
    function deleteConfig(uint256 configId) external {
        require(configExists[configId], "Config does not exist");
        require(configs[configId].creator == msg.sender || msg.sender == owner(), "Not authorized");

        configs[configId].active = false;

        emit ConfigDeleted(configId);
    }

    /**
     * @notice 提交回测结果
     * @param configId 配置 ID
     * @param finalCapital 最终资金
     * @param maxDrawdown 最大回撤
     * @param sharpeRatio 夏普比率
     * @param winRate 胜率
     * @param totalTrades 总交易次数
     * @param resultHash 结果哈希
     */
    function submitResult(
        uint256 configId,
        uint256 finalCapital,
        uint256 maxDrawdown,
        uint256 sharpeRatio,
        uint256 winRate,
        uint256 totalTrades,
        bytes32 resultHash
    ) external {
        require(configExists[configId], "Config does not exist");
        require(configs[configId].active, "Config not active");

        uint256 totalReturn = finalCapital >= configs[configId].initialCapital 
            ? ((finalCapital - configs[configId].initialCapital) * 10000) / configs[configId].initialCapital
            : 0;

        uint256 resultId = nextResultId++;
        results[resultId] = BacktestResult({
            resultId: resultId,
            configId: configId,
            finalCapital: finalCapital,
            totalReturn: totalReturn,
            maxDrawdown: maxDrawdown,
            sharpeRatio: sharpeRatio,
            winRate: winRate,
            totalTrades: totalTrades,
            timestamp: block.timestamp,
            resultHash: resultHash,
            verified: false
        });

        configResults[configId].push(resultId);

        emit ResultSubmitted(resultId, configId, totalReturn);
    }

    /**
     * @notice 验证回测结果
     * @param resultId 结果 ID
     */
    function verifyResult(uint256 resultId) external onlyOwner {
        require(results[resultId].timestamp != 0, "Result does not exist");
        require(!results[resultId].verified, "Result already verified");

        results[resultId].verified = true;

        emit ResultVerified(resultId);
    }

    /**
     * @notice 记录策略执行
     * @param configId 配置 ID
     * @param timestamp 时间戳
     * @param actionType 操作类型
     * @param amount 金额
     * @param asset 资产地址
     * @param price 价格
     * @param executionHash 执行哈希
     */
    function recordExecution(
        uint256 configId,
        uint256 timestamp,
        uint256 actionType,
        uint256 amount,
        address asset,
        uint256 price,
        bytes32 executionHash
    ) external {
        require(configExists[configId], "Config does not exist");

        uint256 executionId = nextExecutionId++;
        executions[configId].push(StrategyExecution({
            executionId: executionId,
            configId: configId,
            timestamp: timestamp,
            actionType: actionType,
            amount: amount,
            asset: asset,
            price: price,
            executionHash: executionHash
        }));

        emit ExecutionRecorded(executionId, configId, actionType);
    }

    /**
     * @notice 获取用户的配置
     * @param user 用户地址
     * @return userConfigIds 配置 ID 数组
     */
    function getUserConfigs(address user) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < configIds.length; i++) {
            if (configs[configIds[i]].creator == user && configs[configIds[i]].active) {
                count++;
            }
        }

        uint256[] memory userConfigIds = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < configIds.length; i++) {
            if (configs[configIds[i]].creator == user && configs[configIds[i]].active) {
                userConfigIds[index] = configIds[i];
                index++;
            }
        }

        return userConfigIds;
    }

    /**
     * @notice 获取配置的所有结果
     * @param configId 配置 ID
     * @return resultIds 结果 ID 数组
     */
    function getConfigResults(uint256 configId) external view returns (uint256[] memory) {
        return configResults[configId];
    }

    /**
     * @notice 获取配置的执行记录
     * @param configId 配置 ID
     * @param limit 返回数量限制
     * @param offset 起始偏移
     * @return executionArray 执行记录数组
     */
    function getConfigExecutions(
        uint256 configId,
        uint256 limit,
        uint256 offset
    ) external view returns (StrategyExecution[] memory) {
        uint256 total = executions[configId].length;
        if (offset >= total) {
            return new StrategyExecution[](0);
        }

        uint256 actualLimit = limit;
        if (offset + limit > total) {
            actualLimit = total - offset;
        }

        StrategyExecution[] memory executionArray = new StrategyExecution[](actualLimit);
        for (uint256 i = 0; i < actualLimit; i++) {
            executionArray[i] = executions[configId][offset + i];
        }

        return executionArray;
    }

    /**
     * @notice 获取所有活跃配置
     * @return activeConfigIds 活跃配置 ID 数组
     */
    function getActiveConfigs() external view returns (uint256[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < configIds.length; i++) {
            if (configs[configIds[i]].active) {
                activeCount++;
            }
        }

        uint256[] memory activeConfigIds = new uint256[](activeCount);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < configIds.length; i++) {
            if (configs[configIds[i]].active) {
                activeConfigIds[currentIndex] = configIds[i];
                currentIndex++;
            }
        }

        return activeConfigIds;
    }

    /**
     * @notice 获取配置的最佳结果
     * @param configId 配置 ID
     * @return bestResult 最佳结果
     */
    function getBestResult(uint256 configId) external view returns (BacktestResult memory) {
        require(configExists[configId], "Config does not exist");

        uint256 bestReturn = 0;
        uint256 bestResultId = 0;

        for (uint256 i = 0; i < configResults[configId].length; i++) {
            uint256 resultId = configResults[configId][i];
            if (results[resultId].totalReturn > bestReturn) {
                bestReturn = results[resultId].totalReturn;
                bestResultId = resultId;
            }
        }

        return results[bestResultId];
    }

    /**
     * @notice 比较两个配置的性能
     * @param configId1 配置 ID 1
     * @param configId2 配置 ID 2
     * @return result1 配置 1 的最佳结果
     * @return result2 配置 2 的最佳结果
     */
    function compareConfigs(
        uint256 configId1,
        uint256 configId2
    ) external view returns (BacktestResult memory, BacktestResult memory) {
        require(configExists[configId1], "Config 1 does not exist");
        require(configExists[configId2], "Config 2 does not exist");

        return (this.getBestResult(configId1), this.getBestResult(configId2));
    }
}
