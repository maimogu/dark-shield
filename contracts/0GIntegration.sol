// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

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

    /**
     * @notice 风险评分结构体
     * @param score 综合评分 (0-100)
     * @param factors 各个风险因素贡献度
     * @param daProof 0G DA 证明哈希
     * @param timestamp 评分时间戳
     * @param historicalWeight 历史数据权重
     */
    struct RiskScore {
        uint256 score;
        uint256[] factors;
        bytes32 daProof;
        uint256 timestamp;
        uint256 historicalWeight;
    }

    /**
     * @notice 历史预测记录结构体
     * @param probability 清算概率
     * @param healthFactor 健康因子
     * @param timestamp 时间戳
     */
    struct HistoricalPrediction {
        uint256 probability;
        uint256 healthFactor;
        uint256 timestamp;
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

    /// @notice 最大批量处理用户数
    uint256 public constant MAX_BATCH_SIZE = 10;

    /// @notice 评分更新间隔 (秒, 默认 1 小时)
    uint256 public scoreUpdateInterval = 3600;

    // ============ 状态变量 ============

    /// @notice 清算阈值 (0-10000, 默认 5000 = 50%)
    uint256 public liquidationThreshold;

    /// @notice 用户清算预测映射
    mapping(address => LiquidationPrediction) public predictions;

    /// @notice 用户最后请求映射
    mapping(address => PredictionRequest) public lastRequests;

    /// @notice 0G DA 证明存储
    mapping(bytes32 => bool) public daProofs;

    /// @notice 用户风险评分映射
    mapping(address => RiskScore) public riskScores;

    /// @notice 用户最后评分更新时间
    mapping(address => uint256) public lastScoreUpdate;

    /// @notice 用户历史预测记录
    mapping(address => HistoricalPrediction[]) public historicalPredictions;

    /// @notice 用户历史预测数量上限
    uint256 public constant MAX_HISTORY_LENGTH = 100;

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

    /// @notice 风险评分计算事件
    event RiskScoreCalculated(
        address indexed user,
        uint256 score,
        bytes32 daProof
    );

    /// @notice 批量风险评分计算事件
    event BatchRiskScoreCalculated(
        uint256 count
    );

    /// @notice 评分更新间隔变更事件
    event ScoreUpdateIntervalChanged(
        uint256 oldInterval,
        uint256 newInterval
    );

    // ============ 错误 ============

    /// @notice 无效的健康因子错误
    error InvalidHealthFactor(uint256 healthFactor);

    /// @notice 预测不可用错误
    error PredictionNotAvailable(address user);

    /// @notice 零健康因子错误
    error ZeroHealthFactor();

    /// @notice 更新频率限制错误
    error UpdateFrequencyExceeded(address user);

    /// @notice 批量大小超限错误
    error BatchSizeExceeded(uint256 requested, uint256 max);

    /// @notice 无历史数据错误
    error NoHistoricalData(address user);

    /// @notice 无效评分错误
    error InvalidScore(uint256 score);

    /// @notice 数组长度不匹配错误
    error InvalidArrayLength();

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

    // ============ 内部辅助函数 ============

    function _calculateHistoricalWeight(HistoricalPrediction[] storage _history) internal view returns (uint256 weight) {
        if (_history.length == 0) {
            return 0;
        }

        uint256 recencyScore = 0;
        uint256 stabilityScore = 0;

        uint256 timeRange = _history[_history.length - 1].timestamp - _history[0].timestamp;
        if (timeRange > 0) {
            recencyScore = Math.min(50, _history.length * 5);
        } else {
            recencyScore = 50;
        }

        if (_history.length >= 3) {
            uint256 variance = 0;
            for (uint256 i = 1; i < _history.length; i++) {
                uint256 diff = _history[i].healthFactor > _history[i-1].healthFactor
                    ? _history[i].healthFactor - _history[i-1].healthFactor
                    : _history[i-1].healthFactor - _history[i].healthFactor;
                variance += diff;
            }
            stabilityScore = Math.min(50, uint256(100) - (variance / _history.length / 1e16));
        } else {
            stabilityScore = 25;
        }

        return recencyScore + stabilityScore;
    }

    function _calculateHealthFactorScore(uint256 _healthFactor) internal pure returns (uint256 score) {
        if (_healthFactor >= 2e18) {
            return 10;
        } else if (_healthFactor >= 1.5e18) {
            return 30;
        } else if (_healthFactor >= 1.2e18) {
            return 50;
        } else if (_healthFactor >= 1e18) {
            return 70;
        } else {
            return 95;
        }
    }

    function _calculateDebtRatioScore(uint256 _debtRatio) internal pure returns (uint256 score) {
        if (_debtRatio <= 2000) {
            return 10;
        } else if (_debtRatio <= 4000) {
            return 30;
        } else if (_debtRatio <= 6000) {
            return 50;
        } else if (_debtRatio <= 8000) {
            return 75;
        } else {
            return 95;
        }
    }

    function _calculateVolatilityScore(uint256 _volatility) internal pure returns (uint256 score) {
        return Math.min(100, _volatility);
    }

    function _calculateHistoricalScore(HistoricalPrediction[] storage _history) internal view returns (uint256 score) {
        if (_history.length == 0) {
            return 50;
        }

        uint256 avgProbability = 0;
        for (uint256 i = 0; i < _history.length; i++) {
            avgProbability += _history[i].probability;
        }
        avgProbability = avgProbability / _history.length;

        if (avgProbability <= 2000) {
            return 20;
        } else if (avgProbability <= 4000) {
            return 40;
        } else if (avgProbability <= 6000) {
            return 60;
        } else if (avgProbability <= 8000) {
            return 80;
        } else {
            return 95;
        }
    }

    function _computeWeightedScore(uint256[] memory _factors, uint256 _historicalWeight) internal pure returns (uint256 score) {
        uint256[] memory weights = new uint256[](5);
        weights[0] = 30;
        weights[1] = 25;
        weights[2] = 15;
        weights[3] = 20;
        weights[4] = 10;

        uint256 baseScore = 0;
        uint256 totalWeight = 0;

        for (uint256 i = 0; i < _factors.length; i++) {
            baseScore += _factors[i] * weights[i];
            totalWeight += weights[i];
        }

        score = baseScore / totalWeight;

        uint256 historicalAdjustment = 0;
        if (_historicalWeight > 50) {
            historicalAdjustment = (_historicalWeight - 50) / 5;
            score = score > historicalAdjustment ? score - historicalAdjustment : 0;
        }

        return score;
    }

    /**
     * @notice 计算用户风险评分
     * @dev 获取用户历史预测数据，调用 0G Compute 进行综合评分
     * @param _user 用户地址
     * @param _healthFactor 当前健康因子 (1e18 精度)
     * @param _debtRatio 当前债务比例 (0-10000)
     * @param _volatility 市场波动率 (0-100)
     * @param _behavioralPatterns 行为模式哈希
     * @return score 综合风险评分 (0-100)
     */
    function calculateRiskScore(
        address _user,
        uint256 _healthFactor,
        uint256 _debtRatio,
        uint256 _volatility,
        bytes32 _behavioralPatterns
    ) public returns (uint256 score) {
        if (block.timestamp - lastScoreUpdate[_user] < scoreUpdateInterval && lastScoreUpdate[_user] != 0) {
            revert UpdateFrequencyExceeded(_user);
        }

        HistoricalPrediction[] storage history = historicalPredictions[_user];
        uint256 historicalWeight = _calculateHistoricalWeight(history);

        uint256[] memory factors = new uint256[](5);
        factors[0] = _calculateHealthFactorScore(_healthFactor);
        factors[1] = _calculateDebtRatioScore(_debtRatio);
        factors[2] = _calculateVolatilityScore(_volatility);
        factors[3] = _calculateHistoricalScore(history);
        factors[4] = uint256(keccak256(abi.encode(_behavioralPatterns))) % 100;

        score = _computeWeightedScore(factors, historicalWeight);

        if (score > 100) {
            score = 100;
        }

        bytes32 daProof = keccak256(abi.encode(_user, score, factors, block.timestamp));

        uint256[] memory storedFactors = new uint256[](factors.length);
        for (uint256 i = 0; i < factors.length; i++) {
            storedFactors[i] = factors[i];
        }

        riskScores[_user] = RiskScore({
            score: score,
            factors: storedFactors,
            daProof: daProof,
            timestamp: block.timestamp,
            historicalWeight: historicalWeight
        });

        lastScoreUpdate[_user] = block.timestamp;
        daProofs[daProof] = true;

        if (history.length >= MAX_HISTORY_LENGTH) {
            delete historicalPredictions[_user];
        }
        historicalPredictions[_user].push(HistoricalPrediction({
            probability: _debtRatio,
            healthFactor: _healthFactor,
            timestamp: block.timestamp
        }));

        emit RiskScoreCalculated(_user, score, daProof);

        return score;
    }

    /**
     * @notice 批量计算风险评分
     * @dev 批量处理多个用户的风险评分，每次最多处理 10 个
     * @param _users 用户地址数组
     * @param _healthFactors 健康因子数组
     * @param _debtRatios 债务比例数组
     * @param _volatilities 波动率数组
     * @param _behavioralPatterns 行为模式哈希数组
     * @return scores 风险评分数组
     */
    function batchCalculateRiskScore(
        address[] calldata _users,
        uint256[] calldata _healthFactors,
        uint256[] calldata _debtRatios,
        uint256[] calldata _volatilities,
        bytes32[] calldata _behavioralPatterns
    ) external returns (uint256[] memory scores) {
        if (_users.length > MAX_BATCH_SIZE) {
            revert BatchSizeExceeded(_users.length, MAX_BATCH_SIZE);
        }

        if (_users.length != _healthFactors.length ||
            _users.length != _debtRatios.length ||
            _users.length != _volatilities.length ||
            _users.length != _behavioralPatterns.length) {
            revert InvalidArrayLength();
        }

        scores = new uint256[](_users.length);

        for (uint256 i = 0; i < _users.length; i++) {
            if (block.timestamp - lastScoreUpdate[_users[i]] >= scoreUpdateInterval || lastScoreUpdate[_users[i]] == 0) {
                scores[i] = calculateRiskScore(
                    _users[i],
                    _healthFactors[i],
                    _debtRatios[i],
                    _volatilities[i],
                    _behavioralPatterns[i]
                );
            } else {
                scores[i] = riskScores[_users[i]].score;
            }
        }

        emit BatchRiskScoreCalculated(_users.length);

        return scores;
    }

    /**
     * @notice 获取用户历史风险数据
     * @dev 从本地存储读取用户历史预测记录
     * @param _user 用户地址
     * @param _limit 返回记录数量限制
     * @param _offset 起始偏移量
     * @return historicalData 历史预测数组
     */
    function getHistoricalRiskData(
        address _user,
        uint256 _limit,
        uint256 _offset
    ) external view returns (HistoricalPrediction[] memory historicalData) {
        HistoricalPrediction[] storage history = historicalPredictions[_user];

        if (history.length == 0) {
            revert NoHistoricalData(_user);
        }

        uint256 actualLimit = _limit;
        if (_offset >= history.length) {
            return new HistoricalPrediction[](0);
        }
        if (_offset + _limit > history.length) {
            actualLimit = history.length - _offset;
        }

        historicalData = new HistoricalPrediction[](actualLimit);
        for (uint256 i = 0; i < actualLimit; i++) {
            historicalData[i] = history[_offset + i];
        }

        return historicalData;
    }

    /**
     * @notice 获取用户当前风险评分详情
     * @param _user 用户地址
     * @return riskScore 风险评分结构体
     */
    function getRiskScoreDetails(address _user) external view returns (RiskScore memory riskScore) {
        riskScore = riskScores[_user];
        if (riskScore.timestamp == 0) {
            revert PredictionNotAvailable(_user);
        }
        return riskScore;
    }

    /**
     * @notice 更新评分更新间隔
     * @dev 仅合约所有者可调用
     * @param _newInterval 新的更新间隔 (秒)
     */
    function updateScoreUpdateInterval(uint256 _newInterval) external onlyOwner {
        uint256 oldInterval = scoreUpdateInterval;
        scoreUpdateInterval = _newInterval;
        emit ScoreUpdateIntervalChanged(oldInterval, _newInterval);
    }

    /**
     * @notice 验证风险评分证明
     * @param _user 用户地址
     * @return isValid 评分是否有效
     */
    function verifyRiskScoreProof(address _user) external view returns (bool isValid) {
        RiskScore memory rs = riskScores[_user];
        if (rs.timestamp == 0) {
            return false;
        }
        bytes32 computedProof = keccak256(abi.encode(_user, rs.score, rs.factors, rs.timestamp));
        return rs.daProof == computedProof || daProofs[rs.daProof];
    }

    /**
     * @notice 记录预测到历史数据
     * @dev 当有新预测时自动调用
     * @param _user 用户地址
     * @param _probability 清算概率
     * @param _healthFactor 健康因子
     */
    function recordPrediction(address _user, uint256 _probability, uint256 _healthFactor) external {
        HistoricalPrediction[] storage history = historicalPredictions[_user];

        if (history.length >= MAX_HISTORY_LENGTH) {
            delete historicalPredictions[_user];
        }

        historicalPredictions[_user].push(HistoricalPrediction({
            probability: _probability,
            healthFactor: _healthFactor,
            timestamp: block.timestamp
        }));
    }

    /**
     * @notice 获取历史预测数量
     * @param _user 用户地址
     * @return count 历史记录数量
     */
    function getHistoricalPredictionCount(address _user) external view returns (uint256 count) {
        return historicalPredictions[_user].length;
    }

    /**
     * @notice 验证 DA 证明
     * @param _daProof DA 证明哈希
     * @return isValid 证明是否有效
     */
    function verifyDAProof(bytes32 _daProof) external view returns (bool isValid) {
        return daProofs[_daProof];
    }

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
