# DarkShield 0G 集成指南

## 概述

### 项目介绍

DarkShield 是一个基于 0G 网络的去中心化 DeFi 风险管理平台，通过集成 0G AI 预测服务和 0G DA（数据可用性）存储服务，为用户提供实时的清算风险评估和自动化对冲保护。

### 核心价值

- **AI 驱动预测**：利用 0G AI 模型进行清算概率预测，提高预测准确性
- **链上可验证**：所有预测结果和证明数据存储在 0G DA 层，确保透明可验证
- **自动化保护**：支持自动执行风险对冲策略，降低用户资产风险
- **隐私保护**：通过 TEE（可信执行环境）技术保护用户交易策略

### 技术架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        DarkShield 前端                          │
│                    (Next.js + TypeScript)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       0G Compute 服务                            │
│              (0G AI 预测 + 0G Storage 存储)                     │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │   AI 预测引擎     │  │   DA 证明存储     │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     0G Chain 智能合约                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ 0GIntegration    │  │ RiskHedgeExecutor │  │TEEDecision  │ │
│  │ (0G 桥接合约)     │  │ (风险对冲执行器)   │  │Verifier(TEE) │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Aave V3 协议                              │
│                  (抵押/借贷/闪电贷服务)                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 快速开始

### 环境要求

| 组件 | 版本要求 |
|------|----------|
| Node.js | >= 18.0.0 |
| npm | >= 9.0.0 |
| Hardhat | >= 2.19.0 |
| Solidity | ^0.8.20 |

### 安装步骤

```bash
# 1. 克隆项目
git clone <repository-url>
cd workspace

# 2. 安装合约依赖
cd contracts
npm install

# 3. 安装前端依赖
cd ../frontend
npm install

# 4. 安装后端依赖
cd ../backend
pip install -r requirements.txt
```

### 配置说明

```bash
# 在 contracts 目录复制环境变量文件
cd contracts
cp .env.example .env

# 编辑 .env 填入以下配置
DEPLOYER_KEY=<你的私钥>
```

---

## 架构说明

### 系统架构

DarkShield 采用三层架构设计：

1. **前端展示层**：Next.js 构建的 Web 界面
2. **计算服务层**：0G Compute AI 预测和 DA 存储服务
3. **智能合约层**：部署在 0G Chain 上的合约

### 数据流程

```
用户请求预测
     │
     ▼
┌─────────────────┐
│   前端界面      │
└─────────────────┘
     │
     ▼
┌─────────────────┐     ┌─────────────────┐
│  后端 API       │────▶│   0G AI 模型    │
│  (app.py)       │     │  (风险预测)      │
└─────────────────┘     └─────────────────┘
     │
     ▼
┌─────────────────┐     ┌─────────────────┐
│  0G DA 存储     │◀────│  生成 DA 证明   │
│  (证明存储)      │     └─────────────────┘
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ 0GIntegration    │
│ 合约更新         │
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ 风险对冲执行     │
│ (可选)          │
└─────────────────┘
```

### 组件说明

| 组件 | 文件路径 | 功能描述 |
|------|----------|----------|
| 0GIntegration | [0GIntegration.sol](file:///workspace/contracts/0GIntegration.sol) | 0G 服务桥接合约，处理预测请求和 DA 证明存储 |
| RiskHedgeExecutor | [RiskHedgeExecutor.sol](file:///workspace/contracts/RiskHedgeExecutor.sol) | 风险对冲执行器，支持自动对冲和 TEE 验证 |
| TEEDecisionVerifier | [TEEDecisionVerifier.sol](file:///workspace/contracts/TEEDecisionVerifier.sol) | TEE 决策验证器，确保决策的可信性 |

---

## 使用指南

### 基本预测功能

用户可以通过调用 `requestPrediction` 函数获取清算风险预测：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/I0GIntegration.sol";

contract Example {
    I0GIntegration public integration;
    
    constructor(address _integration) {
        integration = I0GIntegration(_integration);
    }
    
    function getUserRisk(address _user) external view returns (
        uint256 probability,
        uint256 riskLevel,
        uint256 confidence
    ) {
        I0GIntegration.LiquidationPrediction memory pred = integration.getPrediction(_user);
        return (pred.probability, pred.riskLevel, pred.confidence);
    }
}
```

### 0G AI 预测

0G AI 预测通过以下流程工作：

1. **请求预测**：用户调用 `requestPrediction` 提供健康因子、债务等信息
2. **AI 推理**：后端使用 0G AI 模型分析市场数据生成预测
3. **证明生成**：预测结果和推理过程存储到 0G DA
4. **链上验证**：通过 `updatePredictionWithProof` 更新合约

```solidity
// 1. 用户请求基础预测
integration.requestPrediction(
    healthFactor,    // 健康因子 (1e18 精度)
    totalDebt,       // 总债务 (1e18 精度)
    totalCollateral   // 总抵押品 (1e18 精度)
);

// 2. 0G 服务更新带证明的预测
integration.updatePredictionWithProof(
    user,
    aiProbability,    // AI 预测概率 (0-10000)
    aiConfidence,     // 置信度 (0-100)
    daProof          // 0G DA 证明哈希
);

// 3. 获取最终预测结果
I0GIntegration.LiquidationPrediction memory result = integration.getPrediction(user);
```

### DA 存储验证

0G DA 证明用于验证预测数据的完整性和可用性：

```solidity
// 验证 DA 证明是否有效
bool isValid = integration.verifyDAProof(daProofHash);
require(isValid, "Invalid DA proof");
```

---

## SDK 集成

### Compute SDK 使用

前端与 0G Compute 服务交互：

```typescript
// frontend/lib/0gCompute.ts
const COMPUTE_API = process.env.NEXT_PUBLIC_COMPUTE_API_URL || 'http://localhost:5000';

interface PredictionRequest {
  healthFactor: string;
  totalDebt: string;
  totalCollateral: string;
  userAddress: string;
}

interface PredictionResponse {
  probability: number;
  riskLevel: number;
  confidence: number;
  daProof: string;
}

export async function requestPrediction(request: PredictionRequest): Promise<PredictionResponse> {
  const response = await fetch(`${COMPUTE_API}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    throw new Error(`Prediction failed: ${response.statusText}`);
  }
  
  return response.json();
}
```

### DA SDK 使用

存储和验证 DA 证明：

```typescript
// frontend/lib/0gDA.ts
const DA_API = process.env.NEXT_PUBLIC_DA_API_URL || 'http://localhost:5000';

export async function storeData(data: string): Promise<string> {
  const response = await fetch(`${DA_API}/store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data })
  });
  
  const result = await response.json();
  return result.proofHash;
}

