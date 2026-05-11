# Phase 3: 对冲策略推荐系统

## 概述

Phase 3 在 Phase 2 的基础上，进一步扩展了 AI 驱动的对冲策略推荐功能。该系统通过 0G Compute 服务生成智能对冲策略，并利用 0G DA 服务确保策略数据的完整性和可追溯性。

## 核心组件

### 1. HedgeStrategyManager 合约

**文件**: `/workspace/contracts/contracts/HedgeStrategyManager.sol`

AI 驱动的对冲策略推荐管理器，负责：
- 生成和存储对冲策略推荐
- 验证策略执行结果
- 管理策略生命周期
- 完整的审计追踪

#### 主要功能

```solidity
// 请求对冲策略
function requestHedgeStrategy(
    uint256 _healthFactor,
    uint256 _totalDebt,
    uint256 _availableCollateral,
    bytes32 _daProof
) external returns (bytes32 strategyId);

// 获取推荐策略
function getRecommendedStrategy(address _user) 
    external view returns (HedgeStrategy memory strategy, bytes32 strategyId);

// 执行推荐策略
function executeRecommendedStrategy(address _user) 
    external returns (bool success);

// 验证策略执行
function verifyStrategyExecution(bytes32 _strategyId) 
    external view returns (bool isValid, ExecutionRecord memory record);
```

#### 数据结构

```solidity
struct HedgeStrategy {
    uint8 actionType;         // 1=增加抵押, 2=闪电贷对冲, 3=部分还款
    uint256 amount;           // 推荐金额
    address asset;             // 资产地址
    uint256 expectedOutcome;  // 预期结果 (健康因子改善)
    uint256 confidence;        // 推荐置信度
    bytes32 recommendationProof; // 推荐证明
    bytes32 executionProof;    // 执行证明
    bool executed;             // 是否已执行
    uint256 timestamp;
}
```

#### 常量配置

| 常量 | 值 | 说明 |
|------|-----|------|
| `ACTION_ADD_COLLATERAL` | 1 | 增加抵押操作类型 |
| `ACTION_FLASH_LOAN_HEDGE` | 2 | 闪电贷对冲操作类型 |
| `ACTION_PARTIAL_REPAY` | 3 | 部分还款操作类型 |
| `STRATEGY_VALIDITY_PERIOD` | 1 hour | 策略有效期 |
| `EXECUTION_COOLDOWN` | 15 minutes | 执行冷却期 |
| `MIN_CONFIDENCE_THRESHOLD` | 50 | 最小置信度阈值 |

### 2. HedgeStrategyExecutor 合约

**文件**: `/workspace/contracts/contracts/HedgeStrategyExecutor.sol`

对冲策略执行器，负责：
- 执行各种类型的对冲策略
- 与 Aave 协议交互
- 管理执行授权
- 追踪执行历史

#### 主要功能

```solidity
// 执行对冲策略
function executeHedgeStrategy(ExecutionParams calldata _params) 
    external returns (ExecutionResult memory result);

// 增加抵押
function addCollateral(
    address _user,
    uint256 _amount,
    address _asset
) external returns (bool success);

// 执行闪电贷对冲
function executeFlashLoanHedge(
    address _user,
    uint256 _amount,
    address _asset
) external returns (bool success);

// 部分还款
function partialRepay(
    address _user,
    uint256 _amount,
    address _asset
) external returns (bool success);

// 批量执行
function batchExecute(ExecutionParams[] calldata _paramsArray)
    external returns (ExecutionResult[] memory results);
```

### 3. 0G Compute Service 增强

**文件**: `/workspace/contracts/scripts/0g-compute-service.js`

#### 新增方法

```javascript
// 生成对冲策略推荐
async generateHedgeStrategy(inputData) {
    // 输入参数
    // - user_portfolio: 用户投资组合
    // - current_health_factor: 当前健康因子
    // - market_conditions: 市场状况
    // - risk_tolerance: 风险承受能力
    // - historical_success: 历史成功率
    
    // 返回值
    // - recommended_action: 推荐操作类型
    // - amount: 推荐金额
    // - asset: 推荐资产
    // - expected_improvement: 预期改善
    // - confidence: 置信度
    // - reasoning: 推荐理由
}

// 模拟策略执行结果
async simulateStrategyOutcome(inputData) {
    // 输入参数
    // - strategy: 策略对象
    // - current_health_factor: 当前健康因子
    // - market_conditions: 市场状况
    // - scenarios: 模拟场景数组
    
    // 返回值
    // - scenarios: 多场景分析结果
    // - summary: 汇总信息
    // - overallRecommendation: 整体推荐
}
```

### 4. 0G DA Service 增强

**文件**: `/workspace/contracts/scripts/0g-da-service.js`

#### 新增方法

```javascript
// 存储策略推荐
async storeHedgeStrategy(strategyData) {
    // 存储完整的策略推荐数据到 0G DA 层
}

// 存储执行结果
async storeStrategyExecution(executionData) {
    // 存储策略执行结果
}

// 检索策略历史
async retrieveStrategyHistory(userAddress, options) {
    // 检索用户策略历史记录
}

// 分析策略性能
async analyzeStrategyPerformance(userAddress) {
    // 分析策略执行效果
    // 返回: 成功率、平均改善度等指标
}
```

### 5. HedgeStrategyRecommender 脚本

**文件**: `/workspace/contracts/scripts/hedge-strategy-recommender.js`

策略推荐主脚本，提供：
- 端到端的策略推荐流程
- 策略展示界面
- 执行结果追踪
- 性能分析

