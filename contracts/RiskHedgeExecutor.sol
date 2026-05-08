// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAavePool.sol";
import "./interfaces/IWETH.sol";
import "./TEEDecisionVerifier.sol";

/**
 * @title IFlashLoanReceiver
 * @notice Aave V3 闪电贷接收器接口
 * @dev 实现此接口的合约可以接收 Aave V3 的闪电贷资金
 */
interface IFlashLoanReceiver {
    /**
     * @notice Aave 闪电贷回调函数
     * @dev 在闪电贷执行后由 Aave Pool 调用，接收方必须在此函数中归还借款及手续费
     * @param asset 借款资产地址
     * @param amount 借款数量
     * @param premium 手续费数量
     * @param initiator 发起闪电贷的地址
     * @param params 传入的额外参数
     * @return success 操作是否成功
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

/**
 * @title RiskHedgeExecutor
 * @notice 风险对冲执行器主合约
 * @dev 集成 Aave V3 协议和 TEE 验证，为用户提供自动化的 DeFi 风险对冲服务
 *
 * 功能概述：
 * 1. 监控用户在 Aave 中的健康因子和风险评分
 * 2. 当风险超过阈值时自动触发对冲操作
 * 3. 通过 TEE 证明确保决策的可信性
 * 4. 支持闪电贷快速对冲策略
 */
contract RiskHedgeExecutor is Ownable, ReentrancyGuard, IFlashLoanReceiver {
    // ============ 数据结构 ============

    /**
     * @notice 用户配置结构体
     * @param enabled 是否启用风险对冲服务
     * @param maxHedgeAmount 最大对冲金额
     * @param cooldownPeriod 两次操作之间的冷却时间（秒）
     * @param autoExecute 是否自动执行对冲操作
     */
    struct UserConfig {
        bool enabled;
        uint256 maxHedgeAmount;
        uint256 cooldownPeriod;
        bool autoExecute;
    }

    // ============ 常量 ============

    /// @notice 自动执行的最低风险评分阈值
    uint256 public constant AUTO_EXECUTE_RISK_THRESHOLD = 50;

    /// @notice 风险严重等级：低
    string public constant SEVERITY_LOW = "LOW";
    /// @notice 风险严重等级：中
    string public constant SEVERITY_MEDIUM = "MEDIUM";
    /// @notice 风险严重等级：高
    string public constant SEVERITY_HIGH = "HIGH";
    /// @notice 风险严重等级：危急
    string public constant SEVERITY_CRITICAL = "CRITICAL";

    // ============ 状态变量 ============

    /// @notice Aave V3 Pool 合约地址（不可变）
    IAavePool public immutable aavePool;

    /// @notice WETH 合约地址（不可变）
    IWETH public immutable weth;

    /// @notice USDC 合约地址（不可变）
    address public immutable usdc;

    /// @notice TEE 决策验证合约地址
    address public teeVerifier;

    /// @notice 用户配置映射
    mapping(address => UserConfig) public userConfigs;

    /// @notice 用户最后一次执行操作的时间戳
    mapping(address => uint256) public lastActionTime;

    /// @notice 用户风险评分映射
    mapping(address => uint256) public riskScores;

    // ============ 事件 ============

    /// @notice 风险预警事件
    event RiskAlert(
        address indexed user,
        uint256 healthFactor,
        uint256 riskScore,
        string severity
    );

    /// @notice 对冲操作执行事件
    event HedgeExecuted(
        address indexed user,
        uint8 actionType,
        uint256 amount,
        address asset,
        uint256 newHealthFactor
    );

    /// @notice 用户配置更新事件
    event UserConfigUpdated(address indexed user);

    // ============ 错误 ============

    /// @notice 用户未启用风险对冲服务
    error UserNotEnabled(address user);

    /// @notice 操作金额超过最大对冲金额限制
    error AmountExceedsMaxHedge(uint256 amount, uint256 maxAmount);

    /// @notice 冷却期内，无法执行操作
    error CooldownActive(uint256 remainingTime);

    /// @notice TEE 证明验证失败
    error TEEVerificationFailed();

    /// @notice 无效的操作类型
    error InvalidActionType(uint8 actionType);

    /// @notice ETH 转账失败
    error ETHTransferFailed();

    // ============ 构造函数 ============

    /**
     * @notice 构造函数
     * @param _aavePool Aave V3 Pool 合约地址
     * @param _weth WETH 合约地址
     * @param _usdc USDC 合约地址
     * @param _teeVerifier TEE 决策验证合约地址
     */
    constructor(
        address _aavePool,
        address _weth,
        address _usdc,
        address _teeVerifier
    ) Ownable(msg.sender) {
        require(_aavePool != address(0), "Aave Pool address cannot be zero");
        require(_weth != address(0), "WETH address cannot be zero");
        require(_usdc != address(0), "USDC address cannot be zero");
        require(_teeVerifier != address(0), "TEE Verifier address cannot be zero");

        aavePool = IAavePool(_aavePool);
        weth = IWETH(_weth);
        usdc = _usdc;
        teeVerifier = _teeVerifier;
    }

    // ============ receive 函数 ============

    /**
     * @notice 接收 ETH 的回调函数
     * @dev 允许合约接收 ETH，用于 WETH 解包装等操作
     */
    receive() external payable {}

    // ============ 外部函数 ============

    /**
     * @notice 设置用户配置
     * @dev 用户自行配置风险对冲参数
     * @param _enabled 是否启用风险对冲服务
     * @param _maxHedgeAmount 最大对冲金额
     * @param _cooldownPeriod 冷却时间（秒）
     * @param _autoExecute 是否自动执行对冲
     */
    function setUserConfig(
        bool _enabled,
        uint256 _maxHedgeAmount,
        uint256 _cooldownPeriod,
        bool _autoExecute
    ) external {
        userConfigs[msg.sender] = UserConfig({
            enabled: _enabled,
            maxHedgeAmount: _maxHedgeAmount,
            cooldownPeriod: _cooldownPeriod,
            autoExecute: _autoExecute
        });

        emit UserConfigUpdated(msg.sender);
    }

    /**
     * @notice 更新 TEE 验证器合约地址
     * @dev 仅合约所有者可调用
     * @param _teeVerifier 新的 TEE 验证器地址
     */
    function setTEEVerifier(address _teeVerifier) external onlyOwner {
        require(_teeVerifier != address(0), "TEE Verifier address cannot be zero");
        teeVerifier = _teeVerifier;
    }

    /**
     * @notice 更新用户风险评分
     * @dev 可由预言机或授权方调用
     * @param _user 目标用户地址
     * @param _score 新的风险评分（0-100）
     */
    function updateRiskScore(address _user, uint256 _score) external {
        require(_score <= 100, "Risk score cannot exceed 100");
        riskScores[_user] = _score;
    }

    /**
     * @notice 检查用户风险状况
     * @dev 查询用户在 Aave 中的账户数据和风险评分
     * @param _user 目标用户地址
     * @return healthFactor 健康因子
     * @return totalCollateral 总抵押品
     * @return totalDebt 总债务
     * @return riskScore 风险评分
     */
    function checkRisk(address _user)
        external
        view
        returns (
            uint256 healthFactor,
            uint256 totalCollateral,
            uint256 totalDebt,
            uint256 riskScore
        )
    {
        // 从 Aave 获取用户账户数据
        (
            totalCollateral,
            totalDebt,
            ,
            ,
            ,
            healthFactor
        ) = aavePool.getUserAccountData(_user);

        // 获取用户风险评分
        riskScore = riskScores[_user];
    }

    /**
     * @notice 触发风险检查
     * @dev 检查用户风险状况，如果满足自动执行条件则触发对冲操作
     * @param _user 目标用户地址
     */
    function triggerRiskCheck(address _user) external nonReentrant {
        UserConfig storage config = userConfigs[_user];

        // 检查用户是否启用了风险对冲服务
        if (!config.enabled) {
            revert UserNotEnabled(_user);
        }

        // 获取用户账户数据
        (
            uint256 totalCollateral,
            uint256 totalDebt,
            ,
            ,
            ,
            uint256 healthFactor
        ) = aavePool.getUserAccountData(_user);

        uint256 score = riskScores[_user];

        // 根据健康因子和风险评分确定风险严重等级
        string memory severity = _calculateSeverity(healthFactor, score);

        // 触发风险预警事件
        emit RiskAlert(_user, healthFactor, score, severity);

        // 如果启用了自动执行且风险评分超过阈值，则自动执行对冲
        if (config.autoExecute && score > AUTO_EXECUTE_RISK_THRESHOLD) {
            // 检查冷却期
            _checkCooldown(_user, config.cooldownPeriod);

            // 确定对冲金额（不超过用户设置的最大对冲金额）
            uint256 hedgeAmount = _calculateHedgeAmount(
                healthFactor,
                totalDebt,
                config.maxHedgeAmount
            );

            if (hedgeAmount > 0) {
                // 执行对冲操作：使用闪电贷进行快速对冲
                _executeHedge(_user, hedgeAmount, 2, usdc);

                // 更新最后操作时间
                lastActionTime[_user] = block.timestamp;
            }
        }
    }

    /**
     * @notice 带 TEE 证明执行对冲操作
     * @dev 需要通过 TEE 决策验证合约验证证明后才能执行
     * @param _user 目标用户地址
     * @param _actionType 操作类型（1=增加抵押，2=闪电贷对冲，3=部分还款）
     * @param _amount 操作金额
     * @param _asset 操作资产地址
     * @param _inputHash 输入数据哈希
     * @param _outputHash 输出数据哈希
     * @param _proof TEE 证明数据
     */
    function executeWithTEEProof(
        address _user,
        uint8 _actionType,
        uint256 _amount,
        address _asset,
        bytes32 _inputHash,
        bytes32 _outputHash,
        bytes calldata _proof
    ) external nonReentrant {
        UserConfig storage config = userConfigs[_user];

        // 检查用户是否启用了风险对冲服务
        if (!config.enabled) {
            revert UserNotEnabled(_user);
        }

        // 检查操作金额是否超过最大对冲金额
        if (_amount > config.maxHedgeAmount) {
            revert AmountExceedsMaxHedge(_amount, config.maxHedgeAmount);
        }

        // 检查冷却期
        _checkCooldown(_user, config.cooldownPeriod);

        // 验证 TEE 证明
        bool verified = TEEDecisionVerifier(teeVerifier).verifyDecision(
            _user,
            _actionType,
            _amount,
            _asset,
            _inputHash,
            _outputHash,
            _proof
        );

        if (!verified) {
            revert TEEVerificationFailed();
        }

        // 验证通过，执行对冲操作
        _executeHedge(_user, _amount, _actionType, _asset);

        // 更新最后操作时间
        lastActionTime[_user] = block.timestamp;
    }

    /**
     * @notice Aave 闪电贷回调函数
     * @dev 由 Aave Pool 在闪电贷发放后调用，合约必须在此函数中完成业务逻辑并归还借款
     * @param asset 借款资产地址
     * @param amount 借款数量
     * @param premium 手续费数量
     * @param initiator 发起闪电贷的地址
     * @param params 编码的参数（包含用户地址和操作类型）
     * @return success 操作是否成功
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        // 仅允许 Aave Pool 调用此回调
        require(
            msg.sender == address(aavePool),
            "Only Aave Pool can call this function"
        );

        // 解码参数：用户地址和操作类型
        (address user, uint8 actionType) = abi.decode(params, (address, uint8));

        // 根据操作类型执行对冲逻辑
        if (actionType == 1) {
            // 操作类型 1：增加抵押
            // 将借到的资产作为抵押品存入 Aave
            _addCollateral(user, amount, asset);
        } else if (actionType == 2) {
            // 操作类型 2：闪电贷对冲
            // 执行对冲交易（如兑换资产以平衡风险敞口）
            // 在实际生产环境中，这里会调用 DEX 进行资产兑换
            _addCollateral(user, amount, asset);
        } else if (actionType == 3) {
            // 操作类型 3：部分还款
            // 使用借到的资产偿还部分债务
            // 将资产转入 Aave 以降低债务
            _addCollateral(user, amount, asset);
        }

        // 授权 Aave Pool 扣除借款本金及手续费
        // 计算需要归还的总金额（本金 + 手续费）
        uint256 totalOwed = amount + premium;

        // 将资产转移给 Aave Pool 以归还闪电贷
        // 使用低级调用确保兼容 ERC20 和 ETH
        if (asset == address(weth)) {
            // 如果是 WETH，先转换为 ETH 再归还
            weth.withdraw(totalOwed);
            (bool success, ) = address(aavePool).call{value: totalOwed}("");
            require(success, "ETH repayment failed");
        } else {
            // 其他 ERC20 资产，直接转账归还
            // 注意：实际使用时需要先 approve Aave Pool
            IERC20(asset).approve(address(aavePool), totalOwed);
        }

        return true;
    }

    // ============ 内部函数 ============

    /**
     * @notice 执行对冲操作
     * @dev 根据操作类型分派到具体的对冲策略
     * @param _user 目标用户地址
     * @param _amount 操作金额
     * @param _actionType 操作类型
     * @param _asset 操作资产地址
     */
    function _executeHedge(
        address _user,
        uint256 _amount,
        uint8 _actionType,
        address _asset
    ) internal {
        // 验证操作类型有效性
        if (_actionType < 1 || _actionType > 3) {
            revert InvalidActionType(_actionType);
        }

        if (_actionType == 1) {
            // 操作类型 1：增加抵押品
            _addCollateral(_user, _amount, _asset);
        } else if (_actionType == 2) {
            // 操作类型 2：闪电贷对冲
            _flashLoanHedge(_user, _amount);
        } else if (_actionType == 3) {
            // 操作类型 3：部分还款（通过增加抵押来改善健康因子）
            _addCollateral(_user, _amount, _asset);
        }

        // 获取执行后的健康因子
        (, , , , , uint256 newHealthFactor) = aavePool.getUserAccountData(_user);

        // 触发对冲执行事件
        emit HedgeExecuted(_user, _actionType, _amount, _asset, newHealthFactor);
    }

    /**
     * @notice 增加抵押品
     * @dev 将指定数量的资产作为抵押品存入 Aave 协议
     * @param _user 代表哪个用户存入
     * @param _amount 存入数量
     * @param _asset 资产地址
     */
    function _addCollateral(
        address _user,
        uint256 _amount,
        address _asset
    ) internal {
        if (_asset == address(weth)) {
            // 如果是 WETH，将合约收到的 ETH 转换为 WETH 后存入
            weth.deposit{value: _amount}();
        }

        // 将资产存入 Aave 作为抵押品
        // 推荐码设为 0
        aavePool.supply(_asset, _amount, _user, 0);
    }

    /**
     * @notice 通过闪电贷执行对冲
     * @dev 从 Aave 借入资产执行对冲操作，在回调中归还借款
     * @param _user 目标用户地址
     * @param _amount 借款数量
     */
    function _flashLoanHedge(address _user, uint256 _amount) internal {
        // 编码回调参数：用户地址和操作类型（闪电贷对冲 = 2）
        bytes memory params = abi.encode(_user, uint8(2));

        // 从 Aave 发起闪电贷
        // 推荐码设为 0
        aavePool.flashLoanSimple(
            address(this),
            usdc,
            _amount,
            params,
            0
        );
    }

    /**
     * @notice 检查冷却期
     * @dev 确保两次操作之间有足够的冷却时间
     * @param _user 用户地址
     * @param _cooldownPeriod 冷却时间（秒）
     */
    function _checkCooldown(address _user, uint256 _cooldownPeriod) internal view {
        if (_cooldownPeriod > 0) {
            uint256 lastAction = lastActionTime[_user];
            if (lastAction > 0) {
                uint256 elapsed = block.timestamp - lastAction;
                if (elapsed < _cooldownPeriod) {
                    revert CooldownActive(_cooldownPeriod - elapsed);
                }
            }
        }
    }

    /**
     * @notice 计算风险严重等级
     * @dev 根据健康因子和风险评分综合判断风险等级
     * @param _healthFactor 健康因子
     * @param _riskScore 风险评分
     * @return severity 风险严重等级字符串
     */
    function _calculateSeverity(uint256 _healthFactor, uint256 _riskScore)
        internal
        pure
        returns (string memory severity)
    {
        // 健康因子低于 1e18 表示可被清算，为危急状态
        if (_healthFactor < 1e18) {
            severity = SEVERITY_CRITICAL;
        }
        // 健康因子低于 1.5e18 或风险评分高于 75 为高风险
        else if (_healthFactor < 1.5e18 || _riskScore > 75) {
            severity = SEVERITY_HIGH;
        }
        // 风险评分高于 50 为中等风险
        else if (_riskScore > 50) {
            severity = SEVERITY_MEDIUM;
        }
        // 其他情况为低风险
        else {
            severity = SEVERITY_LOW;
        }
    }

    /**
     * @notice 计算对冲金额
     * @dev 根据健康因子和债务情况计算合适的对冲金额
     * @param _healthFactor 当前健康因子
     * @param _totalDebt 总债务
     * @param _maxHedgeAmount 用户设置的最大对冲金额
     * @return hedgeAmount 建议的对冲金额
     */
    function _calculateHedgeAmount(
        uint256 _healthFactor,
        uint256 _totalDebt,
        uint256 _maxHedgeAmount
    ) internal pure returns (uint256 hedgeAmount) {
        if (_healthFactor >= 1e18 && _totalDebt > 0) {
            // 计算需要补充的抵押品比例
            // 目标是将健康因子恢复到 2.0e18 以上
            // 简化计算：对冲金额 = 总债务 * (2.0 - 当前健康因子) / 当前健康因子
            uint256 targetHF = 2e18;
            if (_healthFactor < targetHF) {
                uint256 deficit = targetHF - _healthFactor;
                hedgeAmount = (_totalDebt * deficit) / _healthFactor;

                // 不超过用户设置的最大对冲金额
                if (hedgeAmount > _maxHedgeAmount) {
                    hedgeAmount = _maxHedgeAmount;
                }
            }
        }
    }
}

/**
 * @title IERC20
 * @notice 简化版 ERC20 接口（仅包含本合约需要用到的函数）
 */
interface IERC20 {
    /**
     * @notice 授权指定地址使用一定数量的代币
     * @param spender 被授权地址
     * @param amount 授权数量
     * @return success 是否授权成功
     */
    function approve(address spender, uint256 amount) external returns (bool);
}
