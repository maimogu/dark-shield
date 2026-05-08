/**
 * RiskHedgeExecutor 合约测试
 * 测试风险监控、用户配置和对冲执行功能
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RiskHedgeExecutor", function () {
  let executor, verifier;
  let owner, user1, user2;

  // 模拟地址
  const MOCK_AAVE_POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";
  const MOCK_WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const MOCK_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // 部署 TEE 验证器
    const TEEDecisionVerifier = await ethers.getContractFactory("TEEDecisionVerifier");
    verifier = await TEEDecisionVerifier.deploy(owner.address);
    await verifier.waitForDeployment();

    // 部署执行器
    const RiskHedgeExecutor = await ethers.getContractFactory("RiskHedgeExecutor");
    executor = await RiskHedgeExecutor.deploy(
      MOCK_AAVE_POOL,
      MOCK_WETH,
      MOCK_USDC,
      await verifier.getAddress()
    );
    await executor.waitForDeployment();
  });

  describe("部署", function () {
    it("应正确设置合约地址", async function () {
      expect(await executor.aavePool()).to.equal(MOCK_AAVE_POOL);
      expect(await executor.weth()).to.equal(MOCK_WETH);
      expect(await executor.usdc()).to.equal(MOCK_USDC);
      expect(await executor.teeVerifier()).to.equal(await verifier.getAddress());
    });

    it("应正确设置 owner", async function () {
      expect(await executor.owner()).to.equal(owner.address);
    });
  });

  describe("用户配置", function () {
    it("用户应能设置自己的配置", async function () {
      await expect(
        executor.connect(user1).setUserConfig(true, 10000, 3600, false)
      ).to.emit(executor, "UserConfigUpdated").withArgs(user1.address);

      const config = await executor.userConfigs(user1.address);
      expect(config.enabled).to.be.true;
      expect(config.maxHedgeAmount).to.equal(10000);
      expect(config.cooldownPeriod).to.equal(3600);
      expect(config.autoExecute).to.be.false;
    });

    it("用户应能更新配置", async function () {
      await executor.connect(user1).setUserConfig(true, 10000, 3600, false);
      await executor.connect(user1).setUserConfig(true, 20000, 7200, true);

      const config = await executor.userConfigs(user1.address);
      expect(config.maxHedgeAmount).to.equal(20000);
      expect(config.autoExecute).to.be.true;
    });
  });

  describe("风险评分", function () {
    it("任何人应能更新风险评分", async function () {
      await executor.updateRiskScore(user1.address, 75);
      expect(await executor.riskScores(user1.address)).to.equal(75);
    });

    it("应能更新不同用户的评分", async function () {
      await executor.updateRiskScore(user1.address, 30);
      await executor.updateRiskScore(user2.address, 80);

      expect(await executor.riskScores(user1.address)).to.equal(30);
      expect(await executor.riskScores(user2.address)).to.equal(80);
    });
  });

  describe("TEE 验证器更新", function () {
    it("owner 应能更新 TEE 验证器地址", async function () {
      const newVerifier = user2.address;
      await executor.setTEEVerifier(newVerifier);
      expect(await executor.teeVerifier()).to.equal(newVerifier);
    });

    it("非 owner 不应能更新 TEE 验证器", async function () {
      await expect(
        executor.connect(user1).setTEEVerifier(user2.address)
      ).to.be.reverted;
    });
  });

  describe("接收 ETH", function () {
    it("合约应能接收 ETH", async function () {
      await expect(
        owner.sendTransaction({ to: await executor.getAddress(), value: ethers.parseEther("1.0") })
      ).to.not.be.reverted;
    });
  });
});
