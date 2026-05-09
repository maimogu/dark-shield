const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("========================================");
    console.log("  0G Integration 合约部署开始");
    console.log("========================================\n");

    const [deployer] = await ethers.getSigners();
    console.log("部署账户地址:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("部署账户余额:", ethers.formatEther(balance), "ETH\n");

    console.log("正在部署 0GIntegration 合约...");

    const OgIntegration = await ethers.getContractFactory("OgIntegration");
    const ogIntegration = await OgIntegration.deploy(deployer.address);
    await ogIntegration.waitForDeployment();

    const ogIntegrationAddress = await ogIntegration.getAddress();
    console.log("0GIntegration 已部署至:", ogIntegrationAddress);
    console.log("  交易哈希:", ogIntegration.deploymentTransaction().hash, "\n");

    console.log("========================================");
    console.log("  部署完成");
    console.log("========================================");
    console.log("0GIntegration 地址:", ogIntegrationAddress);
    console.log("交易哈希:", ogIntegration.deploymentTransaction().hash);
    console.log("========================================\n");

    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    const network = await ethers.provider.getNetwork();
    const deploymentInfo = {
        network: {
            name: network.name,
            chainId: Number(network.chainId),
        },
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
        contracts: {
            OgIntegration: {
                address: ogIntegrationAddress,
                transactionHash: ogIntegration.deploymentTransaction().hash,
                constructorArgs: {
                    initialOwner: deployer.address,
                },
            },
        },
    };

    const deploymentFilePath = path.join(
        deploymentsDir,
        "deployment-0g-integration.json"
    );
    fs.writeFileSync(
        deploymentFilePath,
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log("部署信息已保存至:", deploymentFilePath);
}

main()
    .then(() => {
        console.log("\n部署脚本执行成功！");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n部署脚本执行失败:", error);
        process.exit(1);
    });
