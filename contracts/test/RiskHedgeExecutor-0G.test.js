const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RiskHedgeExecutor 0G Integration", function () {
  let executor, zeroGIntegration;
  let mockAavePool, mockWETH;
  let owner, user1, user2;

  const MOCK_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const MockAavePool = await ethers.getContractFactory("MockAavePool");
    mockAavePool = await MockAavePool.deploy();
    await mockAavePool.waitForDeployment();

    const MockWETH = await ethers.getContractFactory("MockWETH");
    mockWETH = await MockWETH.deploy();
    await mockWETH.waitForDeployment();

    const TEEDecisionVerifier = await ethers.getContractFactory("TEEDecisionVerifier");
    const verifier = await TEEDecisionVerifier.deploy(owner.address);
    await verifier.waitForDeployment();

    const RiskHedgeExecutor = await ethers.getContractFactory("RiskHedgeExecutor");
    executor = await RiskHedgeExecutor.deploy(
      await mockAavePool.getAddress(),
      await mockWETH.getAddress(),
      MOCK_USDC,
      await verifier.getAddress()
    );
    await executor.waitForDeployment();

    const OgIntegration = await ethers.getContractFactory("OgIntegration");
    zeroGIntegration = await OgIntegration.deploy(owner.address);
    await zeroGIntegration.waitForDeployment();

    await mockAavePool.setUserAccountData(
      user1.address,
      ethers.parseEther("15000"),
      ethers.parseEther("10000"),
      ethers.parseEther("1.5")
    );
  });

  describe("设置 0G Integration 地址", function () {
    it("owner 应能设置 0G Integration 地址", async function () {
      await executor.setZeroGIntegration(await zeroGIntegration.getAddress());
      expect(await executor.zeroGIntegration()).to.equal(await zeroGIntegration.getAddress());
    });

    it("非 owner 不应能设置 0G Integration 地址", async function () {
      await expect(
        executor.connect(user1).setZeroGIntegration(await zeroGIntegration.getAddress())
      ).to.be.revertedWithCustomError(executor, "OwnableUnauthorizedAccount");
    });

    it("不应设置零地址", async function () {
      await expect(
        executor.setZeroGIntegration(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });
  });

  describe("AI_CONFIDENCE_THRESHOLD 常量", function () {
    it("应返回正确的置信度阈值", async function () {
      expect(await executor.AI_CONFIDENCE_THRESHOLD()).to.equal(70);
    });
  });

  describe("triggerRiskCheckWith0G 基本功能", function () {
    beforeEach(async function () {
      await executor.connect(user1).setUserConfig(true, 1000000, 3600, false);
      await executor.setZeroGIntegration(await zeroGIntegration.getAddress());
    });

    it("未启用用户应回退", async function () {
      await expect(
        executor.triggerRiskCheckWith0G(user2.address)
      ).to.be.revertedWithCustomError(executor, "UserNotEnabled");
    });

    it("应触发 RiskCheckWith0G 事件", async function () {
      await expect(
        executor.triggerRiskCheckWith0G(user1.address)
      ).to.emit(executor, "RiskCheckWith0G");
    });

    it("应触发 RiskAlert 事件", async function () {
      await expect(
        executor.triggerRiskCheckWith0G(user1.address)
      ).to.emit(executor, "RiskAlert");
    });
  });

  describe("0G 预测置信度高时使用 AI 预测", function () {
    beforeEach(async function () {
      await executor.connect(user1).setUserConfig(true, 1000000, 3600, false);
      await executor.setZeroGIntegration(await zeroGIntegration.getAddress());

      await zeroGIntegration.connect(user1).requestPrediction(
        ethers.parseEther("1.5"),
        ethers.parseEther("10000"),
        ethers.parseEther("15000")
      );
    });

    it("高置信度时使用 0G 预测", async function () {
      const prediction = await zeroGIntegration.predictions(user1.address);
      expect(prediction.confidence).to.be.gt(0);

      await expect(
        executor.triggerRiskCheckWith0G(user1.address)
      ).to.emit(executor, "RiskCheckWith0G");
    });
  });

  describe("0G 预测置信度低时回退到基本计算", function () {
    beforeEach(async function () {
      await executor.connect(user1).setUserConfig(true, 1000000, 3600, false);
    });

    it("未设置 0G Integration 时使用 on-chain 评分", async function () {
      await executor.updateRiskScore(user1.address, 60);

      const tx = await executor.triggerRiskCheckWith0G(user1.address);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === "RiskCheckWith0G"
      );
      expect(event).to.not.be.undefined;
      expect(event.args.user).to.equal(user1.address);
      expect(event.args.aiProbability).to.equal(0);
      expect(event.args.aiConfidence).to.equal(0);
      expect(event.args.onChainRiskScore).to.equal(60);
    });
  });

  describe("自动对冲功能", function () {
    beforeEach(async function () {
      await executor.connect(user1).setUserConfig(true, 1000000, 3600, true);
      await executor.setZeroGIntegration(await zeroGIntegration.getAddress());
      await executor.updateRiskScore(user1.address, 60);
    });

    it("风险评分超过阈值时应触发对冲事件", async function () {
      const tx = await executor.triggerRiskCheckWith0G(user1.address);
      const receipt = await tx.wait();

      const riskAlertEvent = receipt.logs.find(
        log => log.fragment && log.fragment.name === "RiskAlert"
      );
      expect(riskAlertEvent).to.not.be.undefined;
    });
  });

  describe("事件验证", function () {
    beforeEach(async function () {
      await executor.connect(user1).setUserConfig(true, 1000000, 3600, false);
      await executor.setZeroGIntegration(await zeroGIntegration.getAddress());
      await executor.updateRiskScore(user1.address, 55);
    });

    it("RiskCheckWith0G 事件应包含正确的参数", async function () {
      const tx = await executor.triggerRiskCheckWith0G(user1.address);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === "RiskCheckWith0G"
      );
      expect(event).to.not.be.undefined;
      expect(event.args.user).to.equal(user1.address);
      expect(event.args.healthFactor).to.equal(ethers.parseEther("1.5"));
    });

    it("RiskAlert 事件应在风险检查时触发", async function () {
      const tx = await executor.triggerRiskCheckWith0G(user1.address);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === "RiskAlert"
      );
      expect(event).to.not.be.undefined;
      expect(event.args.user).to.equal(user1.address);
    });
  });
});
