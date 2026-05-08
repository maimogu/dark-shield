# DarkShield 智能合约

## 概述

DarkShield 智能合约是 DeFi 风险管理系统的链上执行层，部署在 0G 网络上。

## 合约列表

| 合约 | 文件 | 说明 |
|------|------|------|
| TEEDecisionVerifier | `TEEDecisionVerifier.sol` | TEE 决策证明验证 |
| RiskHedgeExecutor | `RiskHedgeExecutor.sol` | 风险对冲执行器 |

## 接口

| 接口 | 文件 | 说明 |
|------|------|------|
| IAavePool | `interfaces/IAavePool.sol` | Aave V3 Pool 接口 |
| IWETH | `interfaces/IWETH.sol` | WETH 接口 |

## 安装

```bash
npm install
```

## 编译

```bash
npx hardhat compile
```

## 测试

```bash
npx hardhat test
```

## 部署

### 0G 测试网

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 DEPLOYER_KEY

# 2. 部署
npx hardhat run scripts/deploy.js --network 0gTestnet
```

### 本地网络

```bash
# 启动本地节点
npx hardhat node

# 部署
npx hardhat run scripts/deploy.js --network localhost
```

## 使用的 0G 组件

- **0G Chain**: 智能合约部署和执行
- **TEE**: 策略参数保护（通过 TEEDecisionVerifier 验证）
- **0G Compute**: 风险计算（后端集成）
- **0G Storage**: 加密数据存储（后端集成）

## License

MIT
