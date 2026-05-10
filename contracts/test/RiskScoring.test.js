const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Risk Scoring System", function () {
  let ogIntegration;
  let owner;
  let user1;
  let user2;
  let users;

  const SCORE_UPDATE_INTERVAL = 3600;

  beforeEach(async function () {
    [owner, user1, user2, ...users] = await ethers.getSigners();

    const OgIntegration = await ethers.getContractFactory("OgIntegration");
    ogIntegration = await OgIntegration.deploy(owner.address);
    await ogIntegration.waitForDeployment();
  });

  describe("RiskScore Data Structure", function () {
    it("should initialize with correct default values", async function () {
      expect(await ogIntegration.scoreUpdateInterval()).to.equal(SCORE_UPDATE_INTERVAL);
      expect(await ogIntegration.MAX_BATCH_SIZE()).to.equal(10);
      expect(await ogIntegration.MAX_HISTORY_LENGTH()).to.equal(100);
    });

    it("should have correct constant values", async function () {
      expect(await ogIntegration.RISK_LEVEL_LOW()).to.equal(0);
      expect(await ogIntegration.RISK_LEVEL_MEDIUM()).to.equal(1);
      expect(await ogIntegration.RISK_LEVEL_HIGH()).to.equal(2);
      expect(await ogIntegration.RISK_LEVEL_CRITICAL()).to.equal(3);
    });
  });

  describe("calculateRiskScore", function () {
    it("should calculate risk score for user without history", async function () {
      const healthFactor = ethers.parseEther("1.5");
      const debtRatio = 4000;
      const volatility = 30;
      const behavioralPatterns = ethers.keccak256(ethers.toUtf8Bytes("pattern1"));

      const tx = await ogIntegration.calculateRiskScore(
        user1.address,
        healthFactor,
        debtRatio,
        volatility,
        behavioralPatterns
      );
      await tx.wait();

      const riskScore = await ogIntegration.riskScores(user1.address);
      expect(riskScore.score).to.be.greaterThan(0);
      expect(riskScore.score).to.be.lessThanOrEqual(100);
      expect(riskScore.timestamp).to.be.greaterThan(0);
    });

    it("should store risk score with DA proof", async function () {
      const healthFactor = ethers.parseEther("2.0");
      const debtRatio = 2000;
      const volatility = 20;
      const behavioralPatterns = ethers.ZeroHash;

      const tx = await ogIntegration.calculateRiskScore(
        user1.address,
        healthFactor,
        debtRatio,
        volatility,
        behavioralPatterns
      );
      await tx.wait();

      const riskScore = await ogIntegration.riskScores(user1.address);
      expect(riskScore.daProof).to.not.equal(ethers.ZeroHash);
      expect(riskScore.score).to.be.greaterThan(0);
      expect(riskScore.timestamp).to.be.greaterThan(0);
    });

    it("should record prediction to history", async function () {
      const healthFactor = ethers.parseEther("1.3");
      const debtRatio = 5000;
      const volatility = 40;
      const behavioralPatterns = ethers.keccak256(ethers.toUtf8Bytes("pattern2"));

      await ogIntegration.calculateRiskScore(
        user1.address,
        healthFactor,
        debtRatio,
        volatility,
        behavioralPatterns
      );

      const historyCount = await ogIntegration.getHistoricalPredictionCount(user1.address);
      expect(historyCount).to.equal(1);

      const history = await ogIntegration.getHistoricalRiskData(user1.address, 10, 0);
      expect(history.length).to.equal(1);
      expect(history[0].healthFactor).to.equal(healthFactor);
    });

    it("should emit RiskScoreCalculated event", async function () {
      const healthFactor = ethers.parseEther("1.8");
      const debtRatio = 3000;
      const volatility = 25;
      const behavioralPatterns = ethers.keccak256(ethers.toUtf8Bytes("pattern3"));

      const tx = await ogIntegration.calculateRiskScore(
        user1.address,
        healthFactor,
        debtRatio,
        volatility,
        behavioralPatterns
      );
      await tx.wait();

      await expect(tx).to.emit(ogIntegration, "RiskScoreCalculated");
    });

    it("should enforce update frequency limit", async function () {
      const healthFactor = ethers.parseEther("1.5");
      const debtRatio = 4000;
      const volatility = 30;
      const behavioralPatterns = ethers.ZeroHash;

      await ogIntegration.calculateRiskScore(
        user1.address,
        healthFactor,
        debtRatio,
        volatility,
        behavioralPatterns
      );

      await expect(
        ogIntegration.calculateRiskScore(
          user1.address,
          healthFactor,
          debtRatio,
          volatility,
          behavioralPatterns
        )
      ).to.be.revertedWithCustomError(ogIntegration, "UpdateFrequencyExceeded");
    });

    it("should allow update after interval passes", async function () {
      const healthFactor = ethers.parseEther("1.5");
      const debtRatio = 4000;
      const volatility = 30;
      const behavioralPatterns = ethers.ZeroHash;

      await ogIntegration.calculateRiskScore(
        user1.address,
        healthFactor,
        debtRatio,
        volatility,
        behavioralPatterns
      );

      await time.increase(SCORE_UPDATE_INTERVAL + 1);

      const newScore = await ogIntegration.calculateRiskScore.staticCall(
        user1.address,
        healthFactor,
        debtRatio,
        volatility,
        behavioralPatterns
      );

      expect(newScore).to.be.greaterThan(0);
    });

    it("should update lastScoreUpdate timestamp", async function () {
      const healthFactor = ethers.parseEther("1.4");
      const debtRatio = 4500;
      const volatility = 35;
      const behavioralPatterns = ethers.keccak256(ethers.toUtf8Bytes("pattern4"));

      await ogIntegration.calculateRiskScore(
        user1.address,
        healthFactor,
        debtRatio,
        volatility,
        behavioralPatterns
      );

      const lastUpdate = await ogIntegration.lastScoreUpdate(user1.address);
      expect(lastUpdate).to.be.greaterThan(0);

      const blockNum = await ethers.provider.getBlockNumber();
      const block = await ethers.provider.getBlock(blockNum);
      expect(lastUpdate).to.equal(block.timestamp);
    });
  });

  describe("batchCalculateRiskScore", function () {
    it("should batch calculate risk scores for multiple users", async function () {
      const testUsers = [user1.address, user2.address];
      const healthFactors = [ethers.parseEther("1.5"), ethers.parseEther("1.8")];
      const debtRatios = [4000, 2500];
      const volatilities = [30, 20];
      const patterns = [ethers.ZeroHash, ethers.ZeroHash];

      const scores = await ogIntegration.batchCalculateRiskScore.staticCall(
        testUsers,
        healthFactors,
        debtRatios,
        volatilities,
        patterns
      );

      expect(scores.length).to.equal(2);
      expect(scores[0]).to.be.greaterThan(0);
      expect(scores[1]).to.be.greaterThan(0);
    });

    it("should emit BatchRiskScoreCalculated event", async function () {
      const testUsers = [user1.address];
      const healthFactors = [ethers.parseEther("1.5")];
      const debtRatios = [4000];
      const volatilities = [30];
      const patterns = [ethers.ZeroHash];

      const tx = await ogIntegration.batchCalculateRiskScore(
        testUsers,
        healthFactors,
        debtRatios,
        volatilities,
        patterns
      );
      await tx.wait();

      await expect(tx).to.emit(ogIntegration, "BatchRiskScoreCalculated");
    });

    it("should reject batch exceeding max size", async function () {
      const testUsers = Array(11).fill(user1.address);
      const healthFactors = Array(11).fill(ethers.parseEther("1.5"));
      const debtRatios = Array(11).fill(4000);
      const volatilities = Array(11).fill(30);
      const patterns = Array(11).fill(ethers.ZeroHash);

      await expect(
        ogIntegration.batchCalculateRiskScore(
          testUsers,
          healthFactors,
          debtRatios,
          volatilities,
          patterns
        )
      ).to.be.revertedWithCustomError(ogIntegration, "BatchSizeExceeded");
    });

    it("should reject mismatched array lengths", async function () {
      const testUsers = Array(2).fill(user1.address);
      const healthFactors = [ethers.parseEther("1.5")];
      const debtRatios = [4000, 3000];
      const volatilities = [30, 25];
      const patterns = Array(2).fill(ethers.ZeroHash);

      await expect(
        ogIntegration.batchCalculateRiskScore(
          testUsers,
          healthFactors,
          debtRatios,
          volatilities,
          patterns
        )
      ).to.be.revertedWithCustomError(ogIntegration, "InvalidArrayLength");
    });

    it("should return existing scores for users within rate limit", async function () {
      const healthFactor = ethers.parseEther("1.5");
      const debtRatio = 4000;
      const volatility = 30;
      const behavioralPatterns = ethers.ZeroHash;

      const tx1 = await ogIntegration.calculateRiskScore(
        user1.address,
        healthFactor,
        debtRatio,
        volatility,
        behavioralPatterns
      );
      await tx1.wait();

      const initialScore = (await ogIntegration.riskScores(user1.address)).score;

      const testUsers = [user1.address];
      const healthFactors = [ethers.parseEther("2.0")];
      const debtRatios = [2000];
      const volatilities = [10];
      const patterns = [ethers.ZeroHash];

      const scores = await ogIntegration.batchCalculateRiskScore.staticCall(
        testUsers,
        healthFactors,
        debtRatios,
        volatilities,
        patterns
      );

      expect(scores[0]).to.equal(initialScore);
    });

    it("should handle max batch size correctly", async function () {
      const testUsers = Array(10).fill(owner.address);
      const healthFactors = Array(10).fill(ethers.parseEther("1.5"));
      const debtRatios = Array(10).fill(4000);
      const volatilities = Array(10).fill(30);
      const patterns = Array(10).fill(ethers.ZeroHash);

      const scores = await ogIntegration.batchCalculateRiskScore.staticCall(
        testUsers,
        healthFactors,
        debtRatios,
        volatilities,
        patterns
      );

      expect(scores.length).to.equal(10);
      expect(scores[0]).to.be.greaterThan(0);
    });
  });

  describe("getHistoricalRiskData", function () {
    it("should retrieve historical predictions", async function () {
      const healthFactor = ethers.parseEther("1.5");
      const debtRatio = 4000;
      const volatility = 30;
      const behavioralPatterns = ethers.ZeroHash;

      for (let i = 0; i < 3; i++) {
        await ogIntegration.calculateRiskScore(
          user1.address,
          healthFactor,
          debtRatio,
          volatility,
          behavioralPatterns
        );
        await time.increase(SCORE_UPDATE_INTERVAL + 1);
      }

      const history = await ogIntegration.getHistoricalRiskData(user1.address, 10, 0);
      expect(history.length).to.equal(3);
    });

    it("should respect limit and offset parameters", async function () {
      const healthFactor = ethers.parseEther("1.5");
      const debtRatio = 4000;
      const volatility = 30;
      const behavioralPatterns = ethers.ZeroHash;

      for (let i = 0; i < 5; i++) {
        await ogIntegration.calculateRiskScore(
          user1.address,
          healthFactor,
          debtRatio,
          volatility,
          behavioralPatterns
        );
        await time.increase(SCORE_UPDATE_INTERVAL + 1);
      }

      const history = await ogIntegration.getHistoricalRiskData(user1.address, 2, 1);
      expect(history.length).to.equal(2);
    });

    it("should revert for user without history", async function () {
      await expect(
        ogIntegration.getHistoricalRiskData(user2.address, 10, 0)
      ).to.be.revertedWithCustomError(ogIntegration, "NoHistoricalData");
    });

    it("should handle offset exceeding history length", async function () {
      const healthFactor = ethers.parseEther("1.5");
      const debtRatio = 4000;
      const volatility = 30;
      const behavioralPatterns = ethers.ZeroHash;

      await ogIntegration.calculateRiskScore(
        user1.address,
        healthFactor,
        debtRatio,
        volatility,
        behavioralPatterns
      );

      const history = await ogIntegration.getHistoricalRiskData(user1.address, 10, 100);
      expect(history.length).to.equal(0);
    });
  });

  describe("getRiskScoreDetails", function () {
    it("should return complete risk score details", async function () {
      const healthFactor = ethers.parseEther("1.6");
      const debtRatio = 3500;
      const volatility = 28;
      const behavioralPatterns = ethers.keccak256(ethers.toUtf8Bytes("pattern5"));

      await ogIntegration.calculateRiskScore(
        user1.address,
        healthFactor,
        debtRatio,
        volatility,
        behavioralPatterns
      );

      const details = await ogIntegration.getRiskScoreDetails(user1.address);

      expect(details.score).to.be.greaterThan(0);
      expect(details.factors.length).to.equal(5);
      expect(details.daProof).to.not.equal(ethers.ZeroHash);
      expect(details.timestamp).to.be.greaterThan(0);
      expect(details.historicalWeight).to.be.greaterThanOrEqual(0);
    });

    it("should revert for user without score", async function () {
      await expect(
        ogIntegration.getRiskScoreDetails(user2.address)
      ).to.be.revertedWithCustomError(ogIntegration, "PredictionNotAvailable");
    });
  });

  describe("updateScoreUpdateInterval", function () {
    it("should allow owner to update interval", async function () {
      const newInterval = 7200;

      await expect(
        ogIntegration.updateScoreUpdateInterval(newInterval)
      )
        .to.emit(ogIntegration, "ScoreUpdateIntervalChanged")
        .withArgs(SCORE_UPDATE_INTERVAL, newInterval);

      expect(await ogIntegration.scoreUpdateInterval()).to.equal(newInterval);
    });

    it("should reject non-owner update", async function () {
      await expect(
        ogIntegration.connect(user1).updateScoreUpdateInterval(7200)
      ).to.be.revertedWithCustomError(ogIntegration, "OwnableUnauthorizedAccount");
    });
  });

  describe("verifyRiskScoreProof", function () {
    it("should verify valid risk score proof", async function () {
      const healthFactor = ethers.parseEther("1.7");
      const debtRatio = 3200;
      const volatility = 25;
      const behavioralPatterns = ethers.ZeroHash;

      await ogIntegration.calculateRiskScore(
        user1.address,
        healthFactor,
        debtRatio,
        volatility,
        behavioralPatterns
      );

      const isValid = await ogIntegration.verifyRiskScoreProof(user1.address);
      expect(isValid).to.equal(true);
    });

    it("should return false for user without score", async function () {
      const isValid = await ogIntegration.verifyRiskScoreProof(user2.address);
      expect(isValid).to.equal(false);
    });
  });

  describe("recordPrediction", function () {
    it("should record prediction to history", async function () {
      const probability = 4500;
      const healthFactor = ethers.parseEther("1.2");

      await ogIntegration.recordPrediction(user1.address, probability, healthFactor);

      const count = await ogIntegration.getHistoricalPredictionCount(user1.address);
      expect(count).to.equal(1);

      const history = await ogIntegration.getHistoricalRiskData(user1.address, 1, 0);
      expect(history[0].probability).to.equal(probability);
      expect(history[0].healthFactor).to.equal(healthFactor);
    });

    it("should handle multiple predictions", async function () {
      const predictions = [
        { probability: 3000, healthFactor: ethers.parseEther("1.8") },
        { probability: 4000, healthFactor: ethers.parseEther("1.5") },
        { probability: 5000, healthFactor: ethers.parseEther("1.2") }
      ];

      for (const pred of predictions) {
        await ogIntegration.recordPrediction(user1.address, pred.probability, pred.healthFactor);
      }

      const count = await ogIntegration.getHistoricalPredictionCount(user1.address);
      expect(count).to.equal(3);
    });
  });

  describe("Integration with DA Proofs", function () {
    it("should store DA proof for risk score", async function () {
      const healthFactor = ethers.parseEther("1.5");
      const debtRatio = 4000;
      const volatility = 30;
      const behavioralPatterns = ethers.ZeroHash;

      await ogIntegration.calculateRiskScore(
        user1.address,
        healthFactor,
        debtRatio,
        volatility,
        behavioralPatterns
      );

      const riskScore = await ogIntegration.riskScores(user1.address);
      const isValidProof = await ogIntegration.verifyDAProof(riskScore.daProof);
      expect(isValidProof).to.equal(true);
    });
  });

  describe("Score Calculation Factors", function () {
    it("should produce lower scores for healthy positions", async function () {
      const healthyHF = ethers.parseEther("2.5");
      const lowDebtRatio = 1500;
      const lowVolatility = 10;
      const behavioralPatterns = ethers.ZeroHash;

      const healthyScore = await ogIntegration.calculateRiskScore.staticCall(
        user1.address,
        healthyHF,
        lowDebtRatio,
        lowVolatility,
        behavioralPatterns
      );

      const riskyHF = ethers.parseEther("1.1");
      const highDebtRatio = 8500;
      const highVolatility = 90;
      const riskyScore = await ogIntegration.calculateRiskScore.staticCall(
        user2.address,
        riskyHF,
        highDebtRatio,
        highVolatility,
        behavioralPatterns
      );

      expect(healthyScore).to.be.lessThan(riskyScore);
    });

    it("should consider historical data in score", async function () {
      const healthFactor = ethers.parseEther("1.5");
      const debtRatio = 4000;
      const volatility = 30;
      const behavioralPatterns = ethers.ZeroHash;

      await ogIntegration.recordPrediction(user1.address, 3000, ethers.parseEther("2.0"));
      await ogIntegration.recordPrediction(user1.address, 3500, ethers.parseEther("1.8"));
      await ogIntegration.recordPrediction(user1.address, 4000, ethers.parseEther("1.5"));

      const scoreWithHistory = await ogIntegration.calculateRiskScore(
        user1.address,
        healthFactor,
        debtRatio,
        volatility,
        behavioralPatterns
      );

      const riskScore = await ogIntegration.riskScores(user1.address);
      expect(riskScore.historicalWeight).to.be.greaterThan(0);
    });
  });
});
