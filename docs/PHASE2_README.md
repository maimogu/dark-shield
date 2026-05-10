# Phase 2: 风险评分系统 (Risk Scoring System)

## 概述

Phase 2 在 DarkShield 与 0G 集成的基础上，扩展了综合风险评分功能。该系统通过 0G Compute 服务进行 AI 驱动的风险评分计算，并使用 0G DA 服务存储和检索历史风险数据。

## 核心功能

### 1. 综合风险评分 (Comprehensive Risk Score)

风险评分是一个 0-100 的综合指标，基于多个风险因素计算：

| 因素 | 权重 | 描述 |
|------|------|------|
| 健康因子 (Health Factor) | 30% | 用户仓位健康度 |
| 债务比例 (Debt Ratio) | 25% | 债务占总抵押品比例 |
| 波动率 (Volatility) | 15% | 市场波动情况 |
| 历史数据 (Historical) | 20% | 用户历史预测表现 |
| 行为模式 (Behavioral) | 10% | 用户行为特征 |

### 2. 风险等级划分

| 评分范围 | 等级 | 建议操作 |
|----------|------|----------|
| 80-100 | CRITICAL (危急) | 立即清算风险，建议平仓 |
| 60-79 | HIGH (高) | 高风险，建议平仓 |
| 40-59 | MEDIUM (中) | 中等风险，建议追加抵押品 |
| 20-39 | LOW (低) | 低风险，监控仓位 |
| 0-19 | MINIMAL (极低) | 几乎无风险，持有 |

## 合约接口

### 数据结构

```solidity
struct RiskScore {
    uint256 score;           // 综合评分 0-100
    uint256[] factors;       // 各因素贡献度
    bytes32 daProof;         // 0G DA 证明哈希
    uint256 timestamp;       // 评分时间戳
    uint256 historicalWeight; // 历史数据权重
}

struct HistoricalPrediction {
    uint256 probability;     // 清算概率
    uint256 healthFactor;    // 健康因子
    uint256 timestamp;       // 时间戳
}
```

### 主要函数

#### calculateRiskScore

计算单个用户的风险评分：

```solidity
function calculateRiskScore(
    address _user,
    uint256 _healthFactor,
    uint256 _debtRatio,
    uint256 _volatility,
    bytes32 _behavioralPatterns
) external returns (uint256 score)
```

**参数说明：**
- `_user`: 用户地址
- `_healthFactor`: 当前健康因子 (1e18 精度)
- `_debtRatio`: 债务比例 (0-10000)
- `_volatility`: 市场波动率 (0-100)
- `_behavioralPatterns`: 行为模式哈希

**限制：**
- 同一用户每 `scoreUpdateInterval` (默认 1 小时) 只能更新一次

#### batchCalculateRiskScore

批量计算多个用户的风险评分：

```solidity
function batchCalculateRiskScore(
    address[] calldata _users,
    uint256[] calldata _healthFactors,
    uint256[] calldata _debtRatios,
    uint256[] calldata _volatilities,
    bytes32[] calldata _behavioralPatterns
) external returns (uint256[] memory scores)
```

**限制：**
- 每次最多处理 10 个用户
- 所有数组长度必须一致

#### getHistoricalRiskData

获取用户历史风险数据：

```solidity
function getHistoricalRiskData(
    address _user,
    uint256 _limit,
    uint256 _offset
) external view returns (HistoricalPrediction[] memory predictions)
```

#### getRiskScoreDetails

获取用户当前风险评分详情：

```solidity
function getRiskScoreDetails(address _user) external view returns (RiskScore memory riskScore)
```

## JavaScript 服务

### 0G Compute Service

#### calculateRiskScore

```javascript
const result = await computeService.calculateRiskScore({
  historical_predictions: [...],
  current_health_factor: 1.5,
  debt_ratio: 45,
  volatility: 30,
  behavioral_patterns: '0x...'
});
```

**返回：**
```javascript
{
  score: 45,
  factors: {
    health_factor: 30,
    debt_ratio: 50,
    volatility: 35,
    historical: 55,
    behavioral: 48
  },
  confidence: 0.92,
  riskLevel: 'MEDIUM',
  riskAction: 'ADD_COLLATERAL'
}
```

