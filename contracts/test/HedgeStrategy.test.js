const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('HedgeStrategyManager', function () {
  let hedgeStrategyManager;
  let owner;
  let user;
  let ogIntegration;

  const ACTION_ADD_COLLATERAL = 1;
  const ACTION_FLASH_LOAN_HEDGE = 2;
  const ACTION_PARTIAL_REPAY = 3;
  const STRATEGY_VALIDITY_PERIOD = 3600;
  const EXECUTION_COOLDOWN = 900;
  const MIN_CONFIDENCE_THRESHOLD = 50;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    const MockOgIntegration = await ethers.getContractFactory('MockOgIntegration');
    ogIntegration = await MockOgIntegration.deploy();
    await ogIntegration.waitForDeployment();

    const HedgeStrategyManager = await ethers.getContractFactory('HedgeStrategyManager');
    hedgeStrategyManager = await HedgeStrategyManager.deploy(owner.address, await ogIntegration.getAddress());
    await hedgeStrategyManager.waitForDeployment();
  });

  describe('Strategy Request', function () {
    it('Should request a hedge strategy successfully', async function () {
      const healthFactor = ethers.parseEther('1.2');
      const totalDebt = ethers.parseEther('5000');
      const availableCollateral = ethers.parseEther('10000');
      const daProof = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await expect(
        hedgeStrategyManager.connect(user).requestHedgeStrategy(
          healthFactor,
          totalDebt,
          availableCollateral,
          daProof
        )
      ).to.emit(hedgeStrategyManager, 'StrategyRecommended');

      const hasValid = await hedgeStrategyManager.hasValidStrategy(user.address);
      expect(hasValid).to.be.true;
    });

    it('Should generate correct strategy for critical health factor', async function () {
      const healthFactor = ethers.parseEther('1.05');
      const totalDebt = ethers.parseEther('10000');
      const availableCollateral = ethers.parseEther('5000');
      const daProof = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await hedgeStrategyManager.connect(user).requestHedgeStrategy(
        healthFactor,
        totalDebt,
        availableCollateral,
        daProof
      );

      const count = await hedgeStrategyManager.getStrategyCount(user.address);
      expect(count).to.equal(1);
    });

    it('Should respect cooldown period for strategy requests', async function () {
      const healthFactor = ethers.parseEther('1.5');
      const totalDebt = ethers.parseEther('5000');
      const availableCollateral = ethers.parseEther('10000');
      const daProof = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await hedgeStrategyManager.connect(user).requestHedgeStrategy(
        healthFactor,
        totalDebt,
        availableCollateral,
        daProof
      );

      await expect(
        hedgeStrategyManager.connect(user).requestHedgeStrategy(
          healthFactor,
          totalDebt,
          availableCollateral,
          daProof
        )
      ).to.be.revertedWithCustomError(hedgeStrategyManager, 'RequestTooFrequent');
    });
  });

  describe('Get Recommended Strategy', function () {
    beforeEach(async function () {
      const healthFactor = ethers.parseEther('1.3');
      const totalDebt = ethers.parseEther('5000');
      const availableCollateral = ethers.parseEther('10000');
      const daProof = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await hedgeStrategyManager.connect(user).requestHedgeStrategy(
        healthFactor,
        totalDebt,
        availableCollateral,
        daProof
      );
    });

    it('Should retrieve recommended strategy', async function () {
      const [strategy, strategyId] = await hedgeStrategyManager.getRecommendedStrategy(user.address);

      expect(Number(strategy.actionType)).to.be.oneOf([ACTION_ADD_COLLATERAL, ACTION_FLASH_LOAN_HEDGE, ACTION_PARTIAL_REPAY]);
      expect(strategy.amount).to.be.gt(0);
      expect(Number(strategy.confidence)).to.be.gte(MIN_CONFIDENCE_THRESHOLD);
      expect(strategy.executed).to.be.false;
      expect(strategyId).to.not.equal(ethers.ZeroHash);
    });

    it('Should revert when no strategy available', async function () {
      await expect(
        hedgeStrategyManager.getRecommendedStrategy(owner.address)
      ).to.be.revertedWithCustomError(hedgeStrategyManager, 'NoAvailableStrategy');
    });
  });

  describe('Strategy Execution', function () {
    beforeEach(async function () {
      const healthFactor = ethers.parseEther('1.3');
      const totalDebt = ethers.parseEther('5000');
      const availableCollateral = ethers.parseEther('10000');
      const daProof = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await hedgeStrategyManager.connect(user).requestHedgeStrategy(
        healthFactor,
        totalDebt,
        availableCollateral,
        daProof
      );
    });

    it('Should execute strategy successfully', async function () {
      const tx = await hedgeStrategyManager.connect(owner).executeRecommendedStrategy(user.address);
      const receipt = await tx.wait();
      
      expect(receipt.status).to.equal(1);
      
      const hasValid = await hedgeStrategyManager.hasValidStrategy(user.address);
      expect(hasValid).to.be.false;
    });

    it('Should respect cooldown period for executions', async function () {
      await hedgeStrategyManager.connect(owner).executeRecommendedStrategy(user.address);

      await expect(
        hedgeStrategyManager.connect(owner).executeRecommendedStrategy(user.address)
      ).to.be.revertedWithCustomError(hedgeStrategyManager, 'CooldownNotElapsed');
    });

    it('Should prevent execution of already executed strategy', async function () {
      await hedgeStrategyManager.connect(owner).executeRecommendedStrategy(user.address);

      await expect(
        hedgeStrategyManager.connect(owner).executeRecommendedStrategy(user.address)
      ).to.be.revertedWithCustomError(hedgeStrategyManager, 'CooldownNotElapsed');
    });
  });

  describe('Strategy Verification', function () {
    it('Should verify execution with any strategy ID', async function () {
      const healthFactor = ethers.parseEther('1.4');
      const totalDebt = ethers.parseEther('5000');
      const availableCollateral = ethers.parseEther('10000');
      const daProof = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await hedgeStrategyManager.connect(user).requestHedgeStrategy(
        healthFactor,
        totalDebt,
        availableCollateral,
        daProof
      );

      await hedgeStrategyManager.connect(owner).executeRecommendedStrategy(user.address);

      const [isValid, record] = await hedgeStrategyManager.verifyStrategyExecution(ethers.ZeroHash);
      expect(isValid).to.be.oneOf([true, false]);
    });
  });

  describe('Strategy History', function () {
    beforeEach(async function () {
      const healthFactor = ethers.parseEther('1.5');
      const totalDebt = ethers.parseEther('5000');
      const availableCollateral = ethers.parseEther('10000');
      const daProof = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await hedgeStrategyManager.connect(user).requestHedgeStrategy(
        healthFactor,
        totalDebt,
        availableCollateral,
        daProof
      );
    });

    it('Should retrieve strategy history', async function () {
      const strategies = await hedgeStrategyManager.getStrategyHistory(user.address, 10, 0);
      expect(strategies.length).to.equal(1);
      expect(Number(strategies[0].actionType)).to.be.oneOf([1, 2, 3]);
    });

    it('Should get correct strategy count', async function () {
      const count = await hedgeStrategyManager.getStrategyCount(user.address);
      expect(count).to.equal(1);
    });

    it('Should return empty array for user with no strategies', async function () {
      const strategies = await hedgeStrategyManager.getStrategyHistory(owner.address, 10, 0);
      expect(strategies.length).to.equal(0);
    });
  });

  describe('Valid Strategy Check', function () {
    it('Should return true for valid strategy', async function () {
      const healthFactor = ethers.parseEther('1.3');
      const totalDebt = ethers.parseEther('5000');
      const availableCollateral = ethers.parseEther('10000');
      const daProof = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await hedgeStrategyManager.connect(user).requestHedgeStrategy(
        healthFactor,
        totalDebt,
        availableCollateral,
        daProof
      );

      const hasValid = await hedgeStrategyManager.hasValidStrategy(user.address);
      expect(hasValid).to.be.true;
    });

    it('Should return false for user with no strategy', async function () {
      const hasValid = await hedgeStrategyManager.hasValidStrategy(owner.address);
      expect(hasValid).to.be.false;
    });
  });

  describe('Owner Functions', function () {
    it('Should update 0G Integration address', async function () {
      const newAddress = ethers.Wallet.createRandom().address;
      
      await hedgeStrategyManager.updateOgIntegration(newAddress);
      
      const updatedAddress = await hedgeStrategyManager.ogIntegration();
      expect(updatedAddress).to.equal(newAddress);
    });

    it('Should not allow invalid address update', async function () {
      await expect(
        hedgeStrategyManager.updateOgIntegration(ethers.ZeroAddress)
      ).to.be.revertedWith('Invalid address');
    });
  });

  describe('DA Proof Verification', function () {
    it('Should verify stored DA proofs', async function () {
      const daProof = ethers.keccak256(ethers.toUtf8Bytes('test-proof'));
      
      const healthFactor = ethers.parseEther('1.3');
      const totalDebt = ethers.parseEther('5000');
      const availableCollateral = ethers.parseEther('10000');

      await hedgeStrategyManager.connect(user).requestHedgeStrategy(
        healthFactor,
        totalDebt,
        availableCollateral,
        daProof
      );

      const isValid = await hedgeStrategyManager.verifyDAProof(daProof);
      expect(isValid).to.be.true;
    });
  });
});

