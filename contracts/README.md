# DarkShield - DeFi 智能风控系统

基于区块链的 DeFi 智能风控平台，集成了 **0G Network** 的 AI 计算和去中心化存储能力。

## 🎯 项目概述

DarkShield 是一个去中心化风险管理平台，为 DeFi 用户提供：

- 🔮 **清算预测** - AI 实时预测清算风险
- 📊 **风险评分** - 综合风险评估系统
- 💡 **策略推荐** - 智能对冲策略建议
- ⛓️ **去中心化存储** - 0G DA 永久数据存储
- 🤖 **AI 计算** - 0G Compute 网络支持

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend / User                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  Smart Contract Layer                        │
│  ┌───────────────────┐    ┌────────────────────────────┐   │
│  │RiskHedgeExecutor  │    │   TEEDecisionVerifier     │   │
│  │     + 0G          │    │                           │   │
│  ├───────────────────┤    ├────────────────────────────┤   │
│  │HedgeStrategy      │    │    0GIntegration         │   │
│  │Manager            │    │                           │   │
│  └───────────────────┘    └────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  0G Network Layer                           │
│  ┌───────────────────┐    ┌────────────────────────────┐   │
│  │ 0G Compute        │    │        0G DA             │   │
│  │ (AI Inference)    │    │ (Data Availability)      │   │
│  └───────────────────┘    └────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                     Aave V3 Protocol                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Pool • WETH • USDC • Flash Loans                  │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

## 📦 Phase 1: 清算预测系统 ✅

### 功能特性
- 实时清算概率预测
- 风险等级评估（LOW/MEDIUM/HIGH/CRITICAL）
- 0G DA 可验证存储
- AI 服务不可用时的 Fallback 机制

### 合约部署
- **网络**: 0G Galileo Testnet (Chain ID: 16602)
- **合约地址**: `0x63fea6E447F120B8Faf85B53cdaD8348e645D80E`
- **交易哈希**: `0x7e257ce164d9ef6cec82235477ed81ee3c803c0ae3117d29bad2c0f71e623151`

### 核心合约
- `0GIntegration.sol` - 清算预测核心合约
- `I0GIntegration.sol` - 接口定义

## 📊 Phase 2: 风险评分系统 ✅

### 功能特性
- 综合风险评分 (0-100)
- 多因素风险分析
- 批量评分处理
- 历史数据分析
- 评分更新频率控制

### 核心功能
- 批量风险评分计算（每次最多10个用户）
- 历史数据读取和存储
- 评分更新冷却期控制
- 完整审计追踪

### SDK 服务
- `0g-compute-service.js` - 风险评分计算
- `0g-da-service.js` - 风险评分存储

## 💡 Phase 3: 对冲策略推荐 ✅

### 功能特性
- AI 驱动的策略推荐
- 多场景策略模拟
- 三种策略类型支持:
  1. 增加抵押品
  2. 闪电贷对冲
  3. 部分还款
- 执行验证和追踪
- 完整生命周期管理

### 核心合约
- `HedgeStrategyManager.sol` - 策略管理
- `HedgeStrategyExecutor.sol` - 策略执行

### 脚本工具
- `hedge-strategy-recommender.js` - 策略推荐脚本

## 🛠️ 技术栈

| 组件 | 技术 |
|------|------|
| **智能合约** | Solidity 0.8.20 |
| **开发框架** | Hardhat |
| **Web3 库** | ethers.js v6 |
| **安全库** | OpenZeppelin Contracts |
| **AI 计算** | 0G Compute SDK |
| **数据存储** | 0G DA SDK |
| **测试网络** | 0G Galileo Testnet |

## 🚀 快速开始

### 1. 环境配置

```bash
# 克隆项目
git clone https://github.com/maimogu/dark-shield.git
cd dark-shield/contracts

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的私钥
```

### 2. 编译合约

```bash
npx hardhat compile
```

### 3. 运行测试

```bash
# 运行所有测试
npx hardhat test

# 运行特定测试
npx hardhat test test/0GIntegration.test.js
npx hardhat test test/RiskScoring.test.js
npx hardhat test test/HedgeStrategy.test.js
```

### 4. 部署到测试网

```bash
# 部署 0G Integration 合约
npx hardhat run scripts/deploy-0g-integration.js --network testnet

# 部署主合约
npx hardhat run scripts/deploy.js --network testnet
```

### 5. 使用 0G 服务

```bash
# 运行清算预测
npx hardhat run scripts/integrate-0g-prediction.js

# 运行策略推荐
npx hardhat run scripts/hedge-strategy-recommender.js
```

## 📚 文档

- [0G 集成指南](./docs/0G_INTEGRATION_README.md)
- [API 参考](./docs/API_REFERENCE.md)
- [架构设计](./docs/ARCHITECTURE.md)
- [Phase 2 文档](./docs/PHASE2_README.md)
- [Phase 3 文档](./docs/PHASE3_README.md)

## 🔐 安全特性

- ✅ **访问控制** - Ownable 权限管理
- ✅ **重入防护** - ReentrancyGuard
- ✅ **TEE 验证** - 可信执行环境证明
- ✅ **0G DA 验证** - 去中心化数据验证
- ✅ **冷启动保护** - 初始阈值设置
- ✅ **冷却期控制** - 操作频率限制

## 🧪 测试

### 测试覆盖

| 模块 | 测试用例数 | 状态 |
|------|-----------|------|
| 0GIntegration | 30 | ✅ |
| RiskScoring | 30 | ✅ |
| HedgeStrategy | 27 | ✅ |
| RiskHedgeExecutor | 12 | ✅ |
| **总计** | **99** | ✅ **All Passing** |

### 运行测试

```bash
# 所有测试
npx hardhat test

# 带覆盖率
npx hardhat coverage

# 单个测试文件
npx hardhat test test/0GIntegration.test.js --grep "liquidation"
```

## 🌐 网络配置

### 0G Galileo Testnet

```javascript
// hardhat.config.js
networks: {
  testnet: {
    url: process.env.OG_TESTNET_RPC || "https://evmrpc-testnet.0g.ai",
    chainId: 16602,
    accounts: [process.env.DEPLOYER_KEY]
  }
}
```

### 区块浏览器

- **0G Explorer**: https://chainscan-galileo.0g.ai/
- **0G Storage Explorer**: https://storagescan-galileo.0g.ai/

## 📈 开发路线图

- [x] **Phase 1**: 清算预测系统
- [x] **Phase 2**: 风险评分系统
- [x] **Phase 3**: 对冲策略推荐
- [ ] **Phase 4**: 主网部署和优化
- [ ] **Phase 5**: 多链支持

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🔗 相关链接

- [0G 官方文档](https://docs.0g.ai/)
- [0G Discord](https://discord.gg/0glabs)
- [Hardhat 文档](https://hardhat.org/docs)
- [OpenZeppelin](https://openzeppelin.com/contracts/)
- [Aave V3 文档](https://docs.aave.com/developer/v/3.0/)

---

**Built with ❤️ by DarkShield Team**
