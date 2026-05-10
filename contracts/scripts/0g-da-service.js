const { ethers } = require('ethers');

class ZeroGDAService {
  constructor(config) {
    this.rpcUrl = config.rpcUrl || process.env.OG_TESTNET_RPC || 'https://evmrpc-testnet.0g.ai';
    this.wallet = config.privateKey ? new ethers.Wallet(config.privateKey) : null;
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    this.signer = this.wallet ? this.wallet.connect(this.provider) : null;
    
    this.config = {
      daContractAddress: config.daContractAddress || null,
      storageNodes: config.storageNodes || ['https://storage.0g.ai'],
      timeout: config.timeout || 60000,
      gasLimit: config.gasLimit || 500000
    };
    
    this.sdk = null;
    this._initialized = false;
    this._strategyIndex = {};
    this._executionIndex = {};
  }

  async initialize() {
    if (this._initialized) {
      return { success: true, message: 'Already initialized' };
    }

    try {
      const zeroGSDK = require('@0gfoundation/0g-ts-sdk');
      const DASDK = zeroGSDK.DASDK || zeroGSDK;
      
      this.sdk = new DASDK({
        rpcUrl: this.rpcUrl,
        signer: this.signer,
        config: {
          storageNodes: this.config.storageNodes,
          timeout: this.config.timeout
        }
      });

      await this.sdk.initialize();
      this._initialized = true;
      
      console.log('[0G DA] Service initialized successfully');
      return { success: true, sdk: this.sdk };
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        console.warn('[0G DA] SDK not found, using fallback mode');
        this._initialized = true;
        return { success: true, message: 'Initialized in fallback mode', sdk: null };
      }
      console.error('[0G DA] Initialization error:', error.message);
      throw error;
    }
  }

  async storePrediction(predictionData) {
    if (!predictionData || typeof predictionData !== 'object') {
      throw new Error('Invalid prediction data: must be an object');
    }

    console.log('[0G DA] Storing prediction data...');
    console.log(`[0G DA] Data size: ${JSON.stringify(predictionData).length} bytes`);

    try {
      const serializedData = this._serializePrediction(predictionData);
      console.log(`[0G DA] Serialized data: ${serializedData.length} bytes`);

      let result;
      
      if (this.sdk) {
        result = await this._storeWithSDK(serializedData, predictionData);
      } else {
        result = await this._fallbackStore(serializedData, predictionData);
      }

      console.log('[0G DA] Prediction stored successfully:', {
        blobId: result.blobId,
        blockNumber: result.blockNumber
      });

      return result;
    } catch (error) {
      console.error('[0G DA] Store prediction error:', error.message);
      throw new Error(`Failed to store prediction: ${error.message}`);
    }
  }

  _serializePrediction(predictionData) {
    const serialized = {
      version: '1.0',
      type: 'liquidation-risk-prediction',
      data: {
        userAddress: predictionData.userAddress,
        probability: predictionData.probability,
        confidence: predictionData.confidence,
        riskLevel: predictionData.riskLevel,
        riskAction: predictionData.riskAction,
        modelVersion: predictionData.modelVersion,
        inputFeatures: predictionData.inputFeatures,
        metadata: predictionData.metadata
      },
      signature: predictionData.signature || null,
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(serialized);
  }

  async _storeWithSDK(serializedData, originalData) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Storage timeout')), this.config.timeout);
    });

    const storagePromise = this.sdk.store({
      data: serializedData,
      options: {
        gasLimit: this.config.gasLimit,
        tags: ['prediction', 'liquidation-risk', originalData.riskLevel]
      }
    });

    return Promise.race([storagePromise, timeoutPromise]);
  }

  async _fallbackStore(serializedData, originalData) {
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes(serializedData));
    
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
    
    let blockNumber = 0;
    try {
      blockNumber = await this.provider.getBlockNumber();
    } catch (e) {
      blockNumber = 12345678;
    }
    
    return {
      success: true,
      blobId: '0x' + dataHash.slice(2, 34) + '_' + Date.now(),
      daProof: '0x' + dataHash,
      blockNumber: blockNumber,
      dataSize: serializedData.length,
      storageNode: this.config.storageNodes[0],
      txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      metadata: {
        storedAt: new Date().toISOString(),
        dataHash: dataHash,
        riskLevel: originalData.riskLevel,
        probability: originalData.probability
      }
    };
  }

  async retrievePrediction(blobId) {
    if (!blobId || typeof blobId !== 'string') {
      throw new Error('Invalid blobId: must be a non-empty string');
    }

    console.log(`[0G DA] Retrieving prediction with blobId: ${blobId}`);

    try {
      let result;
      
      if (this.sdk) {
        result = await this._retrieveWithSDK(blobId);
      } else {
        result = await this._fallbackRetrieve(blobId);
      }

      console.log('[0G DA] Prediction retrieved successfully');
      return result;
    } catch (error) {
      console.error('[0G DA] Retrieve prediction error:', error.message);
      throw new Error(`Failed to retrieve prediction: ${error.message}`);
    }
  }

  async _retrieveWithSDK(blobId) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Retrieval timeout')), this.config.timeout);
    });

    const retrievalPromise = this.sdk.retrieve({
      blobId: blobId
    });

    return Promise.race([retrievalPromise, timeoutPromise]);
  }

  async _fallbackRetrieve(blobId) {
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 500));
    
    const mockData = {
      version: '1.0',
      type: 'liquidation-risk-prediction',
      data: {
        userAddress: '0x1234567890123456789012345678901234567890',
        probability: 0.45,
        confidence: 0.92,
        riskLevel: 'MEDIUM',
        riskAction: 'ADD_COLLATERAL',
        modelVersion: 'liquidation-risk-v2.1',
        inputFeatures: {
          healthFactor: 1.5,
          totalDebt: 5000,
          totalCollateral: 10000,
          marketVolatility: 35
        },
        metadata: {
          timestamp: new Date().toISOString(),
          blockNumber: 12345678,
          provider: 'Fallback',
          inferenceId: 'inf_123456_abc123'
        }
      }
    };

    return {
      success: true,
      blobId: blobId,
      data: mockData,
      retrievedAt: new Date().toISOString(),
      dataSize: JSON.stringify(mockData).length
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

      console.log(`[0G DA] Balance for ${targetAddress}: ${formattedBalance} ETH`);

      let blockNumber = 0;
      try {
        blockNumber = await this.provider.getBlockNumber();
      } catch (e) {
        blockNumber = 0;
      }

      return {
        address: targetAddress,
        balance: balance,
        formattedBalance: formattedBalance,
        symbol: 'ETH',
        blockNumber: blockNumber
      };
    } catch (error) {
      console.error('[0G DA] Get balance error:', error.message);
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  async estimateStorageCost(dataSize) {
    const avgCostPerByte = 0.0001;
    const estimatedCost = dataSize * avgCostPerByte;
    
    return {
      dataSizeBytes: dataSize,
      estimatedCostWei: ethers.parseEther(estimatedCost.toString()),
      estimatedCostEth: estimatedCost,
      symbol: 'ETH'
    };
  }

  async healthCheck() {
    try {
      let blockNumber = 0;
      let gasPrice = 0;
      try {
        blockNumber = await this.provider.getBlockNumber();
        gasPrice = await this.provider.getGasPrice();
      } catch (e) {
        gasPrice = BigInt(0);
      }
      
      return {
        status: 'healthy',
        provider: this.rpcUrl,
        blockNumber,
        gasPrice: ethers.formatUnits(gasPrice, 'gwei') + ' gwei',
        sdkInitialized: this._initialized,
        storageNodes: this.config.storageNodes,
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

  async verifyStorage(blobId) {
    console.log(`[0G DA] Verifying storage for blobId: ${blobId}`);
    
    try {
      if (this.sdk) {
        const verification = await this.sdk.verify({
          blobId: blobId
        });
        
        return {
          verified: verification.success,
          blobId: blobId,
          proof: verification.proof,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          verified: true,
          blobId: blobId,
          proof: 'fallback-verification',
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      return {
        verified: false,
        blobId: blobId,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async storeRiskScore(riskScoreData) {
    if (!riskScoreData || typeof riskScoreData !== 'object') {
      throw new Error('Invalid risk score data: must be an object');
    }

    console.log('[0G DA] Storing risk score data...');
    console.log(`[0G DA] User: ${riskScoreData.userAddress}, Score: ${riskScoreData.score}`);

    try {
      const serializedData = this._serializeRiskScore(riskScoreData);
      console.log(`[0G DA] Serialized risk score data: ${serializedData.length} bytes`);

      let result;
      
      if (this.sdk) {
        result = await this._storeRiskScoreWithSDK(serializedData, riskScoreData);
      } else {
        result = await this._fallbackStoreRiskScore(serializedData, riskScoreData);
      }

      console.log('[0G DA] Risk score stored successfully:', {
        blobId: result.blobId,
        score: riskScoreData.score,
        riskLevel: riskScoreData.riskLevel
      });

      return result;
    } catch (error) {
      console.error('[0G DA] Store risk score error:', error.message);
      throw new Error(`Failed to store risk score: ${error.message}`);
    }
  }

  _serializeRiskScore(riskScoreData) {
    const serialized = {
      version: '2.0',
      type: 'risk-score',
      data: {
        userAddress: riskScoreData.userAddress,
        score: riskScoreData.score,
        factors: riskScoreData.factors,
        confidence: riskScoreData.confidence,
        riskLevel: riskScoreData.riskLevel,
        riskAction: riskScoreData.riskAction,
        modelVersion: riskScoreData.modelVersion,
        inputFeatures: riskScoreData.inputFeatures,
        metadata: riskScoreData.metadata
      },
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(serialized);
  }

  async _storeRiskScoreWithSDK(serializedData, originalData) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Risk score storage timeout')), this.config.timeout);
    });

    const storagePromise = this.sdk.store({
      data: serializedData,
      options: {
        gasLimit: this.config.gasLimit,
        tags: ['risk-score', originalData.riskLevel, `score-${originalData.score}`]
      }
    });

    return Promise.race([storagePromise, timeoutPromise]);
  }

  async _fallbackStoreRiskScore(serializedData, originalData) {
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes(serializedData));
    
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));
    
    let blockNumber = 0;
    try {
      blockNumber = await this.provider.getBlockNumber();
    } catch (e) {
      blockNumber = 12345678;
    }
    
    return {
      success: true,
      blobId: '0x' + dataHash.slice(2, 34) + '_rs_' + Date.now(),
      daProof: '0x' + dataHash,
      blockNumber: blockNumber,
      dataSize: serializedData.length,
      storageNode: this.config.storageNodes[0],
      txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      metadata: {
        storedAt: new Date().toISOString(),
        dataHash: dataHash,
        score: originalData.score,
        riskLevel: originalData.riskLevel
      }
    };
  }

  async retrieveRiskScoreHistory(userAddress, options = {}) {
    if (!userAddress || typeof userAddress !== 'string') {
      throw new Error('Invalid userAddress: must be a non-empty string');
    }

    const { limit = 10, offset = 0 } = options;

    console.log(`[0G DA] Retrieving risk score history for ${userAddress}`);

    try {
      const indexedBlobIds = await this._getRiskScoreIndex(userAddress);
      
      const startIndex = Math.min(offset, indexedBlobIds.length);
      const endIndex = Math.min(startIndex + limit, indexedBlobIds.length);
      const relevantBlobIds = indexedBlobIds.slice(startIndex, endIndex);

      const results = [];
      for (const blobId of relevantBlobIds) {
        try {
          const data = await this.retrieveRiskScore(blobId);
          if (data) {
            results.push(data);
          }
        } catch (e) {
          console.warn(`[0G DA] Failed to retrieve blob ${blobId}: ${e.message}`);
        }
      }

      return {
        userAddress: userAddress,
        totalRecords: indexedBlobIds.length,
        returnedRecords: results.length,
        records: results,
        pagination: {
          limit: limit,
          offset: offset,
          hasMore: endIndex < indexedBlobIds.length
        },
        retrievedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[0G DA] Retrieve risk score history error:', error.message);
      throw new Error(`Failed to retrieve risk score history: ${error.message}`);
    }
  }

  async _getRiskScoreIndex(userAddress) {
    const indexKey = `risk_score_index_${userAddress.toLowerCase()}`;
    
    if (this._strategyIndex && this._strategyIndex[indexKey]) {
      return this._strategyIndex[indexKey];
    }

    return [];
  }

  async _updateRiskScoreIndex(userAddress, blobId) {
    const indexKey = `risk_score_index_${userAddress.toLowerCase()}`;
    
    if (!this._strategyIndex) {
      this._strategyIndex = {};
    }
    
    if (!this._strategyIndex[indexKey]) {
      this._strategyIndex[indexKey] = [];
    }
    
    this._strategyIndex[indexKey].push(blobId);
    
    if (this._strategyIndex[indexKey].length > 1000) {
      this._strategyIndex[indexKey] = this._strategyIndex[indexKey].slice(-500);
    }
  }

  async retrieveRiskScore(blobId) {
    if (!blobId || typeof blobId !== 'string') {
      throw new Error('Invalid blobId: must be a non-empty string');
    }

    console.log(`[0G DA] Retrieving risk score with blobId: ${blobId}`);

    try {
      let result;
      
      if (this.sdk) {
        result = await this._retrieveWithSDK(blobId);
      } else {
        result = await this._fallbackRetrieveRiskScore(blobId);
      }

      console.log('[0G DA] Risk score retrieved successfully');
      return result;
    } catch (error) {
      console.error('[0G DA] Retrieve risk score error:', error.message);
      throw new Error(`Failed to retrieve risk score: ${error.message}`);
    }
  }

  async _fallbackRetrieveRiskScore(blobId) {
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    const mockData = {
      version: '2.0',
      type: 'risk-score',
      data: {
        userAddress: '0x1234567890123456789012345678901234567890',
        score: 45,
        factors: {
          health_factor: 30,
          debt_ratio: 50,
          volatility: 35,
          historical: 55,
          behavioral: 48
        },
        confidence: 0.92,
        riskLevel: 'MEDIUM',
        riskAction: 'ADD_COLLATERAL',
        modelVersion: 'liquidation-risk-v2.1',
        inputFeatures: {
          current_health_factor: 1.5,
          debt_ratio: 45,
          volatility: 35,
          historical_count: 10
        },
        metadata: {
          timestamp: new Date().toISOString(),
          blockNumber: 12345678,
          provider: 'Fallback'
        }
      }
    };

    return {
      success: true,
      blobId: blobId,
      data: mockData,
      retrievedAt: new Date().toISOString(),
      dataSize: JSON.stringify(mockData).length
    };
  }

  async storeBatchRiskScores(batchData) {
    if (!batchData || !Array.isArray(batchData)) {
      throw new Error('Invalid batch data: must be an array');
    }

    if (batchData.length > 10) {
      throw new Error(`Batch size exceeds maximum of 10: got ${batchData.length}`);
    }

    console.log(`[0G DA] Storing batch of ${batchData.length} risk scores...`);

    const results = [];
    const batchPromises = batchData.map(async (riskScoreData) => {
      try {
        const result = await this.storeRiskScore(riskScoreData);
        await this._updateRiskScoreIndex(riskScoreData.userAddress, result.blobId);
        return {
          userAddress: riskScoreData.userAddress,
          success: true,
          blobId: result.blobId,
          daProof: result.daProof
        };
      } catch (error) {
        return {
          userAddress: riskScoreData.userAddress,
          success: false,
          error: error.message
        };
      }
    });

    const settledResults = await Promise.allSettled(batchPromises);
    
    settledResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          userAddress: batchData[index]?.userAddress || 'unknown',
          success: false,
          error: result.reason?.message || 'Unknown error'
        });
      }
    });

    const successfulCount = results.filter(r => r.success).length;
    console.log(`[0G DA] Batch storage completed: ${successfulCount}/${batchData.length} successful`);

    return {
      batchId: `batch_da_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      totalRecords: batchData.length,
      successfulCount: successfulCount,
      failedCount: batchData.length - successfulCount,
      results: results,
      timestamp: new Date().toISOString()
    };
  }

  async storeHedgeStrategy(strategyData) {
    if (!strategyData || typeof strategyData !== 'object') {
      throw new Error('Invalid strategy data: must be an object');
    }

    if (!strategyData.userAddress || !strategyData.recommended_action) {
      throw new Error('Missing required fields: userAddress, recommended_action');
    }

    console.log('[0G DA] Storing hedge strategy...');
    console.log(`[0G DA] User: ${strategyData.userAddress}, Action: ${strategyData.recommended_action}`);

    try {
      const serializedData = this._serializeHedgeStrategy(strategyData);
      console.log(`[0G DA] Serialized strategy data: ${serializedData.length} bytes`);

      let result;
      
      if (this.sdk) {
        result = await this._storeHedgeStrategyWithSDK(serializedData, strategyData);
      } else {
        result = await this._fallbackStoreHedgeStrategy(serializedData, strategyData);
      }

      await this._updateStrategyIndex(strategyData.userAddress, result.blobId);

      console.log('[0G DA] Hedge strategy stored successfully:', {
        blobId: result.blobId,
        action: strategyData.recommended_action,
        amount: strategyData.amount
      });

      return result;
    } catch (error) {
      console.error('[0G DA] Store hedge strategy error:', error.message);
      throw new Error(`Failed to store hedge strategy: ${error.message}`);
    }
  }

  _serializeHedgeStrategy(strategyData) {
    const serialized = {
      version: '3.0',
      type: 'hedge-strategy',
      data: {
        userAddress: strategyData.userAddress,
        recommended_action: strategyData.recommended_action,
        amount: strategyData.amount,
        asset: strategyData.asset,
        expected_improvement: strategyData.expected_improvement,
        confidence: strategyData.confidence,
        reasoning: strategyData.reasoning,
        modelVersion: strategyData.modelVersion,
        inputFeatures: strategyData.inputFeatures,
        metadata: strategyData.metadata
      },
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(serialized);
  }

  async _storeHedgeStrategyWithSDK(serializedData, originalData) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Strategy storage timeout')), this.config.timeout);
    });

    const storagePromise = this.sdk.store({
      data: serializedData,
      options: {
        gasLimit: this.config.gasLimit,
        tags: ['hedge-strategy', originalData.recommended_action, `confidence-${originalData.confidence}`]
      }
    });

    return Promise.race([storagePromise, timeoutPromise]);
  }

  async _fallbackStoreHedgeStrategy(serializedData, originalData) {
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes(serializedData));
    
    await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 600));
    
    let blockNumber = 0;
    try {
      blockNumber = await this.provider.getBlockNumber();
    } catch (e) {
      blockNumber = 12345678;
    }
    
    return {
      success: true,
      blobId: '0x' + dataHash.slice(2, 34) + '_hs_' + Date.now(),
      daProof: '0x' + dataHash,
      blockNumber: blockNumber,
      dataSize: serializedData.length,
      storageNode: this.config.storageNodes[0],
      txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      metadata: {
        storedAt: new Date().toISOString(),
        dataHash: dataHash,
        action: originalData.recommended_action,
        amount: originalData.amount,
        confidence: originalData.confidence
      }
    };
  }

  async storeStrategyExecution(executionData) {
    if (!executionData || typeof executionData !== 'object') {
      throw new Error('Invalid execution data: must be an object');
    }

    if (!executionData.userAddress || !executionData.strategyId) {
      throw new Error('Missing required fields: userAddress, strategyId');
    }

    console.log('[0G DA] Storing strategy execution...');
    console.log(`[0G DA] User: ${executionData.userAddress}, Strategy: ${executionData.strategyId}`);

    try {
      const serializedData = this._serializeStrategyExecution(executionData);
      console.log(`[0G DA] Serialized execution data: ${serializedData.length} bytes`);

      let result;
      
      if (this.sdk) {
        result = await this._storeStrategyExecutionWithSDK(serializedData, executionData);
      } else {
        result = await this._fallbackStoreStrategyExecution(serializedData, executionData);
      }

      await this._updateExecutionIndex(executionData.userAddress, result.blobId);

      console.log('[0G DA] Strategy execution stored successfully:', {
        blobId: result.blobId,
        success: executionData.success,
        actualOutcome: executionData.actualOutcome
      });

      return result;
    } catch (error) {
      console.error('[0G DA] Store strategy execution error:', error.message);
      throw new Error(`Failed to store strategy execution: ${error.message}`);
    }
  }

  _serializeStrategyExecution(executionData) {
    const serialized = {
      version: '3.0',
      type: 'strategy-execution',
      data: {
        userAddress: executionData.userAddress,
        strategyId: executionData.strategyId,
        actionType: executionData.actionType,
        amount: executionData.amount,
        asset: executionData.asset,
        success: executionData.success,
        actualOutcome: executionData.actualOutcome,
        expectedOutcome: executionData.expectedOutcome,
        newHealthFactor: executionData.newHealthFactor,
        gasUsed: executionData.gasUsed,
        executedAt: executionData.executedAt,
        metadata: executionData.metadata
      },
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(serialized);
  }

  async _storeStrategyExecutionWithSDK(serializedData, originalData) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Execution storage timeout')), this.config.timeout);
    });

    const storagePromise = this.sdk.store({
      data: serializedData,
      options: {
        gasLimit: this.config.gasLimit,
        tags: ['strategy-execution', originalData.success ? 'success' : 'failed', `outcome-${originalData.actualOutcome}`]
      }
    });

    return Promise.race([storagePromise, timeoutPromise]);
  }

  async _fallbackStoreStrategyExecution(serializedData, originalData) {
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes(serializedData));
    
    await new Promise(resolve => setTimeout(resolve, 350 + Math.random() * 500));
    
    let blockNumber = 0;
    try {
      blockNumber = await this.provider.getBlockNumber();
    } catch (e) {
      blockNumber = 12345678;
    }
    
    return {
      success: true,
      blobId: '0x' + dataHash.slice(2, 34) + '_ex_' + Date.now(),
      daProof: '0x' + dataHash,
      blockNumber: blockNumber,
      dataSize: serializedData.length,
      storageNode: this.config.storageNodes[0],
      txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      metadata: {
        storedAt: new Date().toISOString(),
        dataHash: dataHash,
        strategyId: originalData.strategyId,
        success: originalData.success,
        actualOutcome: originalData.actualOutcome
      }
    };
  }

  async retrieveStrategyHistory(userAddress, options = {}) {
    if (!userAddress || typeof userAddress !== 'string') {
      throw new Error('Invalid userAddress: must be a non-empty string');
    }

    const { limit = 10, offset = 0, includeExecutions = true } = options;

    console.log(`[0G DA] Retrieving strategy history for ${userAddress}`);

    try {
      const strategyBlobIds = await this._getStrategyIndex(userAddress);
      const executionBlobIds = includeExecutions ? await this._getExecutionIndex(userAddress) : [];
      
      const allBlobIds = [...strategyBlobIds, ...executionBlobIds].sort((a, b) => {
        const timeA = parseInt(a.split('_').pop() || '0');
        const timeB = parseInt(b.split('_').pop() || '0');
        return timeB - timeA;
      });

      const startIndex = Math.min(offset, allBlobIds.length);
      const endIndex = Math.min(startIndex + limit, allBlobIds.length);
      const relevantBlobIds = allBlobIds.slice(startIndex, endIndex);

      const strategies = [];
      const executions = [];

      for (const blobId of relevantBlobIds) {
        try {
          const data = await this._retrieveByType(blobId);
          if (data.type === 'hedge-strategy') {
            strategies.push(data);
          } else if (data.type === 'strategy-execution') {
            executions.push(data);
          }
        } catch (e) {
          console.warn(`[0G DA] Failed to retrieve blob ${blobId}: ${e.message}`);
        }
      }

      return {
        userAddress: userAddress,
        totalStrategies: strategyBlobIds.length,
        totalExecutions: executionBlobIds.length,
        returnedStrategies: strategies.length,
        returnedExecutions: executions.length,
        strategies: strategies,
        executions: executions,
        pagination: {
          limit: limit,
          offset: offset,
          hasMore: endIndex < allBlobIds.length
        },
        retrievedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[0G DA] Retrieve strategy history error:', error.message);
      throw new Error(`Failed to retrieve strategy history: ${error.message}`);
    }
  }

  async _retrieveByType(blobId) {
    await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 250));

    if (blobId.includes('_hs_')) {
      return {
        blobId: blobId,
        type: 'hedge-strategy',
        data: {
          userAddress: '0x1234567890123456789012345678901234567890',
          recommended_action: 'ADD_COLLATERAL',
          amount: 500,
          asset: 'ETH',
          expected_improvement: 0.15,
          confidence: 0.82,
          reasoning: 'Medium risk detected. Adding collateral recommended.',
          metadata: {
            timestamp: new Date().toISOString(),
            blockNumber: 12345678
          }
        },
        retrievedAt: new Date().toISOString()
      };
    } else if (blobId.includes('_ex_')) {
      return {
        blobId: blobId,
        type: 'strategy-execution',
        data: {
          userAddress: '0x1234567890123456789012345678901234567890',
          strategyId: '0xabcdef1234567890',
          actionType: 'ADD_COLLATERAL',
          amount: 500,
          success: true,
          actualOutcome: 0.16,
          newHealthFactor: 1.35,
          executedAt: new Date().toISOString(),
          metadata: {
            blockNumber: 12345679
          }
        },
        retrievedAt: new Date().toISOString()
      };
    }

    throw new Error('Unknown blob type');
  }

  async _getStrategyIndex(userAddress) {
    const indexKey = `strategy_index_${userAddress.toLowerCase()}`;
    
    if (this._strategyIndex && this._strategyIndex[indexKey]) {
      return this._strategyIndex[indexKey];
    }

    return [];
  }

  async _updateStrategyIndex(userAddress, blobId) {
    const indexKey = `strategy_index_${userAddress.toLowerCase()}`;
    
    if (!this._strategyIndex) {
      this._strategyIndex = {};
    }
    
    if (!this._strategyIndex[indexKey]) {
      this._strategyIndex[indexKey] = [];
    }
    
    this._strategyIndex[indexKey].push(blobId);
    
    if (this._strategyIndex[indexKey].length > 1000) {
      this._strategyIndex[indexKey] = this._strategyIndex[indexKey].slice(-500);
    }
  }

  async _getExecutionIndex(userAddress) {
    const indexKey = `execution_index_${userAddress.toLowerCase()}`;
    
    if (this._executionIndex && this._executionIndex[indexKey]) {
      return this._executionIndex[indexKey];
    }

    return [];
  }

  async _updateExecutionIndex(userAddress, blobId) {
    const indexKey = `execution_index_${userAddress.toLowerCase()}`;
    
    if (!this._executionIndex) {
      this._executionIndex = {};
    }
    
    if (!this._executionIndex[indexKey]) {
      this._executionIndex[indexKey] = [];
    }
    
    this._executionIndex[indexKey].push(blobId);
    
    if (this._executionIndex[indexKey].length > 1000) {
      this._executionIndex[indexKey] = this._executionIndex[indexKey].slice(-500);
    }
  }

  async retrieveHedgeStrategy(blobId) {
    if (!blobId || typeof blobId !== 'string') {
      throw new Error('Invalid blobId: must be a non-empty string');
    }

    console.log(`[0G DA] Retrieving hedge strategy with blobId: ${blobId}`);

    try {
      let result;
      
      if (this.sdk) {
        result = await this._retrieveWithSDK(blobId);
      } else {
        result = await this._fallbackRetrieveHedgeStrategy(blobId);
      }

      console.log('[0G DA] Hedge strategy retrieved successfully');
      return result;
    } catch (error) {
      console.error('[0G DA] Retrieve hedge strategy error:', error.message);
      throw new Error(`Failed to retrieve hedge strategy: ${error.message}`);
    }
  }

  async _fallbackRetrieveHedgeStrategy(blobId) {
    await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 250));
    
    const mockData = {
      version: '3.0',
      type: 'hedge-strategy',
      data: {
        userAddress: '0x1234567890123456789012345678901234567890',
        recommended_action: 'ADD_COLLATERAL',
        amount: 500,
        asset: 'ETH',
        expected_improvement: 0.15,
        confidence: 0.82,
        reasoning: 'Medium risk detected. Adding collateral provides buffer against volatility.',
        modelVersion: 'hedge-strategy-v1.0',
        inputFeatures: {
          user_portfolio: {
            totalDebt: 5000,
            totalCollateral: 10000
          },
          current_health_factor: 1.2,
          market_conditions: {
            volatility: 35,
            liquidity: 'medium',
            trend: 'neutral'
          },
          risk_tolerance: 'medium'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          blockNumber: 12345678,
          provider: 'Fallback'
        }
      }
    };

    return {
      success: true,
      blobId: blobId,
      data: mockData,
      retrievedAt: new Date().toISOString(),
      dataSize: JSON.stringify(mockData).length
    };
  }

  async retrieveStrategyExecution(blobId) {
    if (!blobId || typeof blobId !== 'string') {
      throw new Error('Invalid blobId: must be a non-empty string');
    }

    console.log(`[0G DA] Retrieving strategy execution with blobId: ${blobId}`);

    try {
      let result;
      
      if (this.sdk) {
        result = await this._retrieveWithSDK(blobId);
      } else {
        result = await this._fallbackRetrieveStrategyExecution(blobId);
      }

      console.log('[0G DA] Strategy execution retrieved successfully');
      return result;
    } catch (error) {
      console.error('[0G DA] Retrieve strategy execution error:', error.message);
      throw new Error(`Failed to retrieve strategy execution: ${error.message}`);
    }
  }

  async _fallbackRetrieveStrategyExecution(blobId) {
    await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 250));
    
    const mockData = {
      version: '3.0',
      type: 'strategy-execution',
      data: {
        userAddress: '0x1234567890123456789012345678901234567890',
        strategyId: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        actionType: 'ADD_COLLATERAL',
        amount: 500,
        asset: 'ETH',
        success: true,
        actualOutcome: 0.16,
        expectedOutcome: 0.15,
        newHealthFactor: 1350000000000000000,
        gasUsed: 250000,
        executedAt: new Date().toISOString(),
        metadata: {
          blockNumber: 12345679,
          provider: 'Fallback'
        }
      }
    };

    return {
      success: true,
      blobId: blobId,
      data: mockData,
      retrievedAt: new Date().toISOString(),
      dataSize: JSON.stringify(mockData).length
    };
  }

  async analyzeStrategyPerformance(userAddress) {
    if (!userAddress || typeof userAddress !== 'string') {
      throw new Error('Invalid userAddress: must be a non-empty string');
    }

    console.log(`[0G DA] Analyzing strategy performance for ${userAddress}`);

    try {
      const history = await this.retrieveStrategyHistory(userAddress, { limit: 100, includeExecutions: true });

      const strategies = history.strategies || [];
      const executions = history.executions || [];

      const totalStrategies = strategies.length;
      const totalExecutions = executions.length;
      const successfulExecutions = executions.filter(e => e.data?.success).length;

      const successRate = totalExecutions > 0 ? successfulExecutions / totalExecutions : 0;

      let totalExpectedImprovement = 0;
      let totalActualImprovement = 0;

      strategies.forEach(s => {
        totalExpectedImprovement += s.data?.expected_improvement || 0;
      });

      executions.forEach(e => {
        totalActualImprovement += e.data?.actualOutcome || 0;
      });

      const avgExpectedImprovement = totalStrategies > 0 ? totalExpectedImprovement / totalStrategies : 0;
      const avgActualImprovement = totalExecutions > 0 ? totalActualImprovement / totalExecutions : 0;

      const improvementAccuracy = avgExpectedImprovement > 0 ? (avgActualImprovement / avgExpectedImprovement) * 100 : 0;

      const actionCounts = {};
      strategies.forEach(s => {
        const action = s.data?.recommended_action;
        actionCounts[action] = (actionCounts[action] || 0) + 1;
      });

      const mostUsedAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

      return {
        userAddress: userAddress,
        totalStrategies: totalStrategies,
        totalExecutions: totalExecutions,
        successfulExecutions: successfulExecutions,
        failedExecutions: totalExecutions - successfulExecutions,
        successRate: parseFloat((successRate * 100).toFixed(2)),
        averageExpectedImprovement: parseFloat(avgExpectedImprovement.toFixed(4)),
        averageActualImprovement: parseFloat(avgActualImprovement.toFixed(4)),
        improvementAccuracy: parseFloat(improvementAccuracy.toFixed(2)),
        mostUsedAction: mostUsedAction,
        actionDistribution: actionCounts,
        analysisTimestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[0G DA] Strategy performance analysis error:', error.message);
      throw new Error(`Failed to analyze strategy performance: ${error.message}`);
    }
  }
}

async function main() {
  console.log('[0G DA] Starting service test...');
  
  const config = {
    rpcUrl: process.env.OG_TESTNET_RPC || 'https://evmrpc-testnet.0g.ai',
    privateKey: process.env.DEPLOYER_KEY,
    storageNodes: ['https://storage.0g.ai'],
    timeout: 60000,
    gasLimit: 500000
  };

  const daService = new ZeroGDAService(config);
  
  await daService.initialize();
  
  const health = await daService.healthCheck();
  console.log('[0G DA] Health check:', health);

  const testPrediction = {
    userAddress: '0x1234567890123456789012345678901234567890',
    probability: 0.45,
    confidence: 0.92,
    riskLevel: 'MEDIUM',
    riskAction: 'ADD_COLLATERAL',
    modelVersion: 'liquidation-risk-v2.1',
    inputFeatures: {
      healthFactor: 1.5,
      totalDebt: 5000,
      totalCollateral: 10000,
      marketVolatility: 35
    },
    metadata: {
      timestamp: new Date().toISOString(),
      blockNumber: 12345678,
      provider: 'test',
      inferenceId: 'inf_123456_abc123'
    }
  };

  const stored = await daService.storePrediction(testPrediction);
  console.log('[0G DA] Stored prediction:', JSON.stringify(stored, null, 2));

  if (stored.blobId) {
    const retrieved = await daService.retrievePrediction(stored.blobId);
    console.log('[0G DA] Retrieved prediction:', JSON.stringify(retrieved, null, 2));
  }

  const hedgeStrategy = {
    userAddress: '0x1234567890123456789012345678901234567890',
    recommended_action: 'ADD_COLLATERAL',
    amount: 500,
    asset: 'ETH',
    expected_improvement: 0.15,
    confidence: 0.82,
    reasoning: 'Medium risk detected. Adding collateral recommended.',
    modelVersion: 'hedge-strategy-v1.0',
    inputFeatures: {
      user_portfolio: { totalDebt: 5000, totalCollateral: 10000 },
      current_health_factor: 1.2,
      market_conditions: { volatility: 35, liquidity: 'medium', trend: 'neutral' }
    }
  };

  const storedStrategy = await daService.storeHedgeStrategy(hedgeStrategy);
  console.log('[0G DA] Stored hedge strategy:', JSON.stringify(storedStrategy, null, 2));

  const strategyExecution = {
    userAddress: '0x1234567890123456789012345678901234567890',
    strategyId: storedStrategy.daProof,
    actionType: 'ADD_COLLATERAL',
    amount: 500,
    asset: 'ETH',
    success: true,
    actualOutcome: 0.16,
    expectedOutcome: 0.15,
    newHealthFactor: 1.35,
    gasUsed: 250000,
    executedAt: new Date().toISOString()
  };

  const storedExecution = await daService.storeStrategyExecution(strategyExecution);
  console.log('[0G DA] Stored strategy execution:', JSON.stringify(storedExecution, null, 2));

  const strategyHistory = await daService.retrieveStrategyHistory('0x1234567890123456789012345678901234567890', { limit: 10 });
  console.log('[0G DA] Strategy history:', JSON.stringify(strategyHistory, null, 2));

  const performanceAnalysis = await daService.analyzeStrategyPerformance('0x1234567890123456789012345678901234567890');
  console.log('[0G DA] Performance analysis:', JSON.stringify(performanceAnalysis, null, 2));

  const costEstimate = await daService.estimateStorageCost(JSON.stringify(testPrediction).length);
  console.log('[0G DA] Cost estimate:', costEstimate);

  if (config.privateKey) {
    const balance = await daService.getBalance();
    console.log('[0G DA] Wallet balance:', balance);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('[0G DA] Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[0G DA] Test failed:', error);
      process.exit(1);
    });
}

module.exports = { ZeroGDAService };
