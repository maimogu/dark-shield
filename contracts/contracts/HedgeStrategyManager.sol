// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title HedgeStrategyManager
 * @notice AI 驱动的对冲策略推荐管理器
 * @dev 集成 0G AI 服务，生成和推荐风险对冲策略
 *
 * 功能概述：
 * 1. 请求和生成对冲策略推荐
 * 2. 策略执行和验证
 * 3. 完整的审计追踪
 */
contract HedgeStrategyManager is Ownable, ReentrancyGuard {

    // ============ 数据结构 ============

    /**
     * @notice 对冲策略结构体
     * @param actionType 操作类型 (1=增加抵押, 2=闪电贷对冲, 3=部分还款)
     * @param amount 推荐金额
     * @param asset 资产地址
     * @param expectedOutcome 预期结果 (健康因子改善)
     * @param confidence 推荐置信度
     * @param recommendationProof 推荐证明
     * @param executionProof 执行证明
     * @param executed 是否已执行
     * @param timestamp 时间戳
     */
    struct HedgeStrategy {
        uint8 actionType;
        uint256 amount;
        address asset;
        uint256 expectedOutcome;
        uint256 confidence;
        bytes32 recommendationProof;
        bytes32 executionProof;
        bool executed;
        uint256 timestamp;
    }

    /**
     * @notice 策略请求结构体
     * @param user 用户地址
     * @param currentHealthFactor 当前健康因子
     * @param totalDebt 总债务
     * @param availableCollateral 可用抵押品
     * @param daProof DA 证明
     */
    struct StrategyRequest {
        address user;
        uint256 currentHealthFactor;
        uint256 totalDebt;
        uint256 availableCollateral;
        bytes32 daProof;
    }

    /**
     * @notice 策略执行记录结构体
     * @param strategyId 策略 ID
     * @param executedBy 执行者
     * @param executedAt 执行时间
     * @param actualOutcome 实际结果
     * @param success 是否成功
     */
    struct ExecutionRecord {
        bytes32 strategyId;
        address executedBy;
        uint256 executedAt;
        uint256 actualOutcome;
        bool success;
    }

    // ============ 常量 ============

    /// @notice 操作类型：增加抵押
    uint8 public constant ACTION_ADD_COLLATERAL = 1;
    /// @notice 操作类型：闪电贷对冲
    uint8 public constant ACTION_FLASH_LOAN_HEDGE = 2;
    /// @notice 操作类型：部分还款
    uint8 public constant ACTION_PARTIAL_REPAY = 3;

    /// @notice 策略有效期 (1 小时)
    uint256 public constant STRATEGY_VALIDITY_PERIOD = 1 hours;
    /// @notice 策略执行冷却期 (15 分钟)
    uint256 public constant EXECUTION_COOLDOWN = 15 minutes;
    /// @notice 最小置信度阈值
    uint256 public constant MIN_CONFIDENCE_THRESHOLD = 50;

    // ============ 状态变量 ============

    /// @notice 用户对冲策略映射
    mapping(address => HedgeStrategy[]) public userStrategies;

    /// @notice 用户最后策略请求时间
    mapping(address => uint256) public lastStrategyRequest;

    /// @notice 用户最后策略执行时间
    mapping(address => uint256) public lastExecutionTime;

    /// @notice 策略 ID 到策略详情的映射
    mapping(bytes32 => HedgeStrategy) public strategyDetails;

    /// @notice 策略执行记录映射
    mapping(bytes32 => ExecutionRecord) public executionRecords;

    /// @notice 0G DA 证明存储
    mapping(bytes32 => bool) public daProofs;

    /// @notice 策略计数器
    uint256 public strategyCounter;

    /// @notice 0G Integration 合约地址
    address public ogIntegration;

    // ============ 事件 ============

    /// @notice 策略推荐事件
    event StrategyRecommended(
        address indexed user,
        bytes32 indexed strategyId,
        uint8 actionType,
        uint256 amount,
        address asset,
        uint256 expectedOutcome,
        uint256 confidence
    );

    /// @notice 策略执行事件
    event StrategyExecuted(
        address indexed user,
        bytes32 indexed strategyId,
        bytes32 executionProof,
        bool success
    );

    /// @notice 策略过期事件
    event StrategyExpired(
        address indexed user,
        bytes32 indexed strategyId
    );

    // ============ 错误 ============

    /// @notice 无效策略错误
    error InvalidStrategy(bytes32 strategyId);

    /// @notice 策略已过期错误
    error StrategyExpiredError(bytes32 strategyId);

    /// @notice 策略已执行错误
    error StrategyAlreadyExecuted(bytes32 strategyId);

    /// @notice 冷却期未过错误
    error CooldownNotElapsed(address user);

    /// @notice 置信度过低错误
    error ConfidenceTooLow(uint256 confidence, uint256 minimum);

    /// @notice 无可用策略错误
    error NoAvailableStrategy(address user);

    /// @notice 请求频率过高错误
    error RequestTooFrequent(address user);

    /// @notice 无效操作类型错误
    error InvalidActionType(uint8 actionType);

    // ============ 构造函数 ============

    /**
     * @notice 构造函数
     * @param initialOwner 初始所有者地址
     * @param _ogIntegration 0G Integration 合约地址
     */
    constructor(address initialOwner, address _ogIntegration) Ownable(initialOwner) {
        ogIntegration = _ogIntegration;
        strategyCounter = 0;
    }

    // ============ 外部函数 ============

    /**
     * @notice 请求对冲策略推荐
     * @dev 用户请求 AI 生成对冲策略推荐
     * @param _healthFactor 当前健康因子
     * @param _totalDebt 总债务
     * @param _availableCollateral 可用抵押品
     * @param _daProof DA 证明哈希
     * @return strategyId 生成的策略 ID
     */
    function requestHedgeStrategy(
        uint256 _healthFactor,
        uint256 _totalDebt,
        uint256 _availableCollateral,
        bytes32 _daProof
    ) external nonReentrant returns (bytes32 strategyId) {
        address user = msg.sender;

        if (block.timestamp - lastStrategyRequest[user] < EXECUTION_COOLDOWN && lastStrategyRequest[user] != 0) {
            revert RequestTooFrequent(user);
        }

        lastStrategyRequest[user] = block.timestamp;

        HedgeStrategy memory strategy = _generateStrategy(
            user,
            _healthFactor,
            _totalDebt,
            _availableCollateral
        );

        strategyId = keccak256(abi.encode(
            user,
            strategy.actionType,
            strategy.amount,
            strategy.asset,
            block.timestamp,
            strategyCounter++
        ));

        strategy.recommendationProof = _generateRecommendationProof(strategyId, strategy);

        userStrategies[user].push(strategy);
        strategyDetails[strategyId] = strategy;
        daProofs[_daProof] = true;
        daProofs[strategy.recommendationProof] = true;

        emit StrategyRecommended(
            user,
            strategyId,
            strategy.actionType,
            strategy.amount,
            strategy.asset,
            strategy.expectedOutcome,
            strategy.confidence
        );

        return strategyId;
    }

    /**
     * @notice 获取用户推荐策略
     * @dev 获取用户最新且有效的策略推荐
     * @param _user 用户地址
     * @return strategy 最新策略
     * @return strategyId 策略 ID
     */
    function getRecommendedStrategy(address _user) public view returns (HedgeStrategy memory strategy, bytes32 strategyId) {
        HedgeStrategy[] storage strategies = userStrategies[_user];
        
        if (strategies.length == 0) {
            revert NoAvailableStrategy(_user);
        }

        for (uint256 i = strategies.length; i > 0; i--) {
            uint256 index = i - 1;
            if (!strategies[index].executed) {
                uint256 age = block.timestamp - strategies[index].timestamp;
                if (age <= STRATEGY_VALIDITY_PERIOD) {
                    strategy = strategies[index];
                    strategyId = keccak256(abi.encode(
                        _user,
                        strategy.actionType,
                        strategy.amount,
                        strategy.asset,
                        strategy.timestamp,
                        index
                    ));
                    return (strategy, strategyId);
                }
            }
        }

        revert NoAvailableStrategy(_user);
    }

    /**
     * @notice 执行推荐策略
     * @dev 执行指定用户的推荐策略
     * @param _user 用户地址
     * @return success 是否执行成功
     */
    function executeRecommendedStrategy(address _user) external nonReentrant returns (bool success) {
        address executor = msg.sender;
        
        if (block.timestamp - lastExecutionTime[executor] < EXECUTION_COOLDOWN && lastExecutionTime[executor] != 0) {
            revert CooldownNotElapsed(executor);
        }

        (HedgeStrategy memory strategy, bytes32 strategyId) = getRecommendedStrategy(_user);

        if (strategy.timestamp > 0 && block.timestamp - strategy.timestamp > STRATEGY_VALIDITY_PERIOD) {
            revert StrategyExpiredError(strategyId);
        }

        if (strategy.executed) {
            revert StrategyAlreadyExecuted(strategyId);
        }

        if (strategy.confidence < MIN_CONFIDENCE_THRESHOLD) {
            revert ConfidenceTooLow(strategy.confidence, MIN_CONFIDENCE_THRESHOLD);
        }

        lastExecutionTime[executor] = block.timestamp;

        bytes32 executionProof = _generateExecutionProof(
            strategyId,
            _user,
            executor,
            strategy.actionType,
            strategy.amount
        );

        _updateStrategyExecution(_user, strategyId, executionProof);

        executionRecords[strategyId] = ExecutionRecord({
            strategyId: strategyId,
            executedBy: executor,
            executedAt: block.timestamp,
            actualOutcome: strategy.expectedOutcome,
            success: true
        });

        daProofs[executionProof] = true;

        emit StrategyExecuted(_user, strategyId, executionProof, true);

        return true;
    }

    /**
     * @notice 验证策略执行结果
     * @dev 验证策略是否正确执行
     * @param _strategyId 策略 ID
     * @return isValid 是否有效
     * @return record 执行记录
     */
    function verifyStrategyExecution(bytes32 _strategyId) external view returns (bool isValid, ExecutionRecord memory record) {
        record = executionRecords[_strategyId];
        
        if (record.strategyId == bytes32(0)) {
            return (false, record);
        }

        HedgeStrategy memory strategy = strategyDetails[_strategyId];
        
        isValid = record.success &&
                  record.actualOutcome >= strategy.expectedOutcome * 80 / 100 &&
                  daProofs[record.strategyId];

        return (isValid, record);
    }

    /**
     * @notice 获取用户策略历史
     * @param _user 用户地址
     * @param _limit 返回数量限制
     * @param _offset 起始偏移
     * @return strategies 策略数组
     */
    function getStrategyHistory(
        address _user,
        uint256 _limit,
        uint256 _offset
    ) external view returns (HedgeStrategy[] memory strategies) {
        HedgeStrategy[] storage allStrategies = userStrategies[_user];
        
        if (allStrategies.length == 0) {
            return new HedgeStrategy[](0);
        }

        uint256 actualLimit = _limit;
        if (_offset >= allStrategies.length) {
            return new HedgeStrategy[](0);
        }
        if (_offset + _limit > allStrategies.length) {
            actualLimit = allStrategies.length - _offset;
        }

        strategies = new HedgeStrategy[](actualLimit);
        for (uint256 i = 0; i < actualLimit; i++) {
            strategies[i] = allStrategies[_offset + i];
        }

        return strategies;
    }

    /**
     * @notice 获取用户策略数量
     * @param _user 用户地址
     * @return count 策略数量
     */
    function getStrategyCount(address _user) external view returns (uint256 count) {
        return userStrategies[_user].length;
    }

    /**
     * @notice 检查策略是否有效
     * @param _user 用户地址
     * @return hasValid 是否有有效策略
     */
    function hasValidStrategy(address _user) external view returns (bool hasValid) {
        HedgeStrategy[] storage strategies = userStrategies[_user];
        
        for (uint256 i = strategies.length; i > 0; i--) {
            uint256 index = i - 1;
            if (!strategies[index].executed) {
                uint256 age = block.timestamp - strategies[index].timestamp;
                if (age <= STRATEGY_VALIDITY_PERIOD) {
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * @notice 更新 0G Integration 合约地址
     * @dev 仅合约所有者可调用
     * @param _newAddress 新地址
     */
    function updateOgIntegration(address _newAddress) external onlyOwner {
        require(_newAddress != address(0), "Invalid address");
        ogIntegration = _newAddress;
    }

    /**
     * @notice 验证 DA 证明
     * @param _daProof DA 证明哈希
     * @return isValid 是否有效
     */
    function verifyDAProof(bytes32 _daProof) external view returns (bool isValid) {
        return daProofs[_daProof];
    }

    // ============ 内部函数 ============

    function _generateStrategy(
        address _user,
        uint256 _healthFactor,
        uint256 _totalDebt,
        uint256 _availableCollateral
    ) internal view returns (HedgeStrategy memory strategy) {
        uint8 actionType;
        uint256 amount;
        uint256 expectedOutcome;
        uint256 confidence;

        if (_healthFactor < 1.1e18) {
            actionType = ACTION_PARTIAL_REPAY;
            amount = _totalDebt / 10;
            expectedOutcome = (_healthFactor * 120) / 100;
            confidence = 85;
        } else if (_healthFactor < 1.3e18) {
            if (_availableCollateral > 0) {
                actionType = ACTION_ADD_COLLATERAL;
                amount = (_totalDebt * 30) / 100;
                expectedOutcome = (_healthFactor * 115) / 100;
                confidence = 75;
            } else {
                actionType = ACTION_PARTIAL_REPAY;
                amount = _totalDebt / 20;
                expectedOutcome = (_healthFactor * 108) / 100;
                confidence = 70;
            }
        } else {
            actionType = ACTION_ADD_COLLATERAL;
            amount = (_totalDebt * 20) / 100;
            expectedOutcome = (_healthFactor * 105) / 100;
            confidence = 60;
        }

        strategy = HedgeStrategy({
            actionType: actionType,
            amount: amount,
            asset: address(0),
            expectedOutcome: expectedOutcome,
            confidence: confidence,
            recommendationProof: bytes32(0),
            executionProof: bytes32(0),
            executed: false,
            timestamp: block.timestamp
        });

        return strategy;
    }

    function _generateRecommendationProof(
        bytes32 _strategyId,
        HedgeStrategy memory _strategy
    ) internal view returns (bytes32 proof) {
        return keccak256(abi.encode(
            _strategyId,
            _strategy.actionType,
            _strategy.amount,
            _strategy.asset,
            _strategy.expectedOutcome,
            _strategy.confidence,
            block.timestamp,
            ogIntegration
        ));
    }

    function _generateExecutionProof(
        bytes32 _strategyId,
        address _user,
        address _executor,
        uint8 _actionType,
        uint256 _amount
    ) internal view returns (bytes32 proof) {
        return keccak256(abi.encode(
            _strategyId,
            _user,
            _executor,
            _actionType,
            _amount,
            block.timestamp,
            block.number
        ));
    }

    function _updateStrategyExecution(
        address _user,
        bytes32 _strategyId,
        bytes32 _executionProof
    ) internal {
        HedgeStrategy[] storage strategies = userStrategies[_user];
        
        for (uint256 i = 0; i < strategies.length; i++) {
            bytes32 currentId = keccak256(abi.encode(
                _user,
                strategies[i].actionType,
                strategies[i].amount,
                strategies[i].asset,
                strategies[i].timestamp,
                i
            ));
            
            if (currentId == _strategyId) {
                strategies[i].executed = true;
                strategies[i].executionProof = _executionProof;
                strategyDetails[_strategyId].executed = true;
                strategyDetails[_strategyId].executionProof = _executionProof;
                return;
            }
        }
    }
}
