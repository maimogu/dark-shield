/**
 * @title DarkShield 合约部署脚本
 * @notice 部署 TEEDecisionVerifier 和 RiskHedgeExecutor 合约
 * @dev 使用 ethers.js 进行部署，并将部署信息保存到 JSON 文件
 *
 * 使用方法：
 *   npx hardhat run scripts/deploy.js --network <network-name>
 */

const { ethers } = require("hardhat");

async function main() {
    console.log("========================================");
    console.log("  DarkShield 合约部署开始");
    console.log("========================================\n");

    // 获取部署者签名器
    const [deployer] = await ethers.getSigners();
    console.log("部署账户地址:", deployer.address);

    // 查询部署者余额
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("部署账户余额:", ethers.formatEther(balance), "ETH\n");

    // ========================================
    // 部署 TEEDecisionVerifier 合约
    // ========================================
    console.log("正在部署 TEEDecisionVerifier 合约...");

    const TEEDecisionVerifier = await ethers.getContractFactory("TEEDecisionVerifier");
    const teeVerifier = await TEEDecisionVerifier.deploy(deployer.address);
    await teeVerifier.waitForDeployment();

    const teeVerifierAddress = await teeVerifier.getAddress();
    console.log("TEEDecisionVerifier 已部署至:", teeVerifierAddress);
    console.log("  交易哈希:", teeVerifier.deploymentTransaction().hash, "\n");

    // ========================================
    // 配置部署参数
    // ========================================
    // 注意：以下地址需要根据目标网络进行配置
    // 这里使用零地址作为占位符，实际部署时需替换为正确的合约地址

    // Aave V3 Pool 地址（需根据网络配置）
    // 例如：Mainnet: 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2
    const AAVE_POOL_ADDRESS = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";

    // WETH 地址（需根据网络配置）
    // 例如：Mainnet: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
    const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

    // USDC 地址（需根据网络配置）
    // 例如：Mainnet: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
    const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

    console.log("部署参数配置:");
    console.log("  Aave Pool 地址:", AAVE_POOL_ADDRESS);
    console.log("  WETH 地址:", WETH_ADDRESS);
    console.log("  USDC 地址:", USDC_ADDRESS);
    console.log("  TEE Verifier 地址:", teeVerifierAddress, "\n");

    // ========================================
    // 部署 RiskHedgeExecutor 合约
    // ========================================
    console.log("正在部署 RiskHedgeExecutor 合约...");

    const RiskHedgeExecutor = await ethers.getContractFactory("RiskHedgeExecutor");
    const riskHedgeExecutor = await RiskHedgeExecutor.deploy(
        AAVE_POOL_ADDRESS,
        WETH_ADDRESS,
        USDC_ADDRESS,
        teeVerifierAddress
    );
    await riskHedgeExecutor.waitForDeployment();

    const riskHedgeExecutorAddress = await riskHedgeExecutor.getAddress();
    console.log("RiskHedgeExecutor 已部署至:", riskHedgeExecutorAddress);
    console.log("  交易哈希:", riskHedgeExecutor.deploymentTransaction().hash, "\n");

    // ========================================
    // 连接 0G Integration 合约
    // ========================================
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    const ogDeploymentPath = path.join(deploymentsDir, "deployment-0g-integration.json");
    let zeroGIntegrationAddress = null;

    if (fs.existsSync(ogDeploymentPath)) {
        const ogDeployment = JSON.parse(fs.readFileSync(ogDeploymentPath, "utf8"));
        zeroGIntegrationAddress = ogDeployment.contracts.OgIntegration.address;
        console.log("发现已部署的 0GIntegration 合约:", zeroGIntegrationAddress);
        console.log("正在将 RiskHedgeExecutor 与 0G Integration 连接...");

        const tx = await riskHedgeExecutor.setZeroGIntegration(zeroGIntegrationAddress);
        await tx.wait();
        console.log("连接成功！交易哈希:", tx.hash, "\n");
    } else {
        console.log("未找到已部署的 0GIntegration 合约，跳过连接步骤");
        console.log("请先运行: npx hardhat run scripts/deploy-0g-integration.js --network <network>\n");
    }

    // ========================================
    // 输出部署摘要
    // ========================================
    console.log("========================================");
    console.log("  部署完成 - 合约地址汇总");
    console.log("========================================");
    console.log("TEEDecisionVerifier:", teeVerifierAddress);
    console.log("RiskHedgeExecutor:  ", riskHedgeExecutorAddress);
    if (zeroGIntegrationAddress) {
        console.log("OgIntegration:      ", zeroGIntegrationAddress);
    }
    console.log("========================================\n");

    // ========================================
    // 保存部署信息到 JSON 文件
    // ========================================
    const fs = require("fs");
    const path = require("path");

    // 确保 deployments 目录存在
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    // 构建部署信息对象
    const network = await ethers.provider.getNetwork();
    const deploymentInfo = {
        network: {
            name: network.name,
            chainId: Number(network.chainId),
        },
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
        contracts: {
            TEEDecisionVerifier: {
                address: teeVerifierAddress,
                transactionHash: teeVerifier.deploymentTransaction().hash,
            },
            RiskHedgeExecutor: {
                address: riskHedgeExecutorAddress,
                transactionHash: riskHedgeExecutor.deploymentTransaction().hash,
                constructorArgs: {
                    aavePool: AAVE_POOL_ADDRESS,
                    weth: WETH_ADDRESS,
                    usdc: USDC_ADDRESS,
                    teeVerifier: teeVerifierAddress,
                },
            },
        },
    };

    // 写入 JSON 文件
    const deploymentFilePath = path.join(
        deploymentsDir,
        `deployment-${network.name}-${Number(network.chainId)}.json`
    );
    fs.writeFileSync(
        deploymentFilePath,
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log("部署信息已保存至:", deploymentFilePath);
}

// 执行部署脚本
main()
    .then(() => {
        console.log("\n部署脚本执行成功！");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n部署脚本执行失败:", error);
        process.exit(1);
    });