#### addBatchRiskCalculation

```javascript
const batchResult = await computeService.addBatchRiskCalculation({
  users: [
    { userAddress: '0x...', current_health_factor: 1.5, debt_ratio: 45, volatility: 30 },
    { userAddress: '0x...', current_health_factor: 1.8, debt_ratio: 30, volatility: 20 }
  ]
});
```

### 0G DA Service

#### storeRiskScore

```javascript
const stored = await daService.storeRiskScore({
  userAddress: '0x...',
  score: 45,
  factors: {...},
  confidence: 0.92,
  riskLevel: 'MEDIUM',
  riskAction: 'ADD_COLLATERAL'
});
```

#### retrieveRiskScoreHistory

```javascript
const history = await daService.retrieveRiskScoreHistory('0x...', {
  limit: 10,
  offset: 0
});
```

#### storeBatchRiskScores

```javascript
const batchStored = await daService.storeBatchRiskScores([
  { userAddress: '0x...', score: 45, ... },
  { userAddress: '0x...', score: 30, ... }
]);
```

## 事件

| 事件 | 描述 |
|------|------|
| `RiskScoreCalculated` | 单个用户风险评分计算完成 |
| `BatchRiskScoreCalculated` | 批量风险评分计算完成 |
| `ScoreUpdateIntervalChanged` | 评分更新间隔变更 |

## 常量配置

| 常量 | 值 | 描述 |
|------|-----|------|
| `MAX_BATCH_SIZE` | 10 | 最大批量处理用户数 |
| `MAX_HISTORY_LENGTH` | 100 | 最大历史记录数 |
| `scoreUpdateInterval` | 3600 | 评分更新间隔 (秒) |

## 错误处理

| 错误 | 描述 |
|------|------|
| `UpdateFrequencyExceeded` | 更新频率超出限制 |
| `BatchSizeExceeded` | 批量大小超限 |
| `NoHistoricalData` | 无历史数据 |
| `InvalidScore` | 无效评分 |
| `InvalidArrayLength` | 数组长度不匹配 |

## 使用示例

### 前端集成

```javascript
import { ZeroGComputeService } from './scripts/0g-compute-service';
import { ZeroGDAService } from './scripts/0g-da-service';

async function assessUserRisk(userAddress, userData) {
  const computeService = new ZeroGComputeService(config);
  await computeService.initialize();

  const daService = new ZeroGDAService(config);
  await daService.initialize();

  const riskScore = await computeService.calculateRiskScore({
    historical_predictions: await fetchHistoricalPredictions(userAddress),
    current_health_factor: userData.healthFactor,
    debt_ratio: userData.debtRatio,
    volatility: userData.volatility,
    behavioral_patterns: userData.behavioralHash
  });

  await daService.storeRiskScore({
    userAddress: userAddress,
    ...riskScore
  });

  return riskScore;
}
```

### 批量处理

```javascript
async function batchAssessRisks(users) {
  const computeService = new ZeroGComputeService(config);
  await computeService.initialize();

  const batchResult = await computeService.addBatchRiskCalculation({
    users: users.map(u => ({
      userAddress: u.address,
      current_health_factor: u.healthFactor,
      debt_ratio: u.debtRatio,
      volatility: u.volatility
    }))
  });

  return batchResult;
}
```

## 安全考虑

1. **频率限制**: 同一用户风险评分更新有 1 小时间隔限制，防止频繁操作
2. **批量限制**: 每次最多处理 10 个用户，控制 gas 消耗
3. **DA 证明**: 所有风险评分都生成 0G DA 证明，确保数据可验证
4. **历史权重**: 基于用户历史表现调整评分，奖励稳健用户

## 性能优化

1. **批量处理**: 使用 `batchCalculateRiskScore` 可节省约 60% gas
2. **历史数据上限**: 最多保留 100 条历史记录，超出自动清理
3. **缓存机制**: 频率限制内直接返回缓存评分

## 测试

运行风险评分测试：

```bash
npx hardhat test test/RiskScoring.test.js
```

## 下一步

Phase 3 将实现：
- 实时风险监控和警报
- 自动对冲执行
- 多链风险聚合