```javascript
const recommender = new HedgeStrategyRecommender(config);
await recommender.initialize();

// 生成推荐
const recommendation = await recommender.generateRecommendation(userData);
recommender.displayRecommendation(recommendation);

// 执行策略
const execution = await recommender.executeStrategy(recommendation, wallet);

// 查看历史和性能分析
const history = await recommender.getStrategyHistory(userAddress);
const performance = await recommender.analyzePerformance(userAddress);
```

## 使用流程

### 1. 初始化推荐系统

```javascript
const { HedgeStrategyRecommender } = require('./hedge-strategy-recommender');

const recommender = new HedgeStrategyRecommender({
    rpcUrl: 'https://evmrpc-testnet.0g.ai',
    privateKey: process.env.DEPLOYER_KEY,
    autoStoreToDA: true,
    autoSimulate: true
});

await recommender.initialize();
```

### 2. 生成策略推荐

```javascript
const userData = {
    userAddress: '0x...',
    healthFactor: 1.25,
    totalDebt: 5000,
    totalCollateral: 10000,
    marketConditions: {
        volatility: 35,
        liquidity: 'medium',
        trend: 'neutral'
    },
    riskTolerance: 'medium'
};

const recommendation = await recommender.generateRecommendation(userData);
recommender.displayRecommendation(recommendation);
```

### 3. 执行策略

```javascript
const execution = await recommender.executeStrategy(recommendation, executorWallet);
console.log('执行结果:', execution);
```

### 4. 监控和优化

```javascript
// 获取历史
const history = await recommender.getStrategyHistory(userAddress);

// 分析性能
const performance = await recommender.analyzePerformance(userAddress);
console.log('性能分析:', performance);

// 健康检查
const health = await recommender.healthCheck();
```

## 策略类型详解

### 增加抵押 (ADD_COLLATERAL)

适用于：
- 健康因子低于 1.5
- 市场波动性较高
- 用户有额外资金

预期效果：
- 健康因子提升 10-20%
- 执行成本低
- 风险最小

### 闪电贷对冲 (FLASH_LOAN_HEDGE)

适用于：
- 需要快速调整仓位
- 用户无额外资金
- 市场机会窗口

预期效果：
- 健康因子提升 5-15%
- 无需前期资本
- 包含闪电贷费用

### 部分还款 (PARTIAL_REPAY)

适用于：
- 健康因子低于 1.1
- 紧急降低清算风险
- 用户有可用资金

预期效果：
- 健康因子提升 15-30%
- 最直接的清算风险降低
- 需要资金支出

## 模拟场景

系统支持多场景模拟：

| 场景 | 波动性 | 趋势 | 风险因子 |
|------|--------|------|----------|
| `base` | 1.0x | 中性 | 0.15 |
| `bullish` | 0.7x | 看涨 | 0.10 |
| `bearish` | 1.3x | 看跌 | 0.30 |
| `high_volatility` | 1.5x | 中性 | 0.25 |

## 安全特性

1. **冷却期控制**: 策略请求和执行都有冷却期限制
2. **置信度验证**: 低于阈值的策略不会执行
3. **有效期管理**: 过期策略自动失效
4. **执行授权**: 只有授权的执行者可以执行策略
5. **DA 存储**: 所有数据存储在 0G DA 层确保可验证性

## 测试

运行测试：

```bash
cd /workspace/contracts
npx hardhat test test/HedgeStrategy.test.js
```

测试覆盖：
- 策略请求和生成
- 策略执行和验证
- 冷却期控制
- 历史记录管理
- DA 存储功能

## 合约部署

### 部署脚本

```javascript
// scripts/deploy-hedge-strategy.js
const { ethers } = require('hardhat');

async function main() {
    const [deployer] = await ethers.getSigners();
    
    // 部署 HedgeStrategyManager
    const HedgeStrategyManager = await ethers.getContractFactory('HedgeStrategyManager');
    const hedgeStrategyManager = await HedgeStrategyManager.deploy(
        deployer.address,
        ogIntegrationAddress
    );
    
    // 部署 HedgeStrategyExecutor
    const HedgeStrategyExecutor = await ethers.getContractFactory('HedgeStrategyExecutor');
    const hedgeStrategyExecutor = await HedgeStrategyExecutor.deploy(
        deployer.address,
        await hedgeStrategyManager.getAddress(),
        ogIntegrationAddress,
        aavePoolAddress,
        wethAddress
    );
    
    console.log('HedgeStrategyManager:', await hedgeStrategyManager.getAddress());
    console.log('HedgeStrategyExecutor:', await hedgeStrategyExecutor.getAddress());
}
```

## 性能指标

系统性能分析包括：

- **成功率**: 策略执行成功比例
- **改善准确度**: 实际改善与预期的比率
- **最常用策略**: 用户最常使用的策略类型
- **平均改善度**: 健康因子的平均提升幅度

## 与 Phase 2 的集成

Phase 3 完全兼容 Phase 2 的功能：

1. **风险评分**: 使用 Phase 2 的风险评分结果
2. **预测数据**: 利用 Phase 2 的清算预测
3. **DA 存储**: 与 Phase 2 的 DA 服务共享数据
4. **合约交互**: 与现有 RiskHedgeExecutor 协同工作

## 故障排除

### 常见问题

1. **策略请求失败**
   - 检查冷却期是否已过
   - 确认用户余额充足

2. **执行失败**
   - 验证执行者是否已授权
   - 检查策略是否过期
   - 确认置信度是否满足要求

3. **DA 存储问题**
   - 检查网络连接
   - 确认 RPC URL 正确

## 相关文档

- [Phase 2 文档](../docs/PHASE2_README.md) - 风险评分和清算预测
- [0G 集成指南](../docs/0G_INTEGRATION_README.md) - 0G 服务集成说明
- [API 参考](../docs/API_REFERENCE.md) - 完整 API 文档
- [架构文档](../docs/ARCHITECTURE.md) - 系统架构设计

## License

MIT
