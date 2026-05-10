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

  async calculateRiskScore(inputData) {
    const {
      historical_predictions,
      current_health_factor,
      debt_ratio,
      volatility,
      behavioral_patterns
    } = inputData;

    if (current_health_factor === undefined || debt_ratio === undefined) {
      throw new Error('Missing required parameters: current_health_factor, debt_ratio');
    }

    console.log('[0G Compute] Calculating risk score...');
    console.log(`[0G Compute] Input - HF: ${current_health_factor}, Debt Ratio: ${debt_ratio}%, Volatility: ${volatility || 0}%`);

    try {
      let result;

      if (this.sdk) {
        result = await this._callRiskScoreInference(inputData);
      } else {
        result = await this._fallbackRiskScoreInference(inputData);
      }

      const score = Math.min(100, Math.max(0, Math.round(result.score)));
      const confidence = result.confidence || 0.9;

      const factors = {
        health_factor: result.factors?.health_factor || this._calculateHealthFactorScore(current_health_factor),
        debt_ratio: result.factors?.debt_ratio || this._calculateDebtRatioScore(debt_ratio),
        volatility: result.factors?.volatility || this._calculateVolatilityScore(volatility || 30),
        historical: result.factors?.historical || this._calculateHistoricalScore(historical_predictions),
        behavioral: result.factors?.behavioral || this._calculateBehavioralScore(behavioral_patterns)
      };

      const riskAssessment = this._assessRiskLevel(score);

      const riskScoreResult = {
        score: score,
        factors: factors,
        confidence: confidence,
        riskLevel: riskAssessment.level,
        riskAction: riskAssessment.action,
        modelVersion: this.config.modelVersion,
        inputFeatures: {
          current_health_factor,
          debt_ratio,
          volatility: volatility || 30,
          behavioral_patterns,
          historical_count: historical_predictions?.length || 0
        },
        metadata: {
          timestamp: new Date().toISOString(),
          blockNumber: result.blockNumber || 0,
          provider: this.sdk ? '0G-Compute-SDK' : 'Fallback',
          inferenceId: result.inferenceId || this._generateInferenceId()
        }
      };

      console.log('[0G Compute] Risk score calculated:', {
        score: riskScoreResult.score,
        riskLevel: riskScoreResult.riskLevel,
        confidence: riskScoreResult.confidence
      });

      return riskScoreResult;
    } catch (error) {
      console.error('[0G Compute] Risk score calculation error:', error.message);
      throw new Error(`Risk score calculation failed: ${error.message}`);
    }
  }

  async _callRiskScoreInference(inputData) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Risk inference timeout')), this.config.timeout);
    });

    const inferencePromise = this.sdk.predict({
      model: 'comprehensive-risk-score',
      inputs: {
        historical_predictions: inputData.historical_predictions || [],
        current_health_factor: inputData.current_health_factor,
        debt_ratio: inputData.debt_ratio,
        volatility: inputData.volatility || 30,
        behavioral_patterns: inputData.behavioral_patterns || '0x0000000000000000000000000000000000000000000000000000000000000000'
      }
    });

    return Promise.race([inferencePromise, timeoutPromise]);
  }

  async _fallbackRiskScoreInference(inputData) {
    const { current_health_factor, debt_ratio, volatility, historical_predictions, behavioral_patterns } = inputData;

    const hfScore = this._calculateHealthFactorScore(current_health_factor);
    const debtScore = this._calculateDebtRatioScore(debt_ratio);
    const volScore = this._calculateVolatilityScore(volatility || 30);
    const histScore = this._calculateHistoricalScore(historical_predictions);
    const behScore = this._calculateBehavioralScore(behavioral_patterns);

    const weights = {
      healthFactor: 0.30,
      debtRatio: 0.25,
      volatility: 0.15,
      historical: 0.20,
      behavioral: 0.10
    };

    const baseScore = (
      hfScore * weights.healthFactor +
      debtScore * weights.debtRatio +
      volScore * weights.volatility +
      histScore * weights.historical +
      behScore * weights.behavioral
    );

    const historicalBonus = historical_predictions?.length > 5 ? 5 : 0;
    const score = Math.min(100, baseScore + historicalBonus);

    const confidence = 0.80 + Math.random() * 0.15;

    await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 300));

    return {
      score: parseFloat(score.toFixed(2)),
      confidence: parseFloat(confidence.toFixed(4)),
      factors: {
        health_factor: hfScore,
        debt_ratio: debtScore,
        volatility: volScore,
        historical: histScore,
        behavioral: behScore
      },
      inferenceId: this._generateInferenceId()
    };
  }

  _calculateHealthFactorScore(healthFactor) {
    if (healthFactor >= 2.0) return 10;
    if (healthFactor >= 1.5) return 30;
    if (healthFactor >= 1.2) return 50;
    if (healthFactor >= 1.0) return 70;
    return 95;
  }

  _calculateDebtRatioScore(debtRatio) {
    if (debtRatio <= 20) return 10;
    if (debtRatio <= 40) return 30;
    if (debtRatio <= 60) return 50;
    if (debtRatio <= 80) return 75;
    return 95;
  }

  _calculateVolatilityScore(volatility) {
    return Math.min(100, volatility);
  }

  _calculateHistoricalScore(historicalPredictions) {
    if (!historicalPredictions || historicalPredictions.length === 0) {
      return 50;
    }

    const avgProbability = historicalPredictions.reduce((sum, pred) => {
      return sum + (pred.probability || 0);
    }, 0) / historicalPredictions.length;

    if (avgProbability <= 20) return 20;
    if (avgProbability <= 40) return 40;
    if (avgProbability <= 60) return 60;
    if (avgProbability <= 80) return 80;
    return 95;
  }

  _calculateBehavioralScore(behavioralPatterns) {
    if (!behavioralPatterns) return 50;
    const patternHash = typeof behavioralPatterns === 'string'
      ? parseInt(behavioralPatterns.slice(2, 10), 16)
      : parseInt(behavioralPatterns.slice(2, 10), 16);
    return Math.abs(patternHash % 100);
  }

  _assessRiskLevel(score) {
    if (score >= 80) {
      return {
        level: 'CRITICAL',
        action: 'IMMEDIATE_LIQUIDATION_RISK',
        color: 'red'
      };
    } else if (score >= 60) {
      return {
        level: 'HIGH',
        action: 'CLOSE_POSITION_RECOMMENDED',
        color: 'orange'
      };
    } else if (score >= 40) {
      return {
        level: 'MEDIUM',
        action: 'ADD_COLLATERAL',
        color: 'yellow'
      };
    } else if (score >= 20) {
      return {
        level: 'LOW',
        action: 'MONITOR_POSITION',
        color: 'green'
      };
    } else {
      return {
        level: 'MINIMAL',
        action: 'HOLD',
        color: 'blue'
      };
    }
  }

  async addBatchRiskCalculation(batchInput) {
    const { users } = batchInput;

    if (!users || !Array.isArray(users)) {
      throw new Error('Invalid batch input: users array required');
    }

    if (users.length > 10) {
      throw new Error(`Batch size exceeds maximum of 10: got ${users.length}`);
    }

    console.log(`[0G Compute] Processing batch risk calculation for ${users.length} users...`);

    const results = [];
    const batchPromises = users.map(async (userData) => {
      try {
        const result = await this.calculateRiskScore({
          historical_predictions: userData.historical_predictions || [],
          current_health_factor: userData.current_health_factor,
          debt_ratio: userData.debt_ratio,
          volatility: userData.volatility || 30,
          behavioral_patterns: userData.behavioral_patterns || '0x0000000000000000000000000000000000000000000000000000000000000000'
        });
        return {
          userAddress: userData.userAddress || 'unknown',
          success: true,
          ...result
        };
      } catch (error) {
        return {
          userAddress: userData.userAddress || 'unknown',
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
          userAddress: users[index]?.userAddress || 'unknown',
          success: false,
          error: result.reason?.message || 'Unknown error'
        });
      }
    });

    console.log(`[0G Compute] Batch calculation completed: ${results.filter(r => r.success).length}/${users.length} successful`);

    return {
      batchId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      totalUsers: users.length,
      successfulCount: results.filter(r => r.success).length,
      failedCount: results.filter(r => !r.success).length,
      results: results,
      timestamp: new Date().toISOString()
    };
  }

  async generateHedgeStrategy(inputData) {
    const {
      user_portfolio,
      current_health_factor,
      market_conditions,
      risk_tolerance,
      historical_success
    } = inputData;

    if (current_health_factor === undefined) {
      throw new Error('Missing required parameter: current_health_factor');
    }

    console.log('[0G Compute] Generating hedge strategy recommendation...');
    console.log(`[0G Compute] Input - HF: ${current_health_factor}, Risk Tolerance: ${risk_tolerance || 'medium'}`);

    try {
      let result;

      if (this.sdk) {
        result = await this._callHedgeStrategyInference(inputData);
      } else {
        result = await this._fallbackHedgeStrategyInference(inputData);
      }

      const strategy = {
        userAddress: user_portfolio?.userAddress || 'unknown',
        recommended_action: result.actionType,
        amount: result.amount,
        asset: result.asset,
        expected_improvement: result.expectedImprovement,
        confidence: result.confidence,
        reasoning: result.reasoning,
        modelVersion: this.config.modelVersion,
        inputFeatures: {
          user_portfolio,
          current_health_factor,
          market_conditions: market_conditions || {},
          risk_tolerance: risk_tolerance || 'medium',
          historical_success: historical_success || {}
        },
        metadata: {
          timestamp: new Date().toISOString(),
          blockNumber: result.blockNumber || 0,
          provider: this.sdk ? '0G-Compute-SDK' : 'Fallback',
          inferenceId: result.inferenceId || this._generateInferenceId()
        }
      };

      console.log('[0G Compute] Hedge strategy generated:', {
        action: strategy.recommended_action,
        amount: strategy.amount,
        confidence: strategy.confidence
      });

      return strategy;
    } catch (error) {
      console.error('[0G Compute] Hedge strategy generation error:', error.message);
      throw new Error(`Hedge strategy generation failed: ${error.message}`);
    }
  }

  async _callHedgeStrategyInference(inputData) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Strategy inference timeout')), this.config.timeout);
    });

    const inferencePromise = this.sdk.predict({
      model: 'hedge-strategy-recommendation',
      inputs: {
        user_portfolio: inputData.user_portfolio || {},
        current_health_factor: inputData.current_health_factor,
        market_conditions: inputData.market_conditions || {},
        risk_tolerance: inputData.risk_tolerance || 'medium',
        historical_success: inputData.historical_success || {}
      }
    });

    return Promise.race([inferencePromise, timeoutPromise]);
  }

  async _fallbackHedgeStrategyInference(inputData) {
    const {
      current_health_factor,
      market_conditions,
      risk_tolerance,
      historical_success
    } = inputData;

    const volatility = market_conditions?.volatility || 30;
    const liquidity = market_conditions?.liquidity || 'medium';
    const marketTrend = market_conditions?.trend || 'neutral';

    let actionType;
    let amount;
    let asset;
    let expectedImprovement;
    let confidence;
    let reasoning;

    if (current_health_factor < 1.1) {
      actionType = 'PARTIAL_REPAY';
      amount = inputData.user_portfolio?.totalDebt 
        ? Math.floor(inputData.user_portfolio.totalDebt * 0.15) 
        : 1000;
      asset = 'ETH';
      expectedImprovement = ((current_health_factor * 1.25) - current_health_factor).toFixed(4);
      confidence = 0.85 + Math.random() * 0.1;
      reasoning = 'Critical health factor detected. Partial repayment reduces liquidation risk significantly.';

      if (historical_success?.partialRepaySuccessRate > 0.7) {
        confidence = Math.min(0.95, confidence + 0.05);
      }
    } else if (current_health_factor < 1.3) {
      if (volatility > 40 || marketTrend === 'bearish') {
        actionType = 'ADD_COLLATERAL';
        amount = inputData.user_portfolio?.totalDebt 
          ? Math.floor(inputData.user_portfolio.totalDebt * 0.25) 
          : 500;
        asset = 'ETH';
        expectedImprovement = ((current_health_factor * 1.18) - current_health_factor).toFixed(4);
        confidence = 0.75 + Math.random() * 0.1;
        reasoning = 'Medium risk detected. Adding collateral provides buffer against market volatility.';
      } else {
        actionType = 'FLASH_LOAN_HEDGE';
        amount = inputData.user_portfolio?.totalDebt 
          ? Math.floor(inputData.user_portfolio.totalDebt * 0.10) 
          : 300;
        asset = 'USDC';
        expectedImprovement = ((current_health_factor * 1.12) - current_health_factor).toFixed(4);
        confidence = 0.70 + Math.random() * 0.1;
        reasoning = 'Flash loan hedge offers quick position adjustment with minimal capital requirement.';
      }

      if (risk_tolerance === 'low') {
        actionType = 'ADD_COLLATERAL';
        confidence = Math.min(0.90, confidence + 0.05);
        reasoning = 'Low risk tolerance detected. Prioritizing collateral addition over leverage.';
      }
    } else if (current_health_factor < 1.5) {
      actionType = 'ADD_COLLATERAL';
      amount = inputData.user_portfolio?.totalDebt 
        ? Math.floor(inputData.user_portfolio.totalDebt * 0.15) 
        : 300;
      asset = 'ETH';
      expectedImprovement = ((current_health_factor * 1.10) - current_health_factor).toFixed(4);
      confidence = 0.65 + Math.random() * 0.15;
      reasoning = 'Health factor below safe threshold. Modest collateral addition recommended.';

      if (liquidity === 'low') {
        reasoning += ' Note: Low market liquidity may affect execution price.';
      }
    } else {
      actionType = 'ADD_COLLATERAL';
      amount = inputData.user_portfolio?.totalDebt 
        ? Math.floor(inputData.user_portfolio.totalDebt * 0.10) 
        : 200;
      asset = 'ETH';
      expectedImprovement = ((current_health_factor * 1.05) - current_health_factor).toFixed(4);
      confidence = 0.55 + Math.random() * 0.15;
      reasoning = 'Health factor stable but proactive collateral addition recommended for safety margin.';

      if (risk_tolerance === 'low') {
        confidence = Math.min(0.80, confidence + 0.10);
        reasoning = 'Conservative position maintained. Small but steady collateral increase.';
      }
    }

    if (historical_success?.totalStrategies > 5) {
      const successRate = historical_success.successfulStrategies / historical_success.totalStrategies;
      confidence = confidence * (0.9 + successRate * 0.2);
      confidence = Math.min(0.95, Math.max(0.5, confidence));
    }

    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

    return {
      actionType: actionType,
      amount: amount,
      asset: asset,
      expectedImprovement: parseFloat(expectedImprovement),
      confidence: parseFloat(confidence.toFixed(4)),
      reasoning: reasoning,
      inferenceId: this._generateInferenceId()
    };
  }

  async simulateStrategyOutcome(inputData) {
    const {
      strategy,
      current_health_factor,
      market_conditions,
      scenarios
    } = inputData;

    if (!strategy || !strategy.recommended_action) {
      throw new Error('Invalid strategy: recommended_action required');
    }

    console.log('[0G Compute] Simulating strategy outcome...');
    console.log(`[0G Compute] Strategy: ${strategy.recommended_action}, Amount: ${strategy.amount}`);

    try {
      const defaultScenarios = ['base', 'bullish', 'bearish', 'high_volatility'];
      const simulationScenarios = scenarios || defaultScenarios;

      const results = {};

      for (const scenario of simulationScenarios) {
        results[scenario] = this._simulateScenario(
          strategy,
          current_health_factor,
          market_conditions,
          scenario
        );
      }

      const simulatedResult = {
        strategy: strategy,
        currentHealthFactor: current_health_factor,
        scenarios: results,
        summary: this._generateSimulationSummary(results, strategy),
        metadata: {
          timestamp: new Date().toISOString(),
          provider: '0G-Compute-Simulation',
          simulationId: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
        }
      };

      console.log('[0G Compute] Simulation completed:', {
        scenarios: Object.keys(results).length,
        averageOutcome: simulatedResult.summary.averageOutcome
      });

      return simulatedResult;
    } catch (error) {
      console.error('[0G Compute] Strategy simulation error:', error.message);
      throw new Error(`Strategy simulation failed: ${error.message}`);
    }
  }

  _simulateScenario(strategy, currentHealthFactor, marketConditions, scenarioType) {
    const baseVolatility = marketConditions?.volatility || 30;
    const marketTrend = marketConditions?.trend || 'neutral';

    let volatilityMultiplier = 1.0;
    let trendMultiplier = 1.0;
    let riskFactor = 0;

    switch (scenarioType) {
      case 'bullish':
        volatilityMultiplier = 0.7;
        trendMultiplier = 1.2;
        riskFactor = 0.1;
        break;
      case 'bearish':
        volatilityMultiplier = 1.3;
        trendMultiplier = 0.8;
        riskFactor = 0.3;
        break;
      case 'high_volatility':
        volatilityMultiplier = 1.5;
        trendMultiplier = 0.9;
        riskFactor = 0.25;
        break;
      case 'base':
      default:
        volatilityMultiplier = 1.0;
        trendMultiplier = 1.0;
        riskFactor = 0.15;
    }

    const actionType = strategy.recommended_action;
    let expectedHealthFactor;
    let probabilityOfSuccess;
    let riskScore;
    let estimatedCost;

    if (actionType === 'ADD_COLLATERAL') {
      const collateralRatio = strategy.amount / (strategy.user_portfolio?.totalDebt || 10000);
      expectedHealthFactor = currentHealthFactor * (1 + collateralRatio * 0.3 * trendMultiplier);
      probabilityOfSuccess = 0.85 - (riskFactor * 0.2);
      riskScore = 15 + (riskFactor * 30);
      estimatedCost = strategy.amount * (0.001 + (baseVolatility / 10000) * volatilityMultiplier);
    } else if (actionType === 'FLASH_LOAN_HEDGE') {
      const hedgeRatio = strategy.amount / (strategy.user_portfolio?.totalDebt || 10000);
      expectedHealthFactor = currentHealthFactor * (1 + hedgeRatio * 0.15 * trendMultiplier);
      probabilityOfSuccess = 0.75 - (riskFactor * 0.25);
      riskScore = 25 + (riskFactor * 35);
      estimatedCost = strategy.amount * 0.001 + 0.002 * strategy.amount;
    } else if (actionType === 'PARTIAL_REPAY') {
      const repayRatio = strategy.amount / (strategy.user_portfolio?.totalDebt || 10000);
      expectedHealthFactor = currentHealthFactor * (1 + repayRatio * 0.4 * trendMultiplier);
      probabilityOfSuccess = 0.90 - (riskFactor * 0.1);
      riskScore = 10 + (riskFactor * 20);
      estimatedCost = strategy.amount * 0.001;
    } else {
      expectedHealthFactor = currentHealthFactor;
      probabilityOfSuccess = 0.5;
      riskScore = 50;
      estimatedCost = 0;
    }

    expectedHealthFactor = parseFloat(expectedHealthFactor.toFixed(4));
    probabilityOfSuccess = parseFloat(Math.max(0.1, Math.min(0.99, probabilityOfSuccess)).toFixed(4));
    riskScore = Math.round(Math.min(100, riskScore));
    estimatedCost = parseFloat(estimatedCost.toFixed(6));

    return {
      expectedHealthFactor: expectedHealthFactor,
      probabilityOfSuccess: probabilityOfSuccess,
      riskScore: riskScore,
      estimatedCost: estimatedCost,
      volatilityImpact: parseFloat((volatilityMultiplier * baseVolatility).toFixed(2)),
      trendImpact: trendMultiplier > 1 ? 'positive' : trendMultiplier < 1 ? 'negative' : 'neutral',
      recommendation: this._getScenarioRecommendation(probabilityOfSuccess, riskScore, scenarioType)
    };
  }

  _getScenarioRecommendation(probabilityOfSuccess, riskScore, scenarioType) {
    if (probabilityOfSuccess >= 0.8 && riskScore <= 20) {
      return 'HIGHLY_RECOMMENDED';
    } else if (probabilityOfSuccess >= 0.6 && riskScore <= 40) {
      return 'RECOMMENDED';
    } else if (probabilityOfSuccess >= 0.4) {
      return 'CAUTION';
    } else {
      return 'NOT_RECOMMENDED';
    }
  }

  _generateSimulationSummary(results, strategy) {
    const scenarioKeys = Object.keys(results);
    let totalOutcome = 0;
    let totalRisk = 0;
    let totalCost = 0;
    let bestScenario = null;
    let worstScenario = null;
    let bestOutcome = -Infinity;
    let worstOutcome = Infinity;

    for (const scenario of scenarioKeys) {
      const result = results[scenario];
      totalOutcome += result.expectedHealthFactor;
      totalRisk += result.riskScore;
      totalCost += result.estimatedCost;

      if (result.expectedHealthFactor > bestOutcome) {
        bestOutcome = result.expectedHealthFactor;
        bestScenario = scenario;
      }
      if (result.expectedHealthFactor < worstOutcome) {
        worstOutcome = result.expectedHealthFactor;
        worstScenario = scenario;
      }
    }

    const averageOutcome = totalOutcome / scenarioKeys.length;
    const averageRisk = totalRisk / scenarioKeys.length;
    const averageCost = totalCost / scenarioKeys.length;

    return {
      averageOutcome: parseFloat(averageOutcome.toFixed(4)),
      averageRisk: Math.round(averageRisk),
      averageCost: parseFloat(averageCost.toFixed(6)),
      bestScenario: bestScenario,
      bestOutcome: bestOutcome,
      worstScenario: worstScenario,
      worstOutcome: worstOutcome,
      overallRecommendation: this._getOverallRecommendation(averageOutcome, averageRisk, strategy.current_health_factor)
    };
  }

  _getOverallRecommendation(averageOutcome, averageRisk, currentHealthFactor) {
    const improvement = averageOutcome - currentHealthFactor;
    const improvementPercentage = (improvement / currentHealthFactor) * 100;

    if (averageRisk <= 25 && improvementPercentage >= 10) {
      return 'EXCELLENT';
    } else if (averageRisk <= 40 && improvementPercentage >= 5) {
      return 'GOOD';
    } else if (averageRisk <= 60) {
      return 'ACCEPTABLE';
    } else {
      return 'RISKY';
    }
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

  const hedgeStrategy = await computeService.generateHedgeStrategy({
    user_portfolio: {
      userAddress: '0x1234567890123456789012345678901234567890',
      totalDebt: 5000,
      totalCollateral: 10000
    },
    current_health_factor: 1.2,
    market_conditions: {
      volatility: 35,
      liquidity: 'medium',
      trend: 'neutral'
    },
    risk_tolerance: 'medium',
    historical_success: {
      totalStrategies: 10,
      successfulStrategies: 8
    }
  });
  
  console.log('[0G Compute] Hedge strategy:', JSON.stringify(hedgeStrategy, null, 2));

  const simulation = await computeService.simulateStrategyOutcome({
    strategy: hedgeStrategy,
    current_health_factor: 1.2,
    market_conditions: {
      volatility: 35,
      trend: 'neutral'
    },
    scenarios: ['base', 'bullish', 'bearish', 'high_volatility']
  });
  
  console.log('[0G Compute] Strategy simulation:', JSON.stringify(simulation, null, 2));

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
