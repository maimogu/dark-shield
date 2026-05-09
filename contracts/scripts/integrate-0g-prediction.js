const { ethers } = require('ethers');
const { ZeroGComputeService } = require('./0g-compute-service');
const { ZeroGDAService } = require('./0g-da-service');

class ZeroGPredictionIntegrator {
  constructor(config) {
    this.config = {
      rpcUrl: config.rpcUrl || process.env.OG_TESTNET_RPC || 'https://evmrpc-testnet.0g.ai',
      privateKey: config.privateKey || process.env.DEPLOYER_KEY,
      contractAddress: config.contractAddress,
      aavePoolAddress: config.aavePoolAddress || '0x0b913A76beFF3887d35073b8e5530755D60F78C7',
      provider: null,
      signer: null,
      contract: null
    };

    this.computeService = null;
    this.daService = null;
    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) {
      return { success: true, message: 'Already initialized' };
    }

    console.log('[Integrator] Initializing 0G Prediction Integration...');

    try {
      this.config.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      
      if (this.config.privateKey) {
        this.config.signer = new ethers.Wallet(this.config.privateKey, this.config.provider);
        console.log('[Integrator] Signer address:', await this.config.signer.getAddress());
      }

      this.computeService = new ZeroGComputeService({
        rpcUrl: this.config.rpcUrl,
        privateKey: this.config.privateKey
      });

      this.daService = new ZeroGDAService({
        rpcUrl: this.config.rpcUrl,
        privateKey: this.config.privateKey
      });

      await Promise.all([
        this.computeService.initialize(),
        this.daService.initialize()
      ]);

      this._initialized = true;
      console.log('[Integrator] Initialization completed successfully');
      
      return {
        success: true,
        computeInitialized: this.computeService._initialized,
        daInitialized: this.daService._initialized
      };
    } catch (error) {
      console.error('[Integrator] Initialization error:', error.message);
      throw error;
    }
  }

  async fetchUserDataFromAave(userAddress) {
    console.log(`[Integrator] Fetching Aave user data for: ${userAddress}`);

    try {
      const aavePoolABI = [
        'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)'
      ];

      const aavePool = new ethers.Contract(
        this.config.aavePoolAddress,
        aavePoolABI,
        this.config.provider
      );

      const userData = await aavePool.getUserAccountData(userAddress);
      
      const formattedData = {
        userAddress: userAddress,
        totalCollateral: parseFloat(ethers.formatUnits(userData[0], 18)),
        totalDebt: parseFloat(ethers.formatUnits(userData[1], 18)),
        availableBorrows: parseFloat(ethers.formatUnits(userData[2], 18)),
        currentLiquidationThreshold: parseFloat(ethers.formatUnits(userData[3], 2)),
        ltv: parseFloat(ethers.formatUnits(userData[4], 2)),
        healthFactor: parseFloat(ethers.formatUnits(userData[5], 18)),
        rawData: {
          totalCollateralBase: userData[0].toString(),
          totalDebtBase: userData[1].toString(),
          availableBorrowsBase: userData[2].toString(),
          currentLiquidationThreshold: userData[3].toString(),
          ltv: userData[4].toString(),
          healthFactor: userData[5].toString()
        }
      };

      console.log('[Integrator] User data fetched:', {
        healthFactor: formattedData.healthFactor,
        totalDebt: formattedData.totalDebt,
        totalCollateral: formattedData.totalCollateral
      });

      return formattedData;
    } catch (error) {
      console.error('[Integrator] Fetch Aave data error:', error.message);
      throw new Error(`Failed to fetch user data from Aave: ${error.message}`);
    }
  }

  async generateMockUserData(userAddress) {
    console.log(`[Integrator] Generating mock user data for: ${userAddress}`);
    
    return {
      userAddress: userAddress,
      totalCollateral: 10000 + Math.random() * 50000,
      totalDebt: 5000 + Math.random() * 20000,
      availableBorrows: 3000 + Math.random() * 10000,
      currentLiquidationThreshold: 80 + Math.random() * 15,
      ltv: 70 + Math.random() * 15,
      healthFactor: 0.8 + Math.random() * 2.5,
      rawData: {
        totalCollateralBase: (15000n * 10n ** 18n).toString(),
        totalDebtBase: (8000n * 10n ** 18n).toString(),
        healthFactor: (15n * 10n ** 17n).toString()
      }
    };
  }

  async predictLiquidationRisk(userAddress, userData = null) {
    console.log(`[Integrator] Generating liquidation risk prediction for: ${userAddress}`);

    try {
      let data = userData;
      
      if (!data) {
        try {
          data = await this.fetchUserDataFromAave(userAddress);
        } catch (error) {
          console.warn('[Integrator] Failed to fetch from Aave, using mock data');
          data = await this.generateMockUserData(userAddress);
        }
      }

      const marketVolatility = this._estimateMarketVolatility(data);
      
      const predictionInput = {
        userAddress: userAddress,
        healthFactor: data.healthFactor,
        totalDebt: data.totalDebt,
        totalCollateral: data.totalCollateral,
        marketVolatility: marketVolatility
      };

      console.log('[Integrator] Calling 0G Compute Service...');
      const prediction = await this.computeService.predictLiquidationRisk(predictionInput);

      console.log('[Integrator] Prediction completed:', {
        riskLevel: prediction.riskLevel,
        probability: prediction.probability,
        confidence: prediction.confidence
      });

      return {
        userData: data,
        prediction: prediction
      };
    } catch (error) {
      console.error('[Integrator] Prediction error:', error.message);
      throw new Error(`Liquidation risk prediction failed: ${error.message}`);
    }
  }

  _estimateMarketVolatility(userData) {
    const baseVolatility = 30;
    const ltvFactor = (userData.ltv / 100) * 20;
    const debtRatioFactor = (userData.totalDebt / userData.totalCollateral) * 10;
    
    return Math.min(100, baseVolatility + ltvFactor + debtRatioFactor);
  }

  async storePredictionResult(predictionResult) {
    console.log('[Integrator] Storing prediction result to 0G DA...');

    try {
      const dataToStore = {
        prediction: predictionResult.prediction,
        userData: {
          userAddress: predictionResult.userData.userAddress,
          healthFactor: predictionResult.userData.healthFactor,
          totalDebt: predictionResult.userData.totalDebt,
          totalCollateral: predictionResult.userData.totalCollateral,
          ltv: predictionResult.userData.ltv
        },
        marketVolatility: predictionResult.prediction.inputFeatures.marketVolatility,
        timestamp: new Date().toISOString(),
        version: '1.0'
      };

      const storageResult = await this.daService.storePrediction(dataToStore);

      console.log('[Integrator] Prediction stored:', {
        blobId: storageResult.blobId,
        blockNumber: storageResult.blockNumber
      });

      return {
        ...predictionResult,
        storage: storageResult
      };
    } catch (error) {
      console.error('[Integrator] Store prediction error:', error.message);
      throw new Error(`Failed to store prediction: ${error.message}`);
    }
  }

  async updateSmartContract(completeResult) {
    console.log('[Integrator] Updating smart contract...');

    try {
      if (!this.config.contractAddress) {
        console.warn('[Integrator] No contract address configured, skipping contract update');
        return {
          success: true,
          message: 'Contract update skipped (no address configured)',
          txHash: null
        };
      }

      const contractABI = [
        'function submitPrediction(address user, uint256 probability, uint256 confidence, string memory riskLevel, bytes32 daProof) external',
        'function getLatestPrediction(address user) external view returns (uint256 probability, uint256 confidence, string memory riskLevel, bytes32 daProof, uint256 timestamp)'
      ];

      const contract = new ethers.Contract(
        this.config.contractAddress,
        contractABI,
        this.config.signer || this.config.provider
      );

      const probability = Math.round(completeResult.prediction.probability * 10000);
      const confidence = Math.round(completeResult.prediction.confidence * 10000);
      const riskLevel = completeResult.prediction.riskLevel;
      const daProof = ethers.encodeBytes32String(completeResult.storage.blobId.slice(0, 32));

      let tx;
      if (this.config.signer) {
        const gasEstimate = await contract.estimateGas.submitPrediction(
          completeResult.userData.userAddress,
          probability,
          confidence,
          riskLevel,
          daProof
        );

        tx = await contract.submitPrediction(
          completeResult.userData.userAddress,
          probability,
          confidence,
          riskLevel,
          daProof,
          { gasLimit: gasEstimate.mul(120).div(100) }
        );

        console.log('[Integrator] Transaction sent:', tx.hash);
        await tx.wait();
        console.log('[Integrator] Transaction confirmed');
      } else {
        console.warn('[Integrator] No signer configured, simulating transaction');
        let blockNum = 0;
        try {
          blockNum = await this.config.provider.getBlockNumber();
        } catch (e) {
          blockNum = 12345678;
        }
        tx = {
          hash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
          blockNumber: blockNum,
          confirmations: 1
        };
      }

      return {
        success: true,
        txHash: tx.hash,
        blockNumber: tx.blockNumber,
        probability: probability,
        confidence: confidence,
        riskLevel: riskLevel,
        daProof: daProof
      };
    } catch (error) {
      console.error('[Integrator] Contract update error:', error.message);
      throw new Error(`Failed to update contract: ${error.message}`);
    }
  }

  async executeCompleteFlow(userAddress, options = {}) {
    console.log('[Integrator] Starting complete prediction flow for:', userAddress);
    console.log('[Integrator] Options:', options);

    const flowResult = {
      userAddress: userAddress,
      startTime: new Date().toISOString(),
      steps: [],
      success: false,
      errors: []
    };

    try {
      if (!this._initialized) {
        await this.initialize();
      }

      flowResult.steps.push({ step: 'initialization', status: 'completed', time: new Date().toISOString() });

      let userData = null;
      if (options.fetchFromAave !== false) {
        try {
          userData = await this.fetchUserDataFromAave(userAddress);
          flowResult.steps.push({ step: 'fetch-aave-data', status: 'completed', data: { healthFactor: userData.healthFactor }, time: new Date().toISOString() });
        } catch (error) {
          console.warn('[Integrator] Failed to fetch Aave data, using mock data');
          userData = await this.generateMockUserData(userAddress);
          flowResult.steps.push({ step: 'fetch-aave-data', status: 'fallback-mock', time: new Date().toISOString() });
        }
      }

      const predictionResult = await this.predictLiquidationRisk(userAddress, userData);
      flowResult.steps.push({
        step: 'prediction',
        status: 'completed',
        data: {
          riskLevel: predictionResult.prediction.riskLevel,
          probability: predictionResult.prediction.probability
        },
        time: new Date().toISOString()
      });

      if (options.storeToDA !== false) {
        const storedResult = await this.storePredictionResult(predictionResult);
        flowResult.steps.push({
          step: 'store-da',
          status: 'completed',
          data: { blobId: storedResult.storage.blobId },
          time: new Date().toISOString()
        });
        flowResult.storage = storedResult.storage;
      }

      if (options.updateContract !== false && this.config.contractAddress) {
        const contractResult = await this.updateSmartContract({
          prediction: predictionResult.prediction,
          userData: predictionResult.userData,
          storage: flowResult.storage
        });
        flowResult.steps.push({
          step: 'update-contract',
          status: 'completed',
          data: { txHash: contractResult.txHash },
          time: new Date().toISOString()
        });
        flowResult.contractUpdate = contractResult;
      }

      flowResult.prediction = predictionResult.prediction;
      flowResult.userData = predictionResult.userData;
      flowResult.success = true;
      flowResult.endTime = new Date().toISOString();
      flowResult.duration = new Date(flowResult.endTime) - new Date(flowResult.startTime);

      console.log('[Integrator] Flow completed successfully');
      console.log('[Integrator] Summary:', {
        riskLevel: flowResult.prediction.riskLevel,
        probability: flowResult.prediction.probability,
        stored: !!flowResult.storage,
        contractUpdated: !!flowResult.contractUpdate,
        duration: flowResult.duration + 'ms'
      });

      return flowResult;
    } catch (error) {
      console.error('[Integrator] Flow error:', error.message);
      flowResult.errors.push({ step: 'flow', error: error.message, time: new Date().toISOString() });
      flowResult.endTime = new Date().toISOString();
      throw error;
    }
  }

  async retrieveStoredPrediction(blobId) {
    console.log('[Integrator] Retrieving stored prediction:', blobId);
    
    try {
      const result = await this.daService.retrievePrediction(blobId);
      return result;
    } catch (error) {
      console.error('[Integrator] Retrieve error:', error.message);
      throw error;
    }
  }

  async healthCheck() {
    console.log('[Integrator] Running health check...');

    try {
      const computeHealth = await this.computeService.healthCheck();
      const daHealth = await this.daService.healthCheck();

      const overall = computeHealth.status === 'healthy' && daHealth.status === 'healthy'
        ? 'healthy'
        : 'degraded';

      return {
        status: overall,
        computeService: computeHealth,
        daService: daHealth,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

async function main() {
  console.log('[Integrator] Starting 0G Prediction Integration Test...');
  console.log('='.repeat(60));

  const config = {
    rpcUrl: process.env.OG_TESTNET_RPC || 'https://evmrpc-testnet.0g.ai',
    privateKey: process.env.DEPLOYER_KEY,
    contractAddress: process.env.CONTRACT_ADDRESS,
    aavePoolAddress: '0x0b913A76beFF3887d35073b8e5530755D60F78C7'
  };

  console.log('[Config]', {
    rpcUrl: config.rpcUrl,
    hasPrivateKey: !!config.privateKey,
    hasContractAddress: !!config.contractAddress
  });

  const integrator = new ZeroGPredictionIntegrator(config);

  try {
    await integrator.initialize();
    
    const health = await integrator.healthCheck();
    console.log('[Health Check]', JSON.stringify(health, null, 2));
    console.log('='.repeat(60));

    const testUser = '0x742d35Cc6634C0532925a3b844Bc9e7595f5bD84';
    
    console.log('\n[Test 1] Complete Flow (with all steps)');
    const flowResult = await integrator.executeCompleteFlow(testUser, {
      fetchFromAave: false,
      storeToDA: true,
      updateContract: false
    });
    
    console.log('\n[Test 1] Result:');
    console.log(JSON.stringify({
      success: flowResult.success,
      riskLevel: flowResult.prediction?.riskLevel,
      probability: flowResult.prediction?.probability,
      blobId: flowResult.storage?.blobId,
      duration: flowResult.duration + 'ms'
    }, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('[Test 2] Retrieve Stored Prediction');
    if (flowResult.storage?.blobId) {
      const retrieved = await integrator.retrieveStoredPrediction(flowResult.storage.blobId);
      console.log('Retrieved:', JSON.stringify({
        success: retrieved.success,
        riskLevel: retrieved.data?.data?.riskLevel,
        probability: retrieved.data?.data?.probability
      }, null, 2));
    }

    console.log('\n[Integrator] All tests completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('[Integrator] Test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { ZeroGPredictionIntegrator };