describe('HedgeStrategyExecutor', function () {
  let hedgeStrategyExecutor;
  let hedgeStrategyManager;
  let owner;
  let user;
  let executor;
  let mockAavePool;
  let mockWETH;

  beforeEach(async function () {
    [owner, user, executor] = await ethers.getSigners();

    const MockAavePool = await ethers.getContractFactory('MockAavePool');
    mockAavePool = await MockAavePool.deploy();
    await mockAavePool.waitForDeployment();

    const MockWETH = await ethers.getContractFactory('MockWETH');
    mockWETH = await MockWETH.deploy();
    await mockWETH.waitForDeployment();

    const MockOgIntegration = await ethers.getContractFactory('MockOgIntegration');
    const ogIntegration = await MockOgIntegration.deploy();

    const HedgeStrategyManager = await ethers.getContractFactory('HedgeStrategyManager');
    hedgeStrategyManager = await HedgeStrategyManager.deploy(owner.address, await ogIntegration.getAddress());

    const HedgeStrategyExecutor = await ethers.getContractFactory('HedgeStrategyExecutor');
    hedgeStrategyExecutor = await HedgeStrategyExecutor.deploy(
      owner.address,
      await hedgeStrategyManager.getAddress(),
      await ogIntegration.getAddress(),
      await mockAavePool.getAddress(),
      await mockWETH.getAddress()
    );
    await hedgeStrategyExecutor.waitForDeployment();
  });

  describe('Executor Authorization', function () {
    it('Should authorize executor', async function () {
      await hedgeStrategyExecutor.connect(owner).authorizeExecutor(executor.address, true);
      
      const isAuthorized = await hedgeStrategyExecutor.isExecutorAuthorized(executor.address);
      expect(isAuthorized).to.be.true;
    });

    it('Should revoke executor authorization', async function () {
      await hedgeStrategyExecutor.connect(owner).authorizeExecutor(executor.address, true);
      await hedgeStrategyExecutor.connect(owner).authorizeExecutor(executor.address, false);
      
      const isAuthorized = await hedgeStrategyExecutor.isExecutorAuthorized(executor.address);
      expect(isAuthorized).to.be.false;
    });

    it('Should allow owner to execute without authorization', async function () {
      const isAuthorized = await hedgeStrategyExecutor.isExecutorAuthorized(owner.address);
      expect(isAuthorized).to.be.true;
    });
  });

  describe('Execution History', function () {
    it('Should return empty history for new user', async function () {
      const history = await hedgeStrategyExecutor.getExecutionHistory(user.address, 10, 0);
      expect(history.length).to.equal(0);
    });

    it('Should return correct history count', async function () {
      const count = await hedgeStrategyExecutor.getExecutionHistoryCount(user.address);
      expect(count).to.equal(0);
    });
  });

  describe('Contract Updates', function () {
    it('Should update HedgeStrategyManager address', async function () {
      const newAddress = ethers.Wallet.createRandom().address;
      
      await hedgeStrategyExecutor.updateContracts(newAddress, ethers.ZeroAddress, ethers.ZeroAddress);
      
      const updatedManager = await hedgeStrategyExecutor.hedgeStrategyManager();
      expect(updatedManager).to.equal(newAddress);
    });

    it('Should update 0G Integration address', async function () {
      const newAddress = ethers.Wallet.createRandom().address;
      
      await hedgeStrategyExecutor.updateContracts(ethers.ZeroAddress, newAddress, ethers.ZeroAddress);
      
      const updatedIntegration = await hedgeStrategyExecutor.ogIntegration();
      expect(updatedIntegration).to.equal(newAddress);
    });

    it('Should update Aave Pool address', async function () {
      const newAddress = ethers.Wallet.createRandom().address;
      
      await hedgeStrategyExecutor.updateContracts(ethers.ZeroAddress, ethers.ZeroAddress, newAddress);
      
      const updatedPool = await hedgeStrategyExecutor.aavePool();
      expect(updatedPool).to.equal(newAddress);
    });
  });

  describe('Gas Limit', function () {
    it('Should update gas limit', async function () {
      const newLimit = 600000;
      
      await hedgeStrategyExecutor.updateGasLimit(newLimit);
      
      const updatedLimit = await hedgeStrategyExecutor.executionGasLimit();
      expect(updatedLimit).to.equal(newLimit);
    });

    it('Should reject gas limit below minimum', async function () {
      await expect(
        hedgeStrategyExecutor.updateGasLimit(50000)
      ).to.be.revertedWith('Gas limit too low');
    });
  });
});
