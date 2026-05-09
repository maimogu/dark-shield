# DarkShield 智能合约

## 概述

DarkShield 智能合约是 DeFi 风险管理系统的链上执行层，部署在 0G 网络上。

## 合约列表

| 合约 | 文件 | 说明 |
|------|------|------|
| 0GIntegration | [0GIntegration.sol](0GIntegration.sol) | 0G 服务桥接合约（新增） |
| TEEDecisionVerifier | [TEEDecisionVerifier.sol](TEEDecisionVerifier.sol) | TEE 决策证明验证 |
| RiskHedgeExecutor | [RiskHedgeExecutor.sol](RiskHedgeExecutor.sol) | 风险对冲执行器 |

## 接口

| 接口 | 文件 | 说明 |
|------|------|------|
| I0GIntegration | [interfaces/I0GIntegration.sol](interfaces/I0GIntegration.sol) | 0G Integration 接口 |
| IAavePool | [interfaces/IAavePool.sol](interfaces/IAavePool.sol) | Aave V3 Pool 接口 |
| IWETH | [interfaces/IWETH.sol](interfaces/IWETH.sol) | WETH 接口 |

## 0G 集成说明

DarkShield 集成了以下 0G 组件：

| 组件 | 说明 | 集成位置 |
|------|------|----------|
| 0G Chain | 智能合约部署和执行 | 所有合约 |
| 0G Compute | AI 风险预测计算 | [0GIntegration.sol](0GIntegration.sol) |
| 0G DA | 数据可用性证明存储 | [0GIntegration.sol](0GIntegration.sol) |
| TEE | 策略参数保护 | [TEEDecisionVerifier.sol](TEEDecisionVerifier.sol) |

### 核心功能

1. **清算风险预测**：通过 0G AI 模型预测用户清算概率
2. **DA 证明存储**：将预测结果存储到 0G DA 层确保可验证性
3. **自动化对冲**：当风险超过阈值时自动执行对冲操作
4. **TEE 验证**：通过 TEE 证确保决策的可信性

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 编译合约
npx hardhat compile

# 3. 运行测试
npx hardhat test

# 4. 部署到测试网
npx hardhat run scripts/deploy.js --network 0gTestnet
```

## 相关文档

- [0G 集成指南](../docs/0G_INTEGRATION_README.md) - 完整的集成文档和使用指南
- [API 参考文档](../docs/API_REFERENCE.md) - 智能合约完整 API 说明
- [架构文档](../docs/ARCHITECTURE.md) - 系统架构和技术选型说明

## License

MIT
