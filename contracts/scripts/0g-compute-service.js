const { ethers } = require('ethers');

class ZeroGComputeService {
  constructor(config) {
    this.rpcUrl = config.rpcUrl || process.env.OG_TESTNET_RPC || 'https://evmrpc-testnet.0g.ai';
    this.wallet = config.privateKey ? new ethers.Wallet(config.privateKey) : null;
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    this.signer = this.wallet ? this.wallet.connect(this.provider) : null;
    
    this.config = {
      inferenceEndpoint: config.inferenceEndpoint || 'https://api.0g.ai/inference',
      modelVersion: config.modelVersion || 'liquidation-risk-v2.1',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3
    };
    
    this.sdk = null;
    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) {
      return { success: true, message: 'Already initialized' };
    }

    try {
      const { ComputeSDK } = require('@0gfoundation/0g-compute-ts-sdk');
      
      this.sdk = new ComputeSDK({
        rpcUrl: this.rpcUrl,
        signer: this.signer,
        inferenceEndpoint: this.config.inferenceEndpoint,
        modelVersion: this.config.modelVersion
      });

      await this.sdk.initialize();
      this._initialized = true;
      
      console.log('[0G Compute] Service initialized successfully');
      return { success: true, sdk: this.sdk };
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        console.warn('[0G Compute] SDK not found, using fallback mode');
        this._initialized = true;
        return { success: true, message: 'Initialized in fallback mode', sdk: null };
      }
      console.error('[0G Compute] Initialization error:', error.message);
      throw error;
    }
  }

  calculateRiskLevel(healthFactor, totalDebt, totalCollateral, marketVolatility) {
    const riskScore = this._calculateRiskScore(healthFactor, totalDebt, totalCollateral, marketVolatility);
    
    if (riskScore >= 0.8) {
      return {
        level: 'CRITICAL',
        color: 'red',
        action: 'IMMEDIATE_LIQUIDATION',
        threshold: 0.8
      };
    } else if (riskScore >= 0.6) {
      return {
        level: 'HIGH',
        color: 'orange',
        action: 'CLOSE_POSITION',
        threshold: 0.6
      };
    } else if (riskScore >= 0.4) {
      return {
        level: 'MEDIUM',
        color: 'yellow',
        action: 'ADD_COLLATERAL',
        threshold: 0.4
      };
    } else if (riskScore >= 0.2) {
      return {
        level: 'LOW',
        color: 'green',
        action: 'MONITOR',
        threshold: 0.2
      };
    } else {
      return {
        level: 'SAFE',
        color: 'blue',
        action: 'HOLD',
        threshold: 0.0
      };
    }
  }

  _calculateRiskScore(healthFactor, totalDebt, totalCollateral, marketVolatility) {
    const hfRisk = Math.max(0, 1 - healthFactor);
    const collateralRatio = totalCollateral > 0 ? totalDebt / totalCollateral : 1;
    const debtRisk = Math.min(1, collateralRatio);
    const volatilityRisk = Math.min(1, marketVolatility / 100);
    
    const weights = {
      healthFactor: 0.5,
      collateralRatio: 0.3,
      volatility: 0.2
    };
    
    return (hfRisk * weights.healthFactor) + 
           (debtRisk * weights.collateralRatio) + 
           (volatilityRisk * weights.volatility);
  }

  async predictLiquidationRisk(inputData) {
    const { healthFactor, totalDebt, totalCollateral, marketVolatility, userAddress } = inputData;

    if (healthFactor === undefined || totalDebt === undefined || totalCollateral === undefined) {
      throw new Error('Missing required parameters: healthFactor, totalDebt, totalCollateral');
    }

    console.log('[0G Compute] Calling prediction API...');
    console.log(`[0G Compute] Input - HF: ${healthFactor}, Debt: ${totalDebt}, Collateral: ${totalCollateral}`);

    try {
      let result;
      
      if (this.sdk) {
        result = await this._callSDKInference(inputData);
      } else {
        result = await this._fallbackInference(inputData);
      }

      const riskLevel = this.calculateRiskLevel(
        healthFactor,
        totalDebt,
        totalCollateral,
        marketVolatility || 30
      );

      const prediction = {
        userAddress: userAddress || 'unknown',
        probability: result.probability,
        confidence: result.confidence,
        riskLevel: riskLevel.level,
        riskAction: riskLevel.action,
        modelVersion: this.config.modelVersion,
        inputFeatures: {
          healthFactor,
          totalDebt,
          totalCollateral,
          marketVolatility: marketVolatility || 30
        },
        metadata: {
          timestamp: new Date().toISOString(),
          blockNumber: result.blockNumber || 0,
          provider: this.sdk ? '0G-Compute-SDK' : 'Fallback',
          inferenceId: result.inferenceId || this._generateInferenceId()
        }
      };

      console.log('[0G Compute] Prediction completed:', {
        probability: prediction.probability,
        riskLevel: prediction.riskLevel
      });

      return prediction;
    } catch (error) {
      console.error('[0G Compute] Prediction error:', error.message);
      throw new Error(`Liquidation risk prediction failed: ${error.message}`);
    }
  }

  async _callSDKInference(inputData) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Inference timeout')), this.config.timeout);
    });

    const inferencePromise = this.sdk.predict({
      model: 'liquidation-risk',
      inputs: {
        health_factor: inputData.healthFactor,
        total_debt: inputData.totalDebt,
        total_collateral: inputData.totalCollateral,
        market_volatility: inputData.marketVolatility || 30
      }
    });

    return Promise.race([inferencePromise, timeoutPromise]);
  }

  async _fallbackInference(inputData) {
    const { healthFactor, totalDebt, totalCollateral, marketVolatility } = inputData;
    
    const probability = Math.min(1, Math.max(0, 
      1 - healthFactor + (totalDebt / (totalCollateral || 1)) * 0.3 + 
      ((marketVolatility || 30) / 100) * 0.2
    ));

    const confidence = 0.85 + Math.random() * 0.1;
    
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    return {
      probability: parseFloat(probability.toFixed(4)),
      confidence: parseFloat(confidence.toFixed(4)),
      inferenceId: this._generateInferenceId()
    };
  }

  async getBalance(address = null) {
    try {
      const targetAddress = address || (this.signer ? await this.signer.getAddress() : null);
      
      if (!targetAddress) {
        throw new Error('No address provided and no signer configured');
      }

      const balance = await this.provider.getBalance(targetAddress);
      const formattedBalance = ethers.formatEther(balance);

      console.log(`[0G Compute] Balance for ${targetAddress}: ${formattedBalance} ETH`);

      return {
        address: targetAddress,
        balance: balance,
        formattedBalance: formattedBalance,
        symbol: 'ETH',
        blockNumber: result.blockNumber || 0
      };
    } catch (error) {
      console.error('[0G Compute] Get balance error:', error.message);
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  async _getBlockNumber() {
    try {
      return await this.provider.getBlockNumber();
    } catch {
      return 0;
    }
  }

  _generateInferenceId() {
    return `inf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async healthCheck() {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      const gasPrice = await this.provider.getGasPrice();
      
      return {
        status: 'healthy',
        provider: this.rpcUrl,
        blockNumber,
        gasPrice: ethers.formatUnits(gasPrice, 'gwei') + ' gwei',
        sdkInitialized: this._initialized,
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
  console.log('[0G Compute] Starting service test...');
  
  const config = {
    rpcUrl: process.env.OG_TESTNET_RPC || 'https://evmrpc-testnet.0g.ai',
    privateKey: process.env.DEPLOYER_KEY,
    inferenceEndpoint: 'https://api.0g.ai/inference',
    modelVersion: 'liquidation-risk-v2.1'
  };

  const computeService = new ZeroGComputeService(config);
  
  await computeService.initialize();
  
  const health = await computeService.healthCheck();
  console.log('[0G Compute] Health check:', health);

  const testPrediction = await computeService.predictLiquidationRisk({
    healthFactor: 1.5,
    totalDebt: 5000,
    totalCollateral: 10000,
    marketVolatility: 35,
    userAddress: '0x1234567890123456789012345678901234567890'
  });
  
  console.log('[0G Compute] Test prediction:', JSON.stringify(testPrediction, null, 2));

  const riskLevel = computeService.calculateRiskLevel(1.5, 5000, 10000, 35);
  console.log('[0G Compute] Risk level calculation:', riskLevel);

  if (config.privateKey) {
    const balance = await computeService.getBalance();
    console.log('[0G Compute] Wallet balance:', balance);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('[0G Compute] Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[0G Compute] Test failed:', error);
      process.exit(1);
    });
}

module.exports = { ZeroGComputeService };
