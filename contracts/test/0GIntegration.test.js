/**
 * OgIntegration 合约测试
 * 测试清算风险预测、DA 证明存储和阈值管理功能
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OgIntegration", function () {
  let contract;
  let owner, user1, user2;

  const HEALTHY_HF = ethers.parseEther("2.0");
  const LIQUIDATABLE_HF = ethers.parseEther("0.9");
  const ZERO_HF = 0;
  const DEFAULT_DEBT = ethers.parseEther("10000");
  const DEFAULT_COLLATERAL = ethers.parseEther("20000");

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const OgIntegration = await ethers.getContractFactory("OgIntegration");
    contract = await OgIntegration.deploy(owner.address);
    await contract.waitForDeployment();
  });

  describe("部署", function () {
    it("应正确设置默认清算阈值 (5000 = 50%)", async function () {
      const threshold = await contract.liquidationThreshold();
      expect(threshold).to.equal(5000);
    });

    it("应正确设置 owner", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("应正确设置概率精度", async function () {
      const precision = await contract.PROBABILITY_PRECISION();
      expect(precision).to.equal(10000);
    });
  });

  describe("requestPrediction - 请求预测", function () {
    it("应成功为健康用户 (HF=2.0) 创建预测", async function () {
      const tx = await contract.connect(user1).requestPrediction(
        HEALTHY_HF,
        DEFAULT_DEBT,
        DEFAULT_COLLATERAL
      );

      const receipt = await tx.wait();

      const prediction = await contract.getPrediction(user1.address);

      expect(prediction.probability).to.be.lt(5000);
      expect(prediction.riskLevel).to.equal(0);
      expect(prediction.daProof).to.equal(ethers.ZeroHash);
      expect(prediction.timestamp).to.be.gt(0);
    });

    it("应成功为可清算用户 (HF=0.9) 创建预测", async function () {
      const tx = await contract.connect(user1).requestPrediction(
        LIQUIDATABLE_HF,
        DEFAULT_DEBT,
        DEFAULT_COLLATERAL
      );

      await tx.wait();

      const prediction = await contract.getPrediction(user1.address);

      expect(prediction.probability).to.be.gt(5000);
      expect(prediction.riskLevel).to.be.gte(2);
    });

    it("应拒绝零健康因子", async function () {
      await expect(
        contract.connect(user1).requestPrediction(
          ZERO_HF,
          DEFAULT_DEBT,
          DEFAULT_COLLATERAL
        )
      ).to.be.revertedWithCustomError(contract, "ZeroHealthFactor");
    });

    it("应为零债务用户返回零概率", async function () {
      const tx = await contract.connect(user1).requestPrediction(
        HEALTHY_HF,
        0,
        DEFAULT_COLLATERAL
      );

      await tx.wait();

      const prediction = await contract.getPrediction(user1.address);
      expect(prediction.probability).to.equal(0);
    });

    it("应正确触发 LiquidationRiskPredicted 事件", async function () {
      const tx = await contract.connect(user1).requestPrediction(
        HEALTHY_HF,
        DEFAULT_DEBT,
        DEFAULT_COLLATERAL
      );

      const receipt = await tx.wait();

      const event = receipt.logs.find(
        log => log.fragment?.name === "LiquidationRiskPredicted"
      );

      expect(event).to.not.be.undefined;
      expect(event.args.user).to.equal(user1.address);
      expect(event.args.probability).to.be.a("bigint");
    });
  });

  describe("getPrediction - 获取预测", function () {
    it("应返回存储的预测", async function () {
      await contract.connect(user1).requestPrediction(
        HEALTHY_HF,
        DEFAULT_DEBT,
        DEFAULT_COLLATERAL
      );

      const prediction = await contract.getPrediction(user1.address);

      expect(prediction.probability).to.be.a("bigint");
      expect(prediction.riskLevel).to.be.a("bigint");
      expect(prediction.confidence).to.be.a("bigint");
    });

    it("应为无预测用户回退", async function () {
      await expect(
        contract.getPrediction(user2.address)
      ).to.be.revertedWithCustomError(contract, "PredictionNotAvailable");
    });

    it("应正确更新同一用户的预测", async function () {
      await contract.connect(user1).requestPrediction(
        HEALTHY_HF,
        DEFAULT_DEBT,
        DEFAULT_COLLATERAL
      );

      const firstPrediction = await contract.getPrediction(user1.address);

      await contract.connect(user1).requestPrediction(
        LIQUIDATABLE_HF,
        DEFAULT_DEBT,
        DEFAULT_COLLATERAL
      );

      const secondPrediction = await contract.getPrediction(user1.address);

      expect(secondPrediction.timestamp).to.be.gt(firstPrediction.timestamp);
    });
  });

  describe("updatePredictionWithProof - 更新带证明的预测", function () {
    beforeEach(async function () {
      await contract.connect(user1).requestPrediction(
        HEALTHY_HF,
        DEFAULT_DEBT,
        DEFAULT_COLLATERAL
      );
    });

    it("所有者应能更新带 0G DA 证明的预测", async function () {
      const newProbability = 7500;
      const newConfidence = 85;
      const daProof = ethers.keccak256(ethers.toUtf8Bytes("0g-da-proof-123"));

      await contract.updatePredictionWithProof(
        user1.address,
        newProbability,
        newConfidence,
        daProof
      );

      const prediction = await contract.getPrediction(user1.address);

      expect(prediction.probability).to.equal(newProbability);
      expect(prediction.confidence).to.equal(newConfidence);
      expect(prediction.daProof).to.equal(daProof);
      expect(prediction.riskLevel).to.equal(3);
    });

    it("应存储 DA 证明", async function () {
      const daProof = ethers.keccak256(ethers.toUtf8Bytes("0g-da-proof-456"));

      await contract.updatePredictionWithProof(
        user1.address,
        6000,
        80,
        daProof
      );

      const isValid = await contract.verifyDAProof(daProof);
      expect(isValid).to.be.true;
    });

    it("非所有者不能更新预测", async function () {
      await expect(
        contract.connect(user1).updatePredictionWithProof(
          user1.address,
          6000,
          80,
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("应拒绝为无预测用户更新", async function () {
      await expect(
        contract.updatePredictionWithProof(
          user2.address,
          6000,
          80,
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(contract, "PredictionNotAvailable");
    });

    it("应拒绝超出范围的概率", async function () {
      await expect(
        contract.updatePredictionWithProof(
          user1.address,
          10001,
          80,
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(contract, "InvalidHealthFactor");
    });
  });

  describe("updateThreshold - 更新阈值", function () {
    it("所有者应能更新清算阈值", async function () {
      const newThreshold = 6000;

      await expect(contract.updateThreshold(newThreshold))
        .to.emit(contract, "ThresholdUpdated")
        .withArgs(5000, newThreshold);

      expect(await contract.liquidationThreshold()).to.equal(newThreshold);
    });

    it("应拒绝超出范围的阈值", async function () {
      await expect(
        contract.updateThreshold(10001)
      ).to.be.revertedWithCustomError(contract, "InvalidHealthFactor");
    });

    it("非所有者不能更新阈值", async function () {
      await expect(
        contract.connect(user1).updateThreshold(6000)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("应允许设置零阈值", async function () {
      await contract.updateThreshold(0);
      expect(await contract.liquidationThreshold()).to.equal(0);
    });

    it("应允许设置最大阈值 (10000)", async function () {
      await contract.updateThreshold(10000);
      expect(await contract.liquidationThreshold()).to.equal(10000);
    });
  });

  describe("风险等级计算", function () {
    it("高健康因子应返回 LOW 风险等级", async function () {
      const highHF = ethers.parseEther("4.0");
      await contract.connect(user1).requestPrediction(
        highHF,
        0,
        DEFAULT_COLLATERAL
      );

      const prediction = await contract.getPrediction(user1.address);
      expect(prediction.riskLevel).to.equal(0);
    });

    it("低健康因子应返回 CRITICAL 风险等级", async function () {
      const lowHF = ethers.parseEther("1.05");
      await contract.connect(user1).requestPrediction(
        lowHF,
        DEFAULT_DEBT,
        DEFAULT_COLLATERAL
      );

      const prediction = await contract.getPrediction(user1.address);
      expect(prediction.riskLevel).to.equal(3);
    });

    it("阈值更新应影响风险等级计算", async function () {
      await contract.updateThreshold(3000);

      const mediumHF = ethers.parseEther("1.5");
      await contract.connect(user1).requestPrediction(
        mediumHF,
        DEFAULT_DEBT,
        DEFAULT_COLLATERAL
      );

      const prediction = await contract.getPrediction(user1.address);
      expect(prediction.riskLevel).to.be.gt(0);
    });
  });

  describe("置信度计算", function () {
    it("应正确计算高健康因子的置信度", async function () {
      await contract.connect(user1).requestPrediction(
        HEALTHY_HF,
        DEFAULT_DEBT,
        DEFAULT_COLLATERAL
      );

      const prediction = await contract.getPrediction(user1.address);
      expect(prediction.confidence).to.be.gte(80);
    });

    it("应正确计算低健康因子的置信度", async function () {
      await contract.connect(user1).requestPrediction(
        LIQUIDATABLE_HF,
        DEFAULT_DEBT,
        DEFAULT_COLLATERAL
      );

      const prediction = await contract.getPrediction(user1.address);
      expect(prediction.confidence).to.be.gte(55);
    });

    it("高债务应增加置信度", async function () {
      const highDebt = ethers.parseEther("2000000");
      await contract.connect(user1).requestPrediction(
        HEALTHY_HF,
        highDebt,
        DEFAULT_COLLATERAL
      );

      const prediction = await contract.getPrediction(user1.address);
      expect(prediction.confidence).to.be.gte(90);
    });
  });

  describe("verifyDAProof - 验证 DA 证明", function () {
    beforeEach(async function () {
      await contract.connect(user1).requestPrediction(
        HEALTHY_HF,
        DEFAULT_DEBT,
        DEFAULT_COLLATERAL
      );
    });

    it("应返回已存储证明的有效性", async function () {
      const daProof = ethers.keccak256(ethers.toUtf8Bytes("test-proof"));

      await contract.updatePredictionWithProof(
        user1.address,
        5000,
        80,
        daProof
      );

      expect(await contract.verifyDAProof(daProof)).to.be.true;
    });

    it("应返回未存储证明为无效", async function () {
      const fakeProof = ethers.keccak256(ethers.toUtf8Bytes("fake-proof"));
      expect(await contract.verifyDAProof(fakeProof)).to.be.false;
    });
  });

  describe("lastRequests - 最后请求记录", function () {
    it("应正确存储最后请求", async function () {
      await contract.connect(user1).requestPrediction(
        HEALTHY_HF,
        DEFAULT_DEBT,
        DEFAULT_COLLATERAL
      );

      const lastRequest = await contract.lastRequests(user1.address);

      expect(lastRequest.healthFactor).to.equal(HEALTHY_HF);
      expect(lastRequest.totalDebt).to.equal(DEFAULT_DEBT);
      expect(lastRequest.totalCollateral).to.equal(DEFAULT_COLLATERAL);
      expect(lastRequest.user).to.equal(user1.address);
    });
  });
});
