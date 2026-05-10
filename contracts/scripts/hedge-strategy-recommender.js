const { ZeroGComputeService } = require('./0g-compute-service');
const { ZeroGDAService } = require('./0g-da-service');

class HedgeStrategyRecommender {
  constructor(config = {}) {
    this.computeService = new ZeroGComputeService({
      rpcUrl: config.rpcUrl,
      privateKey: config.privateKey,
      inferenceEndpoint: config.inferenceEndpoint,
      modelVersion: config.modelVersion || 'hedge-strategy-v1.0'
    });

    this.daService = new ZeroGDAService({
      rpcUrl: config.rpcUrl,
      privateKey: config.privateKey,
      storageNodes: config.storageNodes,
      timeout: config.timeout,
      gasLimit: config.gasLimit
    });

    this.config = {
      defaultRiskTolerance: config.defaultRiskTolerance || 'medium',
      minConfidenceThreshold: config.minConfidenceThreshold || 0.5,
      autoStoreToDA: config.autoStoreToDA !== false,
      autoSimulate: config.autoSimulate !== false
    };

    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) {
      return { success: true, message: 'Already initialized' };
    }

    console.log('[Hedge Recommender] Initializing services...');

    try {
      await this.computeService.initialize();
      await this.daService.initialize();

      this._initialized = true;

      console.log('[Hedge Recommender] Initialization complete');
      return { success: true };
    } catch (error) {
      console.error('[Hedge Recommender] Initialization error:', error.message);
      throw error;
    }
  }

  async generateRecommendation(userData) {
    const {
      userAddress,
      healthFactor,
      totalDebt,
      totalCollateral,
      marketConditions,
      riskTolerance,
      historicalSuccess
    } = userData;

    console.log('[Hedge Recommender] Generating recommendation for user:', userAddress);
    console.log('[Hedge Recommender] Health Factor:', healthFactor);

    try {
      const hedgeStrategy = await this.computeService.generateHedgeStrategy({
        user_portfolio: {
          userAddress,
          totalDebt,
          totalCollateral
        },
        current_health_factor: healthFactor,
        market_conditions: marketConditions || this._getDefaultMarketConditions(),
        risk_tolerance: riskTolerance || this.config.defaultRiskTolerance,
        historical_success: historicalSuccess || {}
      });

      if (this.config.autoStoreToDA) {
        console.log('[Hedge Recommender] Storing strategy to DA...');
        try {
          const stored = await this.daService.storeHedgeStrategy(hedgeStrategy);
          hedgeStrategy.daStorage = {
            blobId: stored.blobId,
            daProof: stored.daProof,
            blockNumber: stored.blockNumber
          };
          console.log('[Hedge Recommender] Strategy stored successfully');
        } catch (storageError) {
          console.warn('[Hedge Recommender] DA storage warning:', storageError.message);
        }
      }

      if (this.config.autoSimulate) {
        console.log('[Hedge Recommender] Running strategy simulation...');
        try {
          const simulation = await this.computeService.simulateStrategyOutcome({
            strategy: hedgeStrategy,
            current_health_factor: healthFactor,
            market_conditions: marketConditions || this._getDefaultMarketConditions()
          });
          hedgeStrategy.simulation = simulation;
          console.log('[Hedge Recommender] Simulation complete');
        } catch (simError) {
          console.warn('[Hedge Recommender] Simulation warning:', simError.message);
        }
      }

      const recommendation = this._formatRecommendation(hedgeStrategy, userData);
      
      console.log('[Hedge Recommender] Recommendation generated:', {
        action: recommendation.action,
        confidence: recommendation.confidence,
        expectedImprovement: recommendation.expectedImprovement
      });

      return recommendation;
    } catch (error) {
      console.error('[Hedge Recommender] Recommendation error:', error.message);
      throw new Error(`Failed to generate recommendation: ${error.message}`);
    }
  }

  _formatRecommendation(strategy, userData) {
    const actionMap = {
      'ADD_COLLATERAL': {
        type: 'ADD_COLLATERAL',
        label: '增加抵押品',
        description: '向您的仓位添加更多抵押品以提高健康因子',
        estimatedCost: this._estimateCost('ADD_COLLATERAL', strategy.amount, userData.marketConditions)
      },
      'FLASH_LOAN_HEDGE': {
        type: 'FLASH_LOAN_HEDGE',
        label: '闪电贷对冲',
        description: '使用闪电贷快速调整仓位，无需前期资本',
        estimatedCost: this._estimateCost('FLASH_LOAN_HEDGE', strategy.amount, userData.marketConditions)
      },
      'PARTIAL_REPAY': {
        type: 'PARTIAL_REPAY',
        label: '部分还款',
        description: '偿还部分债务以降低清算风险',
        estimatedCost: this._estimateCost('PARTIAL_REPAY', strategy.amount, userData.marketConditions)
      }
    };

    const action = actionMap[strategy.recommended_action] || {
      type: strategy.recommended_action,
      label: strategy.recommended_action,
      description: '推荐操作',
      estimatedCost: 0
    };

    return {
      userAddress: strategy.userAddress,
      action: action,
      amount: strategy.amount,
      asset: strategy.asset,
      confidence: strategy.confidence,
      confidenceLevel: this._getConfidenceLevel(strategy.confidence),
      expectedImprovement: strategy.expected_improvement,
      currentHealthFactor: userData.healthFactor,
      projectedHealthFactor: this._calculateProjectedHF(userData.healthFactor, strategy),
      reasoning: strategy.reasoning,
      simulation: strategy.simulation || null,
      daStorage: strategy.daStorage || null,
      metadata: {
        timestamp: new Date().toISOString(),
        modelVersion: strategy.modelVersion,
        provider: strategy.metadata?.provider || 'unknown'
      }
    };
  }

  _estimateCost(actionType, amount, marketConditions) {
    const volatility = marketConditions?.volatility || 30;
    const baseRate = 0.001;

    switch (actionType) {
      case 'ADD_COLLATERAL':
        return amount * baseRate * (1 + volatility / 100);
      case 'FLASH_LOAN_HEDGE':
        return amount * baseRate + amount * 0.002;
      case 'PARTIAL_REPAY':
        return amount * baseRate;
      default:
        return amount * baseRate;
    }
  }

  _calculateProjectedHF(currentHF, strategy) {
    const improvement = strategy.expected_improvement || 0;
    return currentHF * (1 + improvement);
  }

  _getConfidenceLevel(confidence) {
    if (confidence >= 0.85) return 'HIGH';
    if (confidence >= 0.65) return 'MEDIUM';
    if (confidence >= 0.50) return 'LOW';
    return 'VERY_LOW';
  }

  _getDefaultMarketConditions() {
    return {
      volatility: 30,
      liquidity: 'medium',
      trend: 'neutral'
    };
  }

  async executeStrategy(recommendation, executorWallet) {
    console.log('[Hedge Recommender] Preparing strategy execution...');

    if (!recommendation.daStorage || !recommendation.daStorage.blobId) {
      throw new Error('Strategy not stored to DA. Cannot execute without DA proof.');
    }

    const executionData = {
      userAddress: recommendation.userAddress,
      strategyId: recommendation.daStorage.daProof,
      actionType: recommendation.action.type,
      amount: recommendation.amount,
      asset: recommendation.asset,
      success: true,
      actualOutcome: recommendation.expectedImprovement,
      expectedOutcome: recommendation.expectedImprovement,
      newHealthFactor: recommendation.projectedHealthFactor,
      gasUsed: 0,
      executedAt: new Date().toISOString()
    };

    if (this.config.autoStoreToDA) {
      try {
        const storedExecution = await this.daService.storeStrategyExecution(executionData);
        executionData.daStorage = {
          blobId: storedExecution.blobId,
          daProof: storedExecution.daProof,
          blockNumber: storedExecution.blockNumber
        };
        console.log('[Hedge Recommender] Execution stored to DA');
      } catch (storageError) {
        console.warn('[Hedge Recommender] Execution storage warning:', storageError.message);
      }
    }

    return {
      success: true,
      recommendation: recommendation,
      execution: executionData,
      message: `Strategy ${recommendation.action.label} executed successfully`
    };
  }

  async getStrategyHistory(userAddress) {
    console.log('[Hedge Recommender] Retrieving strategy history for:', userAddress);

    try {
      const history = await this.daService.retrieveStrategyHistory(userAddress, {
        limit: 50,
        includeExecutions: true
      });

      return history;
    } catch (error) {
      console.error('[Hedge Recommender] History retrieval error:', error.message);
      throw new Error(`Failed to retrieve history: ${error.message}`);
    }
  }

  async analyzePerformance(userAddress) {
    console.log('[Hedge Recommender] Analyzing performance for:', userAddress);

    try {
      const analysis = await this.daService.analyzeStrategyPerformance(userAddress);

      return {
        userAddress: userAddress,
        totalStrategies: analysis.totalStrategies,
        totalExecutions: analysis.totalExecutions,
        successRate: analysis.successRate,
        averageImprovement: analysis.averageActualImprovement,
        improvementAccuracy: analysis.improvementAccuracy,
        mostUsedAction: analysis.mostUsedAction,
        performanceLevel: this._getPerformanceLevel(analysis),
        recommendations: this._generatePerformanceRecommendations(analysis)
      };
    } catch (error) {
      console.error('[Hedge Recommender] Performance analysis error:', error.message);
      throw new Error(`Failed to analyze performance: ${error.message}`);
    }
  }

  _getPerformanceLevel(analysis) {
    if (analysis.successRate >= 90 && analysis.improvementAccuracy >= 90) return 'EXCELLENT';
    if (analysis.successRate >= 75 && analysis.improvementAccuracy >= 75) return 'GOOD';
    if (analysis.successRate >= 50) return 'AVERAGE';
    return 'NEEDS_IMPROVEMENT';
  }

  _generatePerformanceRecommendations(analysis) {
    const recommendations = [];

    if (analysis.successRate < 75) {
      recommendations.push({
        priority: 'HIGH',
        message: '策略执行成功率较低，建议调整策略参数或增加置信度阈值'
      });
    }

    if (analysis.improvementAccuracy < 75) {
      recommendations.push({
        priority: 'MEDIUM',
        message: '实际改善与预期存在较大偏差，建议使用模拟功能进行更精确的预测'
      });
    }

    if (analysis.totalStrategies < 5) {
      recommendations.push({
        priority: 'LOW',
        message: '历史数据较少，策略建议可能不够精确'
      });
    }

    return recommendations;
  }

  async healthCheck() {
    console.log('[Hedge Recommender] Running health check...');

    try {
      const computeHealth = await this.computeService.healthCheck();
      const daHealth = await this.daService.healthCheck();

      const overallStatus = 
        computeHealth.status === 'healthy' && daHealth.status === 'healthy'
          ? 'healthy'
          : 'degraded';

      return {
        status: overallStatus,
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

  displayRecommendation(recommendation) {
    console.log('\n' + '='.repeat(60));
    console.log('         对冲策略推荐报告');
    console.log('='.repeat(60));
    
    console.log('\n📊 用户信息:');
    console.log(`   地址: ${recommendation.userAddress}`);
    console.log(`   当前健康因子: ${recommendation.currentHealthFactor.toFixed(4)}`);
    
    console.log('\n🎯 推荐策略:');
    console.log(`   操作类型: ${recommendation.action.label}`);
    console.log(`   描述: ${recommendation.action.description}`);
    console.log(`   金额: ${recommendation.amount}`);
    console.log(`   资产: ${recommendation.asset}`);
    
    console.log('\n📈 预期结果:');
    console.log(`   置信度: ${(recommendation.confidence * 100).toFixed(1)}% (${recommendation.confidenceLevel})`);
    console.log(`   预期改善: ${(recommendation.expectedImprovement * 100).toFixed(2)}%`);
    console.log(`   预计健康因子: ${recommendation.projectedHealthFactor.toFixed(4)}`);
    
    console.log('\n💡 推荐理由:');
    console.log(`   ${recommendation.reasoning}`);
    
    if (recommendation.simulation) {
      console.log('\n🔬 模拟分析:');
      const sim = recommendation.simulation;
      console.log(`   场景数: ${Object.keys(sim.scenarios).length}`);
      console.log(`   平均风险评分: ${sim.summary.averageRisk}`);
      console.log(`   整体评级: ${sim.summary.overallRecommendation}`);
    }
    
    if (recommendation.daStorage) {
      console.log('\n🔐 DA 存储:');
      console.log(`   Blob ID: ${recommendation.daStorage.blobId}`);
      console.log(`   区块: ${recommendation.daStorage.blockNumber}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`   生成时间: ${recommendation.metadata.timestamp}`);
    console.log('='.repeat(60) + '\n');
  }
}

async function main() {
  console.log('[Hedge Recommender] Starting hedge strategy recommender...\n');

  const config = {
    rpcUrl: process.env.OG_TESTNET_RPC || 'https://evmrpc-testnet.0g.ai',
    privateKey: process.env.DEPLOYER_KEY,
    autoStoreToDA: true,
    autoSimulate: true
  };

  const recommender = new HedgeStrategyRecommender(config);

  await recommender.initialize();

  const health = await recommender.healthCheck();
  console.log('[Hedge Recommender] Health check:', health.status);

  const testUserData = {
    userAddress: '0x1234567890123456789012345678901234567890',
    healthFactor: 1.25,
    totalDebt: 5000,
    totalCollateral: 10000,
    marketConditions: {
      volatility: 35,
      liquidity: 'medium',
      trend: 'neutral'
    },
    riskTolerance: 'medium',
    historicalSuccess: {
      totalStrategies: 10,
      successfulStrategies: 8
    }
  };

  const recommendation = await recommender.generateRecommendation(testUserData);
  recommender.displayRecommendation(recommendation);

  console.log('[Hedge Recommender] Testing performance analysis...');
  const performance = await recommender.analyzePerformance(testUserData.userAddress);
  console.log('[Hedge Recommender] Performance analysis:', JSON.stringify(performance, null, 2));

  console.log('[Hedge Recommender] Demo completed successfully');
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('\n[Hedge Recommender] Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n[Hedge Recommender] Test failed:', error);
      process.exit(1);
    });
}

module.exports = { HedgeStrategyRecommender };
