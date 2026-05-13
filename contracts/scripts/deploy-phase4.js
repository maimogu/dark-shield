// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("========================================");
  console.log("  Deploying Phase 4 Contracts");
  console.log("========================================");
  console.log();

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());
  console.log();

  // Deployment addresses will be stored here
  const deployment = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId,
    deployer: deployer.address,
    contracts: {},
    deployedAt: new Date().toISOString()
  };

  // 1. Deploy MultiProtocolManager
  console.log("1. Deploying MultiProtocolManager...");
  const MultiProtocolManager = await ethers.getContractFactory("MultiProtocolManager");
  const multiProtocolManager = await MultiProtocolManager.deploy(deployer.address);
  await multiProtocolManager.deployed();
  console.log("   MultiProtocolManager deployed to:", multiProtocolManager.address);
  deployment.contracts.MultiProtocolManager = multiProtocolManager.address;
  console.log();

  // 2. Deploy CrossChainRiskMonitor
  console.log("2. Deploying CrossChainRiskMonitor...");
  const CrossChainRiskMonitor = await ethers.getContractFactory("CrossChainRiskMonitor");
  const crossChainRiskMonitor = await CrossChainRiskMonitor.deploy(deployer.address);
  await crossChainRiskMonitor.deployed();
  console.log("   CrossChainRiskMonitor deployed to:", crossChainRiskMonitor.address);
  deployment.contracts.CrossChainRiskMonitor = crossChainRiskMonitor.address;
  console.log();

  // 3. Deploy InsuranceManager
  console.log("3. Deploying InsuranceManager...");
  const InsuranceManager = await ethers.getContractFactory("InsuranceManager");
  const usdcAddress = "0x0000000000000000000000000000000000000001"; // Mock USDC for testing
  const insuranceManager = await InsuranceManager.deploy(deployer.address, usdcAddress);
  await insuranceManager.deployed();
  console.log("   InsuranceManager deployed to:", insuranceManager.address);
  deployment.contracts.InsuranceManager = insuranceManager.address;
  console.log();

  // 4. Deploy StrategyBacktester
  console.log("4. Deploying StrategyBacktester...");
  const StrategyBacktester = await ethers.getContractFactory("StrategyBacktester");
  const strategyBacktester = await StrategyBacktester.deploy(deployer.address);
  await strategyBacktester.deployed();
  console.log("   StrategyBacktester deployed to:", strategyBacktester.address);
  deployment.contracts.StrategyBacktester = strategyBacktester.address;
  console.log();

  // 5. Deploy RiskDashboard
  console.log("5. Deploying RiskDashboard...");
  const RiskDashboard = await ethers.getContractFactory("RiskDashboard");
  const riskDashboard = await RiskDashboard.deploy(deployer.address);
  await riskDashboard.deployed();
  console.log("   RiskDashboard deployed to:", riskDashboard.address);
  deployment.contracts.RiskDashboard = riskDashboard.address;
  console.log();

  // 6. Configure RiskDashboard with contract addresses
  console.log("6. Configuring RiskDashboard...");
  await riskDashboard.setContracts(
    multiProtocolManager.address,
    insuranceManager.address,
    crossChainRiskMonitor.address
  );
  console.log("   RiskDashboard configured successfully");
  console.log();

  // Save deployment information
  console.log("7. Saving deployment information...");
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentsDir, "deployment-phase4.json");
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  console.log("   Deployment information saved to:", deploymentFile);
  console.log();

  console.log("========================================");
  console.log("  Deployment Complete!");
  console.log("========================================");
  console.log();
  console.log("Contract Addresses:");
  console.log("  MultiProtocolManager:", multiProtocolManager.address);
  console.log("  CrossChainRiskMonitor:", crossChainRiskMonitor.address);
  console.log("  InsuranceManager:", insuranceManager.address);
  console.log("  StrategyBacktester:", strategyBacktester.address);
  console.log("  RiskDashboard:", riskDashboard.address);
  console.log();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
