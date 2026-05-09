// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OgIntegration
 * @notice DarkShield 与 0G 服务的桥接合约
 * @dev 集成 0G DA（数据可用性）服务，用于清算风险预测和证明存储
 *
 * 功能概述：
 * 1. 请求清算风险预测
 * 2. 存储 0G DA 证明数据
 * 3. 提供风险等级评估
 */
contract OgIntegration is Ownable, ReentrancyGuard {

    // ============ 数据结构 ============

    /**
     * @notice 清算预测结果结构体
     * @param probability 清算概率 (0-10000, 0.00% - 100.00%)
     * @param riskLevel 风险等级 (LOW=0, MEDIUM=1, HIGH=2, CRITICAL=3)
     * @param confidence 置信度 (0-100)
     * @param daProof 0G DA 证明哈希
     * @param timestamp 预测时间戳
     */
    struct LiquidationPrediction {
        uint256 probability;
        uint256 riskLevel;
        uint256 confidence;
        bytes32 daProof;
        uint256 timestamp;
    }

    /**
     * @notice 预测请求结构体
     * @param healthFactor 健康因子 (1e18 精度)
     * @param totalDebt 总债务 (1e18 精度)
     * @param totalCollateral 总抵押品 (1e18 精度)
     * @param user 用户地址
     */
    struct PredictionRequest {
        uint256 healthFactor;
        uint256 totalDebt;
        uint256 totalCollateral;
        address user;
    }

    // ============ 常量 ============

    /// @notice 风险等级：低
    uint256 public constant RISK_LEVEL_LOW = 0;
    /// @notice 风险等级：中
    uint256 public constant RISK_LEVEL_MEDIUM = 1;
    /// @notice 风险等级：高
    uint256 public constant RISK_LEVEL_HIGH = 2;
    /// @notice 风险等级：危急
    uint256 public constant RISK_LEVEL_CRITICAL = 3;

    /// @notice 概率精度基数 (用于 0.00% - 100.00% 表示)
    uint256 public constant PROBABILITY_PRECISION = 10000;

    /// @notice 基础清算阈值 (50%)
    uint256 public constant DEFAULT_LIQUIDATION_THRESHOLD = 5000;

    // ============ 状态变量 ============

    /// @notice 清算阈值 (0-10000, 默认 5000 = 50%)
    uint256 public liquidationThreshold;

    /// @notice 用户清算预测映射
    mapping(address => LiquidationPrediction) public predictions;

    /// @notice 用户最后请求映射
    mapping(address => PredictionRequest) public lastRequests;

    /// @notice 0G DA 证明存储
    mapping(bytes32 => bool) public daProofs;

    // ============ 事件 ============

    /// @notice 清算风险预测事件
    event LiquidationRiskPredicted(
        address indexed user,
        uint256 probability,
        uint256 riskLevel,
        uint256 confidence,
        bytes32 daProof
    );

    /// @notice 阈值更新事件
    event ThresholdUpdated(
        uint256 oldThreshold,
        uint256 newThreshold
    );

    // ============ 错误 ============

    /// @notice 无效的健康因子错误
    error InvalidHealthFactor(uint256 healthFactor);

    /// @notice 预测不可用错误
    error PredictionNotAvailable(address user);

    /// @notice 零健康因子错误
    error ZeroHealthFactor();

    // ============ 构造函数 ============

    /**
     * @notice 构造函数
     * @param initialOwner 初始所有者地址
     */
    constructor(address initialOwner) Ownable(initialOwner) {
        liquidationThreshold = DEFAULT_LIQUIDATION_THRESHOLD;
    }

    // ============ 外部函数 ============

    /**
     * @notice 请求清算风险预测
     * @dev 用户请求清算风险预测，内部计算基础概率
     * @param _healthFactor 健康因子 (1e18 精度)
     * @param _totalDebt 总债务 (1e18 精度)
     * @param _totalCollateral 总抵押品 (1e18 精度)
     */
    function requestPrediction(
        uint256 _healthFactor,
        uint256 _totalDebt,
        uint256 _totalCollateral
    ) external nonReentrant {
        if (_healthFactor == 0) {
            revert ZeroHealthFactor();
        }

        address user = msg.sender;

        lastRequests[user] = PredictionRequest({
            healthFactor: _healthFactor,
            totalDebt: _totalDebt,
            totalCollateral: _totalCollateral,
            user: user
        });

        uint256 probability = _calculateBasicProbability(
            _healthFactor,
            _totalDebt,
            _totalCollateral
        );

        uint256 riskLevel = _calculateRiskLevel(probability);

        uint256 confidence = _calculateConfidence(_healthFactor, _totalDebt);

        predictions[user] = LiquidationPrediction({
            probability: probability,
            riskLevel: riskLevel,
            confidence: confidence,
            daProof: bytes32(0),
            timestamp: block.timestamp
        });

        emit LiquidationRiskPredicted(
            user,
            probability,
            riskLevel,
            confidence,
            bytes32(0)
        );
    }

    /**
     * @notice 使用 0G DA 证明更新预测
     * @dev 接收来自 0G 服务的 DA 证明并更新预测结果
     * @param _user 用户地址
     * @param _probability 清算概率 (0-10000)
     * @param _confidence 置信度 (0-100)
     * @param _daProof 0G DA 证明哈希
     */
    function updatePredictionWithProof(
        address _user,
        uint256 _probability,
        uint256 _confidence,
        bytes32 _daProof
    ) external onlyOwner {
        if (_probability > PROBABILITY_PRECISION) {
            revert InvalidHealthFactor(_probability);
        }

        LiquidationPrediction storage prediction = predictions[_user];
        if (prediction.timestamp == 0) {
            revert PredictionNotAvailable(_user);
        }

        prediction.probability = _probability;
        prediction.confidence = _confidence;
        prediction.daProof = _daProof;
        prediction.riskLevel = _calculateRiskLevel(_probability);

        daProofs[_daProof] = true;

        emit LiquidationRiskPredicted(
            _user,
            _probability,
            prediction.riskLevel,
            _confidence,
            _daProof
        );
    }

    /**
     * @notice 获取用户最新预测
     * @param _user 用户地址
     * @return prediction 清算预测结构体
     */
    function getPrediction(address _user) external view returns (LiquidationPrediction memory prediction) {
        prediction = predictions[_user];
        if (prediction.timestamp == 0) {
            revert PredictionNotAvailable(_user);
        }
        return prediction;
    }

    /**
     * @notice 更新清算阈值
     * @dev 仅合约所有者可调用
     * @param _newThreshold 新的清算阈值 (0-10000)
     */
    function updateThreshold(uint256 _newThreshold) external onlyOwner {
        if (_newThreshold > PROBABILITY_PRECISION) {
            revert InvalidHealthFactor(_newThreshold);
        }

        uint256 oldThreshold = liquidationThreshold;
        liquidationThreshold = _newThreshold;

        emit ThresholdUpdated(oldThreshold, _newThreshold);
    }

    /**
     * @notice 验证 DA 证明
     * @param _daProof DA 证明哈希
     * @return isValid 证明是否有效
     */
    function verifyDAProof(bytes32 _daProof) external view returns (bool isValid) {
        return daProofs[_daProof];
    }

    // ============ 内部函数 ============

    /**
     * @notice 计算基础清算概率
     * @dev 根据健康因子和债务情况计算清算概率
     * @param _healthFactor 健康因子
     * @param _totalDebt 总债务
     * @param _totalCollateral 总抵押品
     * @return probability 清算概率 (0-10000)
     */
    function _calculateBasicProbability(
        uint256 _healthFactor,
        uint256 _totalDebt,
        uint256 _totalCollateral
    ) internal view returns (uint256 probability) {
        if (_totalDebt == 0) {
            return 0;
        }

        uint256 threshold = liquidationThreshold;

        if (_healthFactor >= 2e18) {
            uint256 excess = _healthFactor - 2e18;
            probability = threshold * excess / (2e18);
            if (probability > threshold) {
                probability = threshold;
            }
        } else if (_healthFactor >= 1e18) {
            uint256 deficit = 2e18 - _healthFactor;
            probability = threshold + (threshold * deficit / (1e18));
            if (probability > PROBABILITY_PRECISION) {
                probability = PROBABILITY_PRECISION;
            }
        } else {
            probability = PROBABILITY_PRECISION;
        }

        uint256 debtRatio = (_totalDebt * PROBABILITY_PRECISION) / (_totalCollateral + 1);
        if (debtRatio > PROBABILITY_PRECISION) {
            debtRatio = PROBABILITY_PRECISION;
        }
        probability = (probability * (PROBABILITY_PRECISION + debtRatio)) / (2 * PROBABILITY_PRECISION);

        return probability;
    }

    /**
     * @notice 从概率计算风险等级
     * @dev 根据清算概率返回对应的风险等级
     * @param _probability 清算概率 (0-10000)
     * @return riskLevel 风险等级
     */
    function _calculateRiskLevel(uint256 _probability) internal view returns (uint256 riskLevel) {
        uint256 threshold = liquidationThreshold;

        if (_probability >= threshold * 8 / 10) {
            return RISK_LEVEL_CRITICAL;
        } else if (_probability >= threshold * 5 / 10) {
            return RISK_LEVEL_HIGH;
        } else if (_probability >= threshold * 2 / 10) {
            return RISK_LEVEL_MEDIUM;
        } else {
            return RISK_LEVEL_LOW;
        }
    }

    /**
     * @notice 计算置信度
     * @dev 根据健康因子和债务金额计算预测置信度
     * @param _healthFactor 健康因子
     * @param _totalDebt 总债务
     * @return confidence 置信度 (0-100)
     */
    function _calculateConfidence(
        uint256 _healthFactor,
        uint256 _totalDebt
    ) internal pure returns (uint256 confidence) {
        confidence = 50;

        if (_healthFactor > 0) {
            if (_healthFactor >= 2e18) {
                confidence += 30;
            } else if (_healthFactor >= 1.5e18) {
                confidence += 20;
            } else if (_healthFactor >= 1e18) {
                confidence += 10;
            } else {
                confidence += 5;
            }
        }

        if (_totalDebt > 0) {
            if (_totalDebt > 1000000e18) {
                confidence += 10;
            } else if (_totalDebt > 100000e18) {
                confidence += 5;
            }
        }

        if (confidence > 100) {
            confidence = 100;
        }

        return confidence;
    }
}
