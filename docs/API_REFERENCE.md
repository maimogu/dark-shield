# DarkShield API 参考文档

本文档提供 DarkShield 智能合约的完整 API 参考。

---

## 0GIntegration.sol

0G 服务桥接合约，处理清算风险预测请求和 0G DA 证明存储。

**合约地址**: [0GIntegration.sol](file:///workspace/contracts/0GIntegration.sol)
**接口定义**: [interfaces/I0GIntegration.sol](file:///workspace/contracts/interfaces/I0GIntegration.sol)

### 数据结构

#### LiquidationPrediction

清算预测结果结构体。

```solidity
struct LiquidationPrediction {
    uint256 probability;    // 清算概率 (0-10000, 0.00% - 100.00%)
    uint256 riskLevel;      // 风险等级 (LOW=0, MEDIUM=1, HIGH=2, CRITICAL=3)
    uint256 confidence;     // 置信度 (0-100)
    bytes32 daProof;        // 0G DA 证明哈希
    uint256 timestamp;      // 预测时间戳
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| probability | uint256 | 清算概率，精度为 10000，5000 表示 50% |
| riskLevel | uint256 | 风险等级：0=低，1=中，2=高，3=危急 |
| confidence | uint256 | 预测置信度，范围 0-100 |
| daProof | bytes32 | 0G DA 证明哈希，用于验证预测数据 |
| timestamp | uint256 | 预测生成的时间戳 |

#### PredictionRequest

预测请求结构体。

```solidity
struct PredictionRequest {
    uint256 healthFactor;     // 健康因子 (1e18 精度)
    uint256 totalDebt;        // 总债务 (1e18 精度)
    uint256 totalCollateral;  // 总抵押品 (1e18 精度)
    address user;             // 用户地址
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| healthFactor | uint256 | Aave 健康因子，如 1.5e18 表示 1.5 |
| totalDebt | uint256 | 用户总债务金额（wei） |
| totalCollateral | uint256 | 用户总抵押品金额（wei） |
| user | address | 用户以太坊地址 |

### 常量

| 常量名 | 值 | 说明 |
|--------|-----|------|
| RISK_LEVEL_LOW | 0 | 低风险等级 |
| RISK_LEVEL_MEDIUM | 1 | 中风险等级 |
| RISK_LEVEL_HIGH | 2 | 高风险等级 |
| RISK_LEVEL_CRITICAL | 3 | 危急风险等级 |
| PROBABILITY_PRECISION | 10000 | 概率精度基数 |
| DEFAULT_LIQUIDATION_THRESHOLD | 5000 | 默认清算阈值（50%） |

### 状态变量

| 变量名 | 类型 | 说明 |
|--------|------|------|
| liquidationThreshold | uint256 | 当前清算阈值 (0-10000) |
| predictions | mapping(address => LiquidationPrediction) | 用户预测结果映射 |
| lastRequests | mapping(address => PredictionRequest) | 用户最后请求映射 |
| daProofs | mapping(bytes32 => bool) | DA 证明存储映射 |

### 函数

#### requestPrediction

请求清算风险预测。

```solidity
function requestPrediction(
    uint256 _healthFactor,
    uint256 _totalDebt,
    uint256 _totalCollateral
) external nonReentrant returns (void)
```

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| _healthFactor | uint256 | 健康因子 (1e18 精度) |
| _totalDebt | uint256 | 总债务 (1e18 精度) |
| _totalCollateral | uint256 | 总抵押品 (1e18 精度) |

**要求**:
- `_healthFactor` 不能为 0

**事件**: 触发 `LiquidationRiskPredicted` 事件

**示例**:

```solidity
// 请求预测
integration.requestPrediction(
    1500000000000000000,  // 健康因子 1.5
    1000000000000000000,  // 债务 1 ETH
    2000000000000000000   // 抵押品 2 ETH
);
```

#### updatePredictionWithProof

使用 0G DA 证明更新预测结果。

```solidity
function updatePredictionWithProof(
    address _user,
    uint256 _probability,
    uint256 _confidence,
    bytes32 _daProof
) external onlyOwner returns (void)
```

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| _user | address | 用户地址 |
| _probability | uint256 | 清算概率 (0-10000) |
| _confidence | uint256 | 置信度 (0-100) |
| _daProof | bytes32 | 0G DA 证明哈希 |

**要求**:
- 仅合约所有者可调用
- `_probability` <= 10000
- 用户必须有已存在的预测记录

**事件**: 触发 `LiquidationRiskPredicted` 事件

**示例**:

```solidity
// 更新带证明的预测
integration.updatePredictionWithProof(
    userAddress,
    3500,                                    // 35% 清算概率
    85,                                      // 85% 置信度
    0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef  // DA 证明
);
```

#### getPrediction

获取用户最新预测结果。

```solidity
function getPrediction(address _user)
    external
    view
    returns (LiquidationPrediction memory prediction)
```

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| _user | address | 用户地址 |

**返回值**: `LiquidationPrediction` 结构体

**要求**: 用户必须有已存在的预测记录

**示例**:

```solidity
I0GIntegration.LiquidationPrediction memory pred = integration.getPrediction(userAddress);
console.log("清算概率:", pred.probability / 100, "%");
console.log("风险等级:", pred.riskLevel);
console.log("置信度:", pred.confidence, "%");
```

#### updateThreshold

更新清算阈值。

```solidity
function updateThreshold(uint256 _newThreshold) external onlyOwner returns (void)
```

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| _newThreshold | uint256 | 新的清算阈值 (0-10000) |

**要求**:
- 仅合约所有者可调用
- `_newThreshold` <= 10000

**事件**: 触发 `ThresholdUpdated` 事件

**示例**:

```solidity
// 将清算阈值更新为 60%
integration.updateThreshold(6000);
```

#### verifyDAProof

验证 DA 证明是否有效。

```solidity
function verifyDAProof(bytes32 _daProof) external view returns (bool isValid)
```

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| _daProof | bytes32 | DA 证明哈希 |

**返回值**: `bool` - 证明是否有效

**示例**:

```solidity
bool isValid = integration.verifyDAProof(proofHash);
require(isValid, "Invalid DA proof");
```

### 事件

#### LiquidationRiskPredicted

清算风险预测事件。

```solidity
event LiquidationRiskPredicted(
    address indexed user,
    uint256 probability,
    uint256 riskLevel,
    uint256 confidence,
    bytes32 daProof
);
```

| 参数 | 类型 | 说明 |
|------|------|------|
| user | address (indexed) | 用户地址 |
| probability | uint256 | 清算概率 |
| riskLevel | uint256 | 风险等级 |
| confidence | uint256 | 置信度 |
| daProof | bytes32 | DA 证明哈希 |

#### ThresholdUpdated

阈值更新事件。

```solidity
event ThresholdUpdated(
    uint256 oldThreshold,
    uint256 newThreshold
);
```

| 参数 | 类型 | 说明 |
|------|------|------|
| oldThreshold | uint256 | 旧阈值 |
| newThreshold | uint256 | 新阈值 |

### 错误代码

| 错误名 | 说明 |
|--------|------|
| `InvalidHealthFactor(uint256)` | 健康因子参数无效（概率超限） |
| `PredictionNotAvailable(address)` | 用户预测记录不存在 |
| `ZeroHealthFactor()` | 健康因子为零 |

---

## RiskHedgeExecutor.sol

风险对冲执行器合约，支持自动对冲和 TEE 验证。

**合约地址**: [RiskHedgeExecutor.sol](file:///workspace/contracts/RiskHedgeExecutor.sol)

### 数据结构

#### UserConfig

用户配置结构体。

```solidity
struct UserConfig {
    bool enabled;           // 是否启用风险对冲服务
    uint256 maxHedgeAmount; // 最大对冲金额
    uint256 cooldownPeriod; // 冷却时间（秒）
    bool autoExecute;       // 是否自动执行
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| enabled | bool | 是否启用服务 |
| maxHedgeAmount | uint256 | 最大对冲金额（wei） |
| cooldownPeriod | uint256 | 操作冷却期（秒） |
| autoExecute | bool | 是否启用自动执行 |

### 常量

| 常量名 | 值 | 说明 |
|--------|-----|------|
| AUTO_EXECUTE_RISK_THRESHOLD | 50 | 自动执行最低风险评分阈值 |
| SEVERITY_LOW | "LOW" | 低风险 |
| SEVERITY_MEDIUM | "MEDIUM" | 中风险 |
| SEVERITY_HIGH | "HIGH" | 高风险 |
| SEVERITY_CRITICAL | "CRITICAL" | 危急风险 |
| AI_CONFIDENCE_THRESHOLD | 70 | AI 预测置信度阈值 |

### 状态变量

| 变量名 | 类型 | 说明 |
|--------|------|------|
| aavePool | IAavePool (immutable) | Aave V3 Pool 地址 |
| weth | IWETH (immutable) | WETH 地址 |
| usdc | address (immutable) | USDC 地址 |
| teeVerifier | address | TEE 验证器地址 |
| zeroGIntegration | address | 0G Integration 地址 |
| userConfigs | mapping | 用户配置映射 |
| lastActionTime | mapping | 用户最后操作时间 |
| riskScores | mapping | 用户风险评分 |

### 函数

#### setUserConfig

设置用户配置。

```solidity
function setUserConfig(
    bool _enabled,
    uint256 _maxHedgeAmount,
    uint256 _cooldownPeriod,
    bool _autoExecute
) external returns (void)
```

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| _enabled | bool | 是否启用服务 |
| _maxHedgeAmount | uint256 | 最大对冲金额 |
| _cooldownPeriod | uint256 | 冷却时间（秒） |
| _autoExecute | bool | 是否自动执行 |

**事件**: 触发 `UserConfigUpdated` 事件

#### setTEEVerifier

更新 TEE 验证器地址。

```solidity
function setTEEVerifier(address _teeVerifier) external onlyOwner returns (void)
```

#### setZeroGIntegration

设置 0G Integration 合约地址。

```solidity
function setZeroGIntegration(address _zeroGIntegration) external onlyOwner returns (void)
```

#### checkRisk

检查用户风险状况。

```solidity
function checkRisk(address _user)
    external
    view
    returns (
        uint256 healthFactor,
        uint256 totalCollateral,
        uint256 totalDebt,
        uint256 riskScore
    )
```

**返回值**:
| 返回值 | 类型 | 说明 |
|--------|------|------|
| healthFactor | uint256 | 健康因子 |
| totalCollateral | uint256 | 总抵押品 |
| totalDebt | uint256 | 总债务 |
| riskScore | uint256 | 风险评分 (0-100) |

#### triggerRiskCheck

触发风险检查。

```solidity
function triggerRiskCheck(address _user) external nonReentrant returns (void)
```

**要求**: 用户必须启用风险对冲服务

**事件**: 触发 `RiskAlert` 事件，可选触发 `HedgeExecuted` 事件

#### triggerRiskCheckWith0G

使用 0G AI 预测进行风险检查。

```solidity
function triggerRiskCheckWith0G(address _user) external nonReentrant returns (void)
```

**特性**:
- 获取用户 Aave 账户数据
- 调用 0G Integration 获取 AI 预测
- 如果置信度 > 70%，使用 AI 预测结果
- 否则使用链上基本计算

**事件**: 触发 `RiskCheckWith0G` 和 `RiskAlert` 事件

#### executeWithTEEProof

带 TEE 证明执行对冲操作。

```solidity
function executeWithTEEProof(
    address _user,
    uint8 _actionType,
    uint256 _amount,
    address _asset,
    bytes32 _inputHash,
    bytes32 _outputHash,
    bytes calldata _proof
) external nonReentrant returns (void)
```

**参数**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| _user | address | 用户地址 |
| _actionType | uint8 | 操作类型 (1=增加抵押, 2=闪电贷对冲, 3=部分还款) |
| _amount | uint256 | 操作金额 |
| _asset | address | 资产地址 |
| _inputHash | bytes32 | 输入数据哈希 |
| _outputHash | bytes32 | 输出数据哈希 |
| _proof | bytes | TEE 证明数据 |

**要求**:
- 用户必须启用风险对冲服务
- 操作金额不超过最大对冲金额
- 冷却期内不能执行操作
- TEE 证明必须验证通过

#### executeOperation

Aave 闪电贷回调函数。

```solidity
function executeOperation(
    address asset,
    uint256 amount,
    uint256 premium,
    address initiator,
    bytes calldata params
) external override returns (bool)
```

**要求**: 仅 Aave Pool 可调用

### 事件

| 事件名 | 说明 |
|--------|------|
| `RiskAlert` | 风险预警事件 |
| `HedgeExecuted` | 对冲操作执行事件 |
| `UserConfigUpdated` | 用户配置更新事件 |
| `RiskCheckWith0G` | 0G 预测风险检查事件 |

### 错误代码

| 错误名 | 说明 |
|--------|------|
| `UserNotEnabled(address)` | 用户未启用风险对冲服务 |
| `AmountExceedsMaxHedge(uint256, uint256)` | 操作金额超过限制 |
| `CooldownActive(uint256)` | 操作冷却中 |
| `TEEVerificationFailed()` | TEE 证明验证失败 |
| `InvalidActionType(uint8)` | 无效的操作类型 |
| `ETHTransferFailed()` | ETH 转账失败 |

---

## I0GIntegration.sol

0G Integration 接口定义。

**文件路径**: [interfaces/I0GIntegration.sol](file:///workspace/contracts/interfaces/I0GIntegration.sol)

### 接口方法

| 方法名 | 说明 |
|--------|------|
| `getPrediction(address)` | 获取用户清算预测 |
| `requestPrediction(address, uint256, uint256, uint256)` | 请求清算预测 |
| `liquidationThreshold()` | 获取清算阈值 |

---

## TEEDecisionVerifier.sol

TEE 决策验证合约。

**文件路径**: [TEEDecisionVerifier.sol](file:///workspace/contracts/TEEDecisionVerifier.sol)

### 主要函数

#### verifyDecision

验证 TEE 决策证明。

```solidity
function verifyDecision(
    address user,
    uint8 actionType,
    uint256 amount,
    address asset,
    bytes32 inputHash,
    bytes32 outputHash,
    bytes calldata proof
) external view returns (bool)
```

---

## TypeScript SDK 示例

### 初始化合约实例

```typescript
import { ethers } from 'ethers';
import I0GIntegration from './artifacts/contracts/interfaces/I0GIntegration.sol/I0GIntegration.json';

const provider = new ethers.JsonRpcProvider('https://rpc.0g.ai');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const integration = new ethers.Contract(
  INTEGRATION_ADDRESS,
  I0GIntegration.abi,
  wallet
);
```

### 请求预测

```typescript
async function requestPrediction(
  healthFactor: bigint,
  totalDebt: bigint,
  totalCollateral: bigint
) {
  const tx = await integration.requestPrediction(
    healthFactor,
    totalDebt,
    totalCollateral
  );
  await tx.wait();
  console.log('预测请求已提交');
}
```

### 获取预测结果

```typescript
async function getUserPrediction(user: string) {
  const prediction = await integration.getPrediction(user);
  return {
    probability: Number(prediction.probability) / 100,
    riskLevel: getRiskLevelName(Number(prediction.riskLevel)),
    confidence: Number(prediction.confidence),
    daProof: prediction.daProof,
    timestamp: new Date(Number(prediction.timestamp) * 1000)
  };
}

function getRiskLevelName(level: number): string {
  const levels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  return levels[level] || 'UNKNOWN';
}
```

---

## 相关文档

- [0G 集成指南](file:///workspace/docs/0G_INTEGRATION_README.md) - 完整集成文档
- [架构文档](file:///workspace/docs/ARCHITECTURE.md) - 系统架构说明