export async function verifyData(proofHash: string): Promise<boolean> {
  const response = await fetch(`${DA_API}/verify/${proofHash}`);
  const result = await response.json();
  return result.valid;
}
```

### 错误处理

```typescript
try {
  const prediction = await requestPrediction({
    healthFactor: '1500000000000000000', // 1.5e18
    totalDebt: '1000000000000000000',    // 1 ETH
    totalCollateral: '2000000000000000000', // 2 ETH
    userAddress: userAddress
  });
  
  console.log('Prediction:', prediction);
} catch (error) {
  if (error.message.includes('Invalid DA proof')) {
    console.error('DA proof verification failed');
  } else if (error.message.includes('Prediction failed')) {
    console.error('AI service unavailable');
  }
}
```

---

## 测试

### 运行测试命令

```bash
# 编译合约
cd contracts
npx hardhat compile

# 运行所有测试
npx hardhat test

# 运行特定测试文件
npx hardhat test test/0GIntegration.js

# 查看测试覆盖率
npx hardhat coverage
```

### 预期结果

```
  0GIntegration
    ✓ requestPrediction should calculate correct probability
    ✓ updatePredictionWithProof should update prediction correctly
    ✓ verifyDAProof should return correct result
    ✓ getPrediction should return stored prediction

  RiskHedgeExecutor
    ✓ setUserConfig should update user config
    ✓ checkRisk should return correct data
    ✓ triggerRiskCheck should emit event

  5 passing (2s)
```

### 故障排除

| 问题 | 解决方案 |
|------|----------|
| 编译失败 | 确保 Node.js >= 18.0.0，运行 `npm install` |
| 测试失败 | 检查 .env 配置，确保私钥有效 |
| 网络超时 | 检查网络连接，确认 Hardhat 配置正确 |

---

## 部署

### 测试网部署

```bash
# 1. 配置环境变量
cp .env.example .env
# 填写 DEPLOYER_KEY

# 2. 部署到 0G 测试网
npx hardhat run scripts/deploy.js --network 0gTestnet

# 3. 验证部署
npx hardhat verify --network 0gTestnet <CONTRACT_ADDRESS>
```

### 生产环境准备

1. **安全审计**：完成智能合约安全审计
2. **配置管理**：设置生产环境变量
3. **监控部署**：配置合约事件监控
4. **备用方案**：准备故障切换机制

### 验证步骤

```bash
# 1. 验证合约字节码
npx hardhat verify --network 0gTestnet <ADDRESS>

# 2. 测试合约功能
npx hardhat run scripts/test-integration.js --network 0gTestnet

# 3. 检查事件日志
npx hardhat console --network 0gTestnet
```

---

## 故障排除

### 常见问题

#### Q1: 预测请求失败怎么办？

检查以下内容：
- 0G Compute 服务是否正常运行
- 网络连接是否正常
- 健康因子参数是否有效

#### Q2: DA 证明验证失败？

- 确认 0G DA 服务已正确存储数据
- 检查证明哈希是否正确
- 验证合约地址是否匹配

#### Q3: 合约调用超出 gas 限制？

- 优化合约调用参数
- 减少批量操作数量
- 升级到更高 gas 限制的网络

### 错误代码

| 错误代码 | 描述 | 解决方案 |
|----------|------|----------|
| `InvalidHealthFactor` | 健康因子参数无效 | 使用有效的 1e18 精度值 |
| `PredictionNotAvailable` | 预测结果不存在 | 先调用 requestPrediction |
| `ZeroHealthFactor` | 健康因子为零 | 检查输入数据有效性 |
| `UserNotEnabled` | 用户未启用服务 | 调用 setUserConfig 启用 |
| `CooldownActive` | 操作冷却中 | 等待冷却时间结束 |

### 联系方式

- **技术支持**: support@darkshield.io
- **GitHub Issues**: https://github.com/your-org/darkshield/issues
- **Discord**: https://discord.gg/darkshield

---

## 相关文档

- [API 参考文档](file:///workspace/docs/API_REFERENCE.md) - 智能合约完整 API 说明
- [架构文档](file:///workspace/docs/ARCHITECTURE.md) - 系统架构和技术选型说明
- [合约 README](../contracts/README.md) - 智能合约开发指南
