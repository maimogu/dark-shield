// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./HedgeStrategyManager.sol";
import "../interfaces/IAavePool.sol";
import "../interfaces/IWETH.sol";

/**
 * @title HedgeStrategyExecutor
 * @notice 对冲策略执行器
 * @dev 执行 AI 生成的对冲策略，包括增加抵押、闪电贷对冲、部分还款等操作
 *
 * 功能概述：
 * 1. 执行各种类型的对冲策略
 * 2. 与 0G Integration 合约交互
 * 3. 完整的策略生命周期管理
 * 4. 风险控制和验证
 */
contract HedgeStrategyExecutor is Ownable, ReentrancyGuard {

    // ============ 数据结构 ============

    /**
     * @notice 执行参数结构体
     * @param strategyId 策略 ID
     * @param user 用户地址
     * @param actionType 操作类型
     * @param amount 金额
     * @param asset 资产地址
     */
    struct ExecutionParams {
        bytes32 strategyId;
        address user;
        uint8 actionType;
        uint256 amount;
        address asset;
    }

    /**
     * @notice 执行结果结构体
     * @param success 是否成功
     * @param actualAmount 实际执行金额
     * @param newHealthFactor 新健康因子
     * @param gasUsed 使用的 gas
     * @param timestamp 执行时间戳
     */
    struct ExecutionResult {
        bool success;
        uint256 actualAmount;
        uint256 newHealthFactor;
        uint256 gasUsed;
        uint256 timestamp;
    }

    // ============ 常量 ============

    /// @notice 操作类型：增加抵押
    uint8 public constant ACTION_ADD_COLLATERAL = 1;
    /// @notice 操作类型：闪电贷对冲
    uint8 public constant ACTION_FLASH_LOAN_HEDGE = 2;
    /// @notice 操作类型：部分还款
    uint8 public constant ACTION_PARTIAL_REPAY = 3;

    /// @notice 健康因子安全阈值
    uint256 public constant SAFE_HEALTH_FACTOR = 1.5e18;
    /// @notice 健康因子警告阈值
    uint256 public constant WARNING_HEALTH_FACTOR = 1.2e18;

    // ============ 状态变量 ============

    /// @notice HedgeStrategyManager 合约地址
    address public hedgeStrategyManager;

    /// @notice 0G Integration 合约地址
    address public ogIntegration;

    /// @notice Aave Pool 合约地址
    address public aavePool;

    /// @notice WETH 合约地址
    address public weth;

    /// @notice 用户执行历史映射
    mapping(address => ExecutionResult[]) public userExecutionHistory;

    /// @notice 允许的执行者映射
    mapping(address => bool) public authorizedExecutors;

    /// @notice 执行的 gas 限制
    uint256 public executionGasLimit = 500000;

    // ============ 事件 ============

    /// @notice 策略执行开始事件
    event ExecutionStarted(
        address indexed user,
        bytes32 indexed strategyId,
        uint8 actionType,
        uint256 amount
    );

    /// @notice 策略执行完成事件
    event ExecutionCompleted(
        address indexed user,
        bytes32 indexed strategyId,
        bool success,
        uint256 actualAmount,
        uint256 newHealthFactor
    );

    /// @notice 授权执行者更新事件
    event ExecutorAuthorized(
        address indexed executor,
        bool authorized
    );

    /// @notice 健康因子更新事件
    event HealthFactorUpdated(
        address indexed user,
        uint256 oldHealthFactor,
        uint256 newHealthFactor
    );

    // ============ 错误 ============

    /// @notice 未授权执行者错误
    error UnauthorizedExecutor(address executor);

    /// @notice 无效策略错误
    error InvalidStrategyError(bytes32 strategyId);

    /// @notice 执行失败错误
    error ExecutionFailed(string reason);

    /// @notice 健康因子未改善错误
    error HealthFactorNotImproved(
        uint256 currentHealthFactor,
        uint256 previousHealthFactor
    );

    /// @notice Gas 限制超限错误
    error GasLimitExceeded(uint256 required, uint256 limit);

    /// @notice 无效资产错误
    error InvalidAsset(address asset);

    // ============ 构造函数 ============

    /**
     * @notice 构造函数
     * @param initialOwner 初始所有者地址
     * @param _hedgeStrategyManager HedgeStrategyManager 合约地址
     * @param _ogIntegration 0G Integration 合约地址
     * @param _aavePool Aave Pool 合约地址
     * @param _weth WETH 合约地址
     */
    constructor(
        address initialOwner,
        address _hedgeStrategyManager,
        address _ogIntegration,
        address _aavePool,
        address _weth
    ) Ownable(initialOwner) {
        hedgeStrategyManager = _hedgeStrategyManager;
        ogIntegration = _ogIntegration;
        aavePool = _aavePool;
        weth = _weth;
        authorizedExecutors[initialOwner] = true;
    }

    // ============ 外部函数 ============

    /**
     * @notice 执行对冲策略
     * @dev 根据策略类型执行相应的对冲操作
     * @param _params 执行参数
     * @return result 执行结果
     */
    function executeHedgeStrategy(ExecutionParams calldata _params) 
        external 
        nonReentrant 
        returns (ExecutionResult memory result) 
    {
        if (!authorizedExecutors[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedExecutor(msg.sender);
        }

        emit ExecutionStarted(
            _params.user,
            _params.strategyId,
            _params.actionType,
            _params.amount
        );

        uint256 gasStart = gasleft();

        if (_params.actionType == ACTION_ADD_COLLATERAL) {
            result = _executeAddCollateral(_params);
        } else if (_params.actionType == ACTION_FLASH_LOAN_HEDGE) {
            result = _executeFlashLoanHedge(_params);
        } else if (_params.actionType == ACTION_PARTIAL_REPAY) {
            result = _executePartialRepay(_params);
        } else {
            revert ExecutionFailed("Invalid action type");
        }

        result.gasUsed = gasStart - gasleft();
        result.timestamp = block.timestamp;

        userExecutionHistory[_params.user].push(result);

        if (result.success) {
            _verifyAndRecordExecution(_params.strategyId, _params.user, result);
        }

        emit ExecutionCompleted(
            _params.user,
            _params.strategyId,
            result.success,
            result.actualAmount,
            result.newHealthFactor
        );

        return result;
    }

    /**
     * @notice 执行增加抵押操作
     * @dev 允许用户增加抵押品以提高健康因子
     * @param _user 用户地址
     * @param _amount 抵押金额
     * @param _asset 资产地址
     * @return success 是否成功
     */
    function addCollateral(
        address _user,
        uint256 _amount,
        address _asset
    ) external nonReentrant returns (bool success) {
        if (_asset == address(0)) {
            _asset = weth;
        }

        require(IERC20(_asset).transferFrom(msg.sender, address(this), _amount), "Transfer failed");

        uint256 healthFactorBefore = _getHealthFactor(_user);
        
        IAavePool(aavePool).supply(_asset, _amount, _user, 0);

        uint256 healthFactorAfter = _getHealthFactor(_user);

        emit HealthFactorUpdated(_user, healthFactorBefore, healthFactorAfter);

        return true;
    }

    /**
     * @notice 执行闪电贷对冲
     * @dev 通过闪电贷获取资金进行对冲操作
     * @param _user 用户地址
     * @param _amount 闪电贷金额
     * @param _asset 资产地址
     * @return success 是否成功
     */
    function executeFlashLoanHedge(
        address _user,
        uint256 _amount,
        address _asset
    ) external nonReentrant returns (bool success) {
        if (!authorizedExecutors[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedExecutor(msg.sender);
        }

        bytes memory params = abi.encode(_user, _asset);

        try IAavePool(aavePool).flashLoanSimple(
            address(this),
            _asset,
            _amount,
            params,
            0
        ) {
            return true;
        } catch {
            revert ExecutionFailed("Flash loan failed");
        }
    }

    /**
     * @notice 执行部分还款
     * @dev 用户部分偿还债务以提高健康因子
     * @param _user 用户地址
     * @param _amount 还款金额
     * @param _asset 资产地址
     * @return success 是否成功
     */
    function partialRepay(
        address _user,
        uint256 _amount,
        address _asset
    ) external nonReentrant returns (bool success) {
        if (_asset == address(0)) {
            _asset = weth;
        }

        require(IERC20(_asset).transferFrom(msg.sender, address(this), _amount), "Transfer failed");

        uint256 healthFactorBefore = _getHealthFactor(_user);

        IAavePool(aavePool).repay(_asset, _amount, 2, _user);

        uint256 healthFactorAfter = _getHealthFactor(_user);

        emit HealthFactorUpdated(_user, healthFactorBefore, healthFactorAfter);

        return true;
    }

    /**
     * @notice 批量执行策略
     * @dev 批量处理多个用户的策略执行
     * @param _paramsArray 执行参数数组
     * @return results 执行结果数组
     */
    function batchExecute(ExecutionParams[] calldata _paramsArray)
        external
        onlyOwner
        returns (ExecutionResult[] memory results)
    {
        results = new ExecutionResult[](_paramsArray.length);

        for (uint256 i = 0; i < _paramsArray.length; i++) {
            try this.executeHedgeStrategy(_paramsArray[i]) returns (ExecutionResult memory result) {
                results[i] = result;
            } catch {
                results[i] = ExecutionResult({
                    success: false,
                    actualAmount: 0,
                    newHealthFactor: 0,
                    gasUsed: 0,
                    timestamp: block.timestamp
                });
            }
        }

        return results;
    }

    /**
     * @notice 授权执行者
     * @dev 仅合约所有者可调用
     * @param _executor 执行者地址
     * @param _authorized 是否授权
     */
    function authorizeExecutor(address _executor, bool _authorized) external onlyOwner {
        require(_executor != address(0), "Invalid executor address");
        authorizedExecutors[_executor] = _authorized;
        emit ExecutorAuthorized(_executor, _authorized);
    }

    /**
     * @notice 更新合约地址
     * @dev 仅合约所有者可调用
     * @param _hedgeStrategyManager 新 HedgeStrategyManager 地址
     * @param _ogIntegration 新 0G Integration 地址
     * @param _aavePool 新 Aave Pool 地址
     */
    function updateContracts(
        address _hedgeStrategyManager,
        address _ogIntegration,
        address _aavePool
    ) external onlyOwner {
        if (_hedgeStrategyManager != address(0)) {
            hedgeStrategyManager = _hedgeStrategyManager;
        }
        if (_ogIntegration != address(0)) {
            ogIntegration = _ogIntegration;
        }
        if (_aavePool != address(0)) {
            aavePool = _aavePool;
        }
    }

    /**
     * @notice 更新 gas 限制
     * @dev 仅合约所有者可调用
     * @param _newLimit 新的 gas 限制
     */
    function updateGasLimit(uint256 _newLimit) external onlyOwner {
        require(_newLimit >= 100000, "Gas limit too low");
        executionGasLimit = _newLimit;
    }

    /**
     * @notice 获取用户执行历史
     * @param _user 用户地址
     * @param _limit 返回数量限制
     * @param _offset 起始偏移
     * @return history 执行历史
     */
    function getExecutionHistory(
        address _user,
        uint256 _limit,
        uint256 _offset
    ) external view returns (ExecutionResult[] memory history) {
        ExecutionResult[] storage allHistory = userExecutionHistory[_user];
        
        if (allHistory.length == 0) {
            return new ExecutionResult[](0);
        }

        uint256 actualLimit = _limit;
        if (_offset >= allHistory.length) {
            return new ExecutionResult[](0);
        }
        if (_offset + _limit > allHistory.length) {
            actualLimit = allHistory.length - _offset;
        }

        history = new ExecutionResult[](actualLimit);
        for (uint256 i = 0; i < actualLimit; i++) {
            history[i] = allHistory[_offset + i];
        }

        return history;
    }

    /**
     * @notice 获取用户执行历史数量
     * @param _user 用户地址
     * @return count 历史数量
     */
    function getExecutionHistoryCount(address _user) external view returns (uint256 count) {
        return userExecutionHistory[_user].length;
    }

    /**
     * @notice 检查执行者是否授权
     * @param _executor 执行者地址
     * @return isAuthorized 是否授权
     */
    function isExecutorAuthorized(address _executor) external view returns (bool isAuthorized) {
        return authorizedExecutors[_executor] || _executor == owner();
    }

    // ============ 内部函数 ============

    function _executeAddCollateral(ExecutionParams calldata _params) 
        internal 
        returns (ExecutionResult memory result) 
    {
        address asset = _params.asset == address(0) ? weth : _params.asset;

        if (asset != weth) {
            require(IERC20(asset).transferFrom(_params.user, address(this), _params.amount), "Transfer failed");
        }

        uint256 healthFactorBefore = _getHealthFactor(_params.user);

        IAavePool(aavePool).supply(asset, _params.amount, _params.user, 0);

        uint256 healthFactorAfter = _getHealthFactor(_params.user);

        result = ExecutionResult({
            success: healthFactorAfter > healthFactorBefore,
            actualAmount: _params.amount,
            newHealthFactor: healthFactorAfter,
            gasUsed: 0,
            timestamp: block.timestamp
        });

        return result;
    }

    function _executeFlashLoanHedge(ExecutionParams calldata _params) 
        internal 
        returns (ExecutionResult memory result) 
    {
        uint256 healthFactorBefore = _getHealthFactor(_params.user);

        bytes memory params = abi.encode(_params.user, _params.asset, _params.amount);

        try IAavePool(aavePool).flashLoanSimple(
            address(this),
            _params.asset,
            _params.amount,
            params,
            0
        ) {
            uint256 healthFactorAfter = _getHealthFactor(_params.user);

            result = ExecutionResult({
                success: healthFactorAfter > healthFactorBefore,
                actualAmount: _params.amount,
                newHealthFactor: healthFactorAfter,
                gasUsed: 0,
                timestamp: block.timestamp
            });
        } catch {
            result = ExecutionResult({
                success: false,
                actualAmount: 0,
                newHealthFactor: healthFactorBefore,
                gasUsed: 0,
                timestamp: block.timestamp
            });
        }

        return result;
    }

    function _executePartialRepay(ExecutionParams calldata _params) 
        internal 
        returns (ExecutionResult memory result) 
    {
        address asset = _params.asset == address(0) ? weth : _params.asset;

        if (asset != weth) {
            require(IERC20(asset).transferFrom(_params.user, address(this), _params.amount), "Transfer failed");
        }

        uint256 healthFactorBefore = _getHealthFactor(_params.user);

        IAavePool(aavePool).repay(asset, _params.amount, 2, _params.user);

        uint256 healthFactorAfter = _getHealthFactor(_params.user);

        result = ExecutionResult({
            success: healthFactorAfter > healthFactorBefore,
            actualAmount: _params.amount,
            newHealthFactor: healthFactorAfter,
            gasUsed: 0,
            timestamp: block.timestamp
        });

        return result;
    }

    function _getHealthFactor(address _user) internal view returns (uint256 healthFactor) {
        try IAavePool(aavePool).getUserAccountData(_user) returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactorTemp
        ) {
            return healthFactorTemp;
        } catch {
            return 1e18;
        }
    }

    function _verifyAndRecordExecution(
        bytes32 _strategyId,
        address _user,
        ExecutionResult memory _result
    ) internal {
        if (hedgeStrategyManager != address(0)) {
            try HedgeStrategyManager(hedgeStrategyManager).verifyStrategyExecution(_strategyId) returns (
                bool isValid,
                HedgeStrategyManager.ExecutionRecord memory record
            ) {
                if (!isValid && _result.success) {
                    revert HealthFactorNotImproved(
                        _result.newHealthFactor,
                        _result.newHealthFactor * 80 / 100
                    );
                }
            } catch {
                
            }
        }

        if (ogIntegration != address(0)) {
            try OgIntegration(ogIntegration).recordPrediction(
                _user,
                _result.success ? 50 : 100,
                _result.newHealthFactor
            ) {
                
            } catch {
                
            }
        }
    }

    function _checkGasLimit(uint256 _required) internal view {
        if (_required > executionGasLimit) {
            revert GasLimitExceeded(_required, executionGasLimit);
        }
    }
}

interface OgIntegration {
    function recordPrediction(
        address _user,
        uint256 _probability,
        uint256 _healthFactor
    ) external;
}
