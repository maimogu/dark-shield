# DarkShield x 0G Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate 0G Compute and DA services into DarkShield to enable AI-powered liquidation prediction with verifiable data storage.

**Architecture:** This implementation adds a middleware layer (`0GIntegration.sol`) that bridges DarkShield's smart contracts with 0G's AI Compute Network for liquidation risk prediction and 0G DA for storing prediction proofs. The solution follows a phased approach, starting with liquidation prediction before expanding to risk scoring and strategy recommendations.

**Tech Stack:** 
- Solidity 0.8.20 + Hardhat
- ethers.js for SDK integration
- @0glabs/0g-compute-sdk (Compute Network)
- @0glabs/0g-da-sdk (Data Availability)
- TypeScript for test scripts

---

## Implementation Overview

This plan covers **Phase 1: Liquidation Prediction System**, which will be implemented in the following order:

1. Environment setup and SDK installation
2. Smart contract development (`0GIntegration.sol`)
3. Integration with existing `RiskHedgeExecutor.sol`
4. Testing on 0G Galileo Testnet
5. Documentation and deployment verification

---

## Phase 1: Liquidation Prediction System

### Task 1: Environment Setup and SDK Installation

**Files:**
- Create: `/workspace/contracts/.env` (from `.env.example`)
- Create: `/workspace/contracts/contracts/0GIntegration.sol`
- Modify: `/workspace/contracts/package.json` (add SDK dependencies)
- Modify: `/workspace/contracts/hardhat.config.js` (verify 0G network config)

- [ ] **Step 1: Update .env file with 0G configuration**

```bash
cd /workspace/contracts
cat > .env << 'EOF'
DEPLOYER_KEY=your_deployer_private_key_here
OG_TESTNET_RPC=https://evmrpc-testnet.0g.ai
OG_CHAIN_ID=16602
EOF
```

- [ ] **Step 2: Install 0G SDK dependencies**

```bash
cd /workspace/contracts
npm install @0glabs/0g-compute-sdk @0glabs/0g-da-sdk ethers@5.7.2
```

- [ ] **Step 3: Verify package.json dependencies**

Verify package.json includes:
```json
{
  "dependencies": {
    "@0glabs/0g-compute-sdk": "^1.0.0",
    "@0glabs/0g-da-sdk": "^1.0.0",
    "ethers": "^5.7.2"
  }
}
```

- [ ] **Step 4: Verify hardhat.config.js network settings**

Check `/workspace/contracts/hardhat.config.js` contains:
```javascript
testnet: {
  url: process.env.OG_TESTNET_RPC || "https://evmrpc-testnet.0g.ai",
  chainId: 16602,
  accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
  gasPrice: "auto"
}
```

- [ ] **Step 5: Compile existing contracts to verify setup**

```bash
cd /workspace/contracts
npx hardhat compile
```

Expected: Successful compilation of existing contracts (RiskHedgeExecutor.sol, TEEDecisionVerifier.sol)

---

### Task 2: Create 0GIntegration.sol Smart Contract

**Files:**
- Create: `/workspace/contracts/contracts/0GIntegration.sol`
- Create: `/workspace/contracts/test/0GIntegration.test.js`

- [ ] **Step 1: Create 0GIntegration.sol with basic structure**

Create `/workspace/contracts/contracts/0GIntegration.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title 0GIntegration
 * @notice Bridge contract for 0G Compute and DA integration with DarkShield
 * @dev Handles liquidation prediction requests and stores proofs on 0G DA
 */
contract 0GIntegration is Ownable, ReentrancyGuard {
    
    // ============ Data Structures ============
    
    struct LiquidationPrediction {
        uint256 probability;      // 0-10000 (0.00% - 100.00%)
        uint256 riskLevel;        // 1-4 (LOW=1, MEDIUM=2, HIGH=3, CRITICAL=4)
        uint256 confidence;       // 0-100
        bytes32 daProof;          // Storage proof from 0G DA
        uint256 timestamp;
    }
    
    struct PredictionRequest {
        uint256 healthFactor;
        uint256 totalDebt;
        uint256 totalCollateral;
        address user;
    }
    
    // ============ Constants ============
    
    uint256 public constant RISK_LOW = 1;
    uint256 public constant RISK_MEDIUM = 2;
    uint256 public constant RISK_HIGH = 3;
    uint256 public constant RISK_CRITICAL = 4;
    
    // ============ State Variables ============
    
    /// @notice Risk threshold for auto-hedge trigger
    uint256 public liquidationThreshold = 5000; // 50%
    
    /// @notice Mapping of user to their latest prediction
    mapping(address => LiquidationPrediction) public predictions;
    
    /// @notice Mapping of user to their last prediction request
    mapping(address => PredictionRequest) public lastRequests;
    
    // ============ Events ============
    
    event LiquidationRiskPredicted(
        address indexed user,
        uint256 probability,
        uint256 riskLevel,
        uint256 confidence,
        bytes32 daProof
    );
    
    event ThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    
    // ============ Errors ============
    
    error InvalidHealthFactor();
    error PredictionNotAvailable();
    
    // ============ Constructor ============
    
    constructor(address initialOwner) Ownable(initialOwner) {}
    
    // ============ External Functions ============
    
    /**
     * @notice Request liquidation risk prediction for a user
     * @dev Called by RiskHedgeExecutor or external keepers
     * @param user Address of the user to predict risk for
     * @param healthFactor Current health factor from Aave (scaled by 1e18)
     * @param totalDebt Total debt amount
     * @param totalCollateral Total collateral amount
     * @return prediction The liquidation prediction result
     */
    function requestPrediction(
        address user,
        uint256 healthFactor,
        uint256 totalDebt,
        uint256 totalCollateral
    ) external returns (LiquidationPrediction memory prediction) {
        if (healthFactor == 0) revert InvalidHealthFactor();
        
        // Store the request
        lastRequests[user] = PredictionRequest({
            healthFactor: healthFactor,
            totalDebt: totalDebt,
            totalCollateral: totalCollateral,
            user: user
        });
        
        // Calculate basic prediction (simplified version)
        // Full AI prediction will come from 0G Compute SDK off-chain
        uint256 probability = _calculateBasicProbability(healthFactor, totalDebt, totalCollateral);
        uint256 riskLevel = _calculateRiskLevel(probability);
        uint256 confidence = 85; // Base confidence for on-chain calculation
        
        // Store prediction
        prediction = LiquidationPrediction({
            probability: probability,
            riskLevel: riskLevel,
            confidence: confidence,
            daProof: bytes32(0), // Will be updated when 0G DA proof is received
            timestamp: block.timestamp
        });
        
        predictions[user] = prediction;
        
        emit LiquidationRiskPredicted(
            user,
            probability,
            riskLevel,
            confidence,
            bytes32(0)
        );
        
        return prediction;
    }
    
    /**
     * @notice Update prediction with 0G DA proof
     * @dev Called after off-chain 0G Compute and DA storage
     * @param user Address of the user
     * @param aiProbability AI-calculated probability
     * @param aiConfidence AI confidence level
     * @param daProof 0G DA storage proof
     */
    function updatePredictionWithProof(
        address user,
        uint256 aiProbability,
        uint256 aiConfidence,
        bytes32 daProof
    ) external onlyOwner {
        LiquidationPrediction storage prediction = predictions[user];
        if (prediction.timestamp == 0) revert PredictionNotAvailable();
        
        prediction.probability = aiProbability;
        prediction.confidence = aiConfidence;
        prediction.riskLevel = _calculateRiskLevel(aiProbability);
        prediction.daProof = daProof;
        
        emit LiquidationRiskPredicted(
            user,
            aiProbability,
            prediction.riskLevel,
            aiConfidence,
            daProof
        );
    }
    
    /**
     * @notice Get the latest prediction for a user
     * @param user Address of the user
     * @return prediction The latest prediction or empty struct
     */
    function getPrediction(address user) external view returns (LiquidationPrediction memory prediction) {
        return predictions[user];
    }
    
    /**
     * @notice Update liquidation threshold
     * @dev Only owner can update
     * @param newThreshold New threshold (0-10000)
     */
    function updateThreshold(uint256 newThreshold) external onlyOwner {
        require(newThreshold <= 10000, "Threshold must be 0-10000");
        uint256 oldThreshold = liquidationThreshold;
        liquidationThreshold = newThreshold;
        emit ThresholdUpdated(oldThreshold, newThreshold);
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Calculate basic liquidation probability
     * @dev Simplified on-chain calculation
     */
    function _calculateBasicProbability(
        uint256 healthFactor,
        uint256 totalDebt,
        uint256 totalCollateral
    ) internal pure returns (uint256 probability) {
        if (totalDebt == 0) return 0;
        if (healthFactor < 1e18) return 10000; // Already liquidatable
        if (healthFactor >= 2e18) return 0; // Very safe
        
        // Linear interpolation between 1x and 2x health factor
        uint256 hfBasis = (healthFactor * 10000) / 1e18;
        if (hfBasis > 20000) return 0;
        if (hfBasis < 10000) return 10000;
        
        return 20000 - hfBasis;
    }
    
    /**
     * @notice Calculate risk level from probability
     */
    function _calculateRiskLevel(uint256 probability) internal pure returns (uint256 riskLevel) {
        if (probability >= 7500) return RISK_CRITICAL;
        if (probability >= 5000) return RISK_HIGH;
        if (probability >= 2500) return RISK_MEDIUM;
        return RISK_LOW;
    }
}
```

- [ ] **Step 2: Create unit tests for 0GIntegration.sol**

Create `/workspace/contracts/test/0GIntegration.test.js`:

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("0GIntegration", function () {
  let contract;
  let owner;
  let user;
  
  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();
    
    const Contract = await ethers.getContractFactory("0GIntegration");
    contract = await Contract.deploy(owner.address);
    await contract.deployed();
  });
  
  describe("requestPrediction", function () {
    it("should create prediction for healthy user", async function () {
      const healthFactor = ethers.utils.parseUnits("2.0", 18);
      const totalDebt = ethers.utils.parseUnits("1000", 6);
      const totalCollateral = ethers.utils.parseUnits("3000", 18);
      
      const prediction = await contract.requestPrediction(
        user.address,
        healthFactor,
        totalDebt,
        totalCollateral
      );
      
      expect(prediction.probability).to.equal(0);
      expect(prediction.riskLevel).to.equal(1); // LOW
      expect(prediction.timestamp).to.be.gt(0);
    });
    
    it("should create prediction for liquidatable user", async function () {
      const healthFactor = ethers.utils.parseUnits("0.9", 18);
      const totalDebt = ethers.utils.parseUnits("1000", 6);
      const totalCollateral = ethers.utils.parseUnits("900", 18);
      
      const prediction = await contract.requestPrediction(
        user.address,
        healthFactor,
        totalDebt,
        totalCollateral
      );
      
      expect(prediction.probability).to.equal(10000);
      expect(prediction.riskLevel).to.equal(4); // CRITICAL
    });
    
    it("should reject zero health factor", async function () {
      await expect(
        contract.requestPrediction(user.address, 0, 1000, 1000)
      ).to.be.revertedWith("InvalidHealthFactor");
    });
  });
  
  describe("getPrediction", function () {
    it("should return stored prediction", async function () {
      await contract.requestPrediction(
        user.address,
        ethers.utils.parseUnits("1.5", 18),
        1000,
        2000
      );
      
      const prediction = await contract.getPrediction(user.address);
      expect(prediction.probability).to.be.gt(0);
    });
  });
  
  describe("updateThreshold", function () {
    it("should allow owner to update threshold", async function () {
      await contract.updateThreshold(6000);
      expect(await contract.liquidationThreshold()).to.equal(6000);
    });
    
    it("should reject non-owner update", async function () {
      await expect(
        contract.connect(user).updateThreshold(6000)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
```

- [ ] **Step 3: Run tests to verify contract**

```bash
cd /workspace/contracts
npx hardhat test test/0GIntegration.test.js
```

Expected: All tests should pass

- [ ] **Step 4: Compile contract**

```bash
cd /workspace/contracts
npx hardhat compile
```

Expected: Successful compilation of 0GIntegration.sol

---

### Task 3: Create 0G SDK Integration Service

**Files:**
- Create: `/workspace/contracts/scripts/0g-compute-service.js`
- Create: `/workspace/contracts/scripts/0g-da-service.js`

- [ ] **Step 1: Create 0G Compute Service**

Create `/workspace/contracts/scripts/0g-compute-service.js`:

```javascript
const { ComputeSDK } = require('@0glabs/0g-compute-sdk');
const { ethers } = require('ethers');

class 0GComputeService {
  constructor(config) {
    this.sdk = new ComputeSDK({
      network: config.network || 'testnet',
      rpcUrl: config.rpcUrl,
      privateKey: config.privateKey
    });
    this.signer = new ethers.Wallet(config.privateKey, config.rpcUrl);
  }
  
  /**
   * Predict liquidation risk using AI
   * @param {Object} userData - User's financial data
   * @returns {Object} Prediction result
   */
  async predictLiquidationRisk(userData) {
    try {
      const result = await this.sdk.inference({
        model: 'liquidation-prediction-v1',
        input: {
          health_factor: userData.healthFactor,
          total_debt: userData.totalDebt,
          total_collateral: userData.totalCollateral,
          market_volatility: userData.marketVolatility || 0.3,
          historical_volatility: userData.historicalVolatility || 0.2,
          timestamp: Math.floor(Date.now() / 1000)
        }
      });
      
      return {
        probability: result.probability,
        confidence: result.confidence,
        riskLevel: this.calculateRiskLevel(result.probability),
        modelVersion: result.model_version
      };
    } catch (error) {
      console.error('0G Compute error:', error);
      throw error;
    }
  }
  
  /**
   * Calculate risk level from probability
   */
  calculateRiskLevel(probability) {
    if (probability >= 0.75) return 4; // CRITICAL
    if (probability >= 0.50) return 3; // HIGH
    if (probability >= 0.25) return 2; // MEDIUM
    return 1; // LOW
  }
  
  /**
   * Get account balance for service fees
   */
  async getBalance() {
    return await this.signer.getBalance();
  }
}

module.exports = { 0GComputeService };
```

- [ ] **Step 2: Create 0G DA Service**

Create `/workspace/contracts/scripts/0g-da-service.js`:

```javascript
const { DASDK } = require('@0glabs/0g-da-sdk');
const { ethers } = require('ethers');

class 0GStorageService {
  constructor(config) {
    this.sdk = new DASDK({
      rpcUrl: config.rpcUrl,
      entranceContract: config.entranceContract || '0x857C0A28A8634614BB2C96039Cf4a20AFF709Aa9'
    });
    this.signer = new ethers.Wallet(config.privateKey, config.rpcUrl);
  }
  
  /**
   * Store prediction data on 0G DA
   * @param {Object} predictionData - Prediction data to store
   * @returns {Object} Storage result with proof
   */
  async storePrediction(predictionData) {
    try {
      const dataToStore = JSON.stringify({
        type: 'liquidation_prediction',
        ...predictionData,
        timestamp: Date.now()
      });
      
      const result = await this.sdk.store({
        data: dataToStore,
        options: {
          fee: 'auto'
        }
      });
      
      return {
        success: true,
        daProof: result.storageProof,
        blobId: result.blobId,
        blockNumber: result.blockNumber
      };
    } catch (error) {
      console.error('0G DA storage error:', error);
      throw error;
    }
  }
  
  /**
   * Retrieve stored prediction from 0G DA
   * @param {string} blobId - Blob ID to retrieve
   * @returns {Object} Retrieved prediction data
   */
  async retrievePrediction(blobId) {
    try {
      const data = await this.sdk.retrieve(blobId);
      return JSON.parse(data);
    } catch (error) {
      console.error('0G DA retrieval error:', error);
      throw error;
    }
  }
  
  /**
   * Get account balance for storage fees
   */
  async getBalance() {
    return await this.signer.getBalance();
  }
}

module.exports = { 0GStorageService };
```

- [ ] **Step 3: Create integration script for complete flow**

Create `/workspace/contracts/scripts/integrate-0g-prediction.js`:

```javascript
const { ethers } = require('hardhat');
const { 0GComputeService } = require('./0g-compute-service');
const { 0GStorageService } = require('./0g-da-service');

async function main() {
  console.log('========================================');
  console.log('  0G Integration - Liquidation Prediction');
  console.log('========================================\n');
  
  const [deployer] = await ethers.getSigners();
  console.log('Deployer:', deployer.address);
  
  // Configuration
  const config = {
    network: 'testnet',
    rpcUrl: process.env.OG_TESTNET_RPC || 'https://evmrpc-testnet.0g.ai',
    privateKey: process.env.DEPLOYER_KEY,
    entranceContract: '0x857C0A28A8634614BB2C96039Cf4a20AFF709Aa9'
  };
  
  // Initialize services
  const computeService = new 0GComputeService(config);
  const storageService = new 0GStorageService(config);
  
  // Get contract
  const integrationContract = await ethers.getContractAt(
    '0GIntegration',
    '0xYourDeployedContractAddress' // Update with deployed address
  );
  
  // Example user data (from Aave)
  const userAddress = '0xUserAddress'; // Replace with actual user
  const userData = {
    healthFactor: 1.5e18,  // 1.5 health factor
    totalDebt: 1000e6,     // 1000 USDC debt
    totalCollateral: 2000e18, // 2000 ETH collateral
    marketVolatility: 0.35,
    historicalVolatility: 0.25
  };
  
  console.log('User Data:', userData);
  
  try {
    // Step 1: Get basic prediction from contract
    console.log('\n1. Getting basic on-chain prediction...');
    const basicPrediction = await integrationContract.getPrediction(userAddress);
    console.log('Basic prediction:', basicPrediction);
    
    // Step 2: Get AI prediction from 0G Compute
    console.log('\n2. Requesting AI prediction from 0G Compute...');
    const aiPrediction = await computeService.predictLiquidationRisk(userData);
    console.log('AI Prediction:', aiPrediction);
    
    // Step 3: Store on 0G DA
    console.log('\n3. Storing prediction on 0G DA...');
    const storageResult = await storageService.storePrediction({
      user: userAddress,
      ...aiPrediction,
      sourceData: userData
    });
    console.log('Storage Result:', storageResult);
    
    // Step 4: Update contract with full prediction
    console.log('\n4. Updating contract with DA proof...');
    const tx = await integrationContract.updatePredictionWithProof(
      userAddress,
      Math.floor(aiPrediction.probability * 100), // Convert to 0-10000 scale
      aiPrediction.confidence,
      storageResult.daProof
    );
    await tx.wait();
    console.log('Contract updated! Transaction:', tx.hash);
    
    // Step 5: Verify final prediction
    console.log('\n5. Final prediction:');
    const finalPrediction = await integrationContract.getPrediction(userAddress);
    console.log(finalPrediction);
    
    console.log('\n========================================');
    console.log('  Integration Complete!');
    console.log('========================================');
    
  } catch (error) {
    console.error('\nError:', error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

---

### Task 4: Update RiskHedgeExecutor Integration

**Files:**
- Modify: `/workspace/contracts/contracts/RiskHedgeExecutor.sol` (add 0GIntegration reference)
- Create: `/workspace/contracts/test/RiskHedgeExecutor-0G.test.js`

- [ ] **Step 1: Add 0GIntegration interface to RiskHedgeExecutor**

Add these imports and interface to `/workspace/contracts/contracts/RiskHedgeExecutor.sol`:

```solidity
// Add to imports
import "./interfaces/I0GIntegration.sol";

// Add to contract definition
interface I0GIntegration {
    struct LiquidationPrediction {
        uint256 probability;
        uint256 riskLevel;
        uint256 confidence;
        bytes32 daProof;
        uint256 timestamp;
    }
    
    function getPrediction(address user) external view returns (LiquidationPrediction memory);
    function requestPrediction(address user, uint256 healthFactor, uint256 totalDebt, uint256 totalCollateral) external returns (LiquidationPrediction memory);
    function liquidationThreshold() external view returns (uint256);
}
```

Add state variable:
```solidity
/// @notice 0G Integration contract address
address public zeroGIntegration;
```

Add function to set 0G Integration:
```solidity
/**
 * @notice Set 0G Integration contract address
 * @dev Only owner can update
 * @param _zeroGIntegration Address of 0G Integration contract
 */
function setZeroGIntegration(address _zeroGIntegration) external onlyOwner {
    require(_zeroGIntegration != address(0), "Invalid address");
    zeroGIntegration = _zeroGIntegration;
}
```

Update triggerRiskCheck function to use 0G:
```solidity
/**
 * @notice Trigger risk check with 0G AI prediction
 * @dev Uses 0G Compute for advanced prediction
 */
function triggerRiskCheckWith0G(address _user) external nonReentrant {
    // ... existing checks ...
    
    // Get prediction from 0G Integration
    if (zeroGIntegration != address(0)) {
        I0GIntegration.LiquidationPrediction memory prediction = I0GIntegration(zeroGIntegration).getPrediction(_user);
        
        // Use 0G prediction for risk assessment
        if (prediction.timestamp > 0 && prediction.confidence > 70) {
            // Use AI prediction
            score = prediction.probability / 100; // Convert from 0-10000 to 0-100
        }
    }
    
    // ... rest of function ...
}
```

- [ ] **Step 2: Create integration tests**

Create `/workspace/contracts/test/RiskHedgeExecutor-0G.test.js`:

```javascript
describe("RiskHedgeExecutor with 0G Integration", function () {
  let riskHedgeExecutor;
  let zeroGIntegration;
  let owner;
  
  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    
    // Deploy 0G Integration
    const 0GIntegration = await ethers.getContractFactory("0GIntegration");
    zeroGIntegration = await 0GIntegration.deploy(owner.address);
    
    // Deploy RiskHedgeExecutor
    const RiskHedgeExecutor = await ethers.getContractFactory("RiskHedgeExecutor");
    riskHedgeExecutor = await RiskHedgeExecutor.deploy(
      '0xA', // Aave Pool
      '0xB', // WETH
      '0xC', // USDC
      '0xD'  // TEE Verifier
    );
    
    // Set 0G Integration
    await riskHedgeExecutor.setZeroGIntegration(zeroGIntegration.address);
  });
  
  it("should use 0G prediction when available", async function () {
    // Create a high-risk prediction
    await zeroGIntegration.requestPrediction(
      user.address,
      ethers.utils.parseUnits("1.2", 18),
      1000,
      1500
    );
    
    // Trigger risk check
    await riskHedgeExecutor.triggerRiskCheckWith0G(user.address);
    
    // Verify prediction was used
    const prediction = await zeroGIntegration.getPrediction(user.address);
    expect(prediction.probability).to.be.gt(0);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd /workspace/contracts
npx hardhat test test/RiskHedgeExecutor-0G.test.js
```

---

### Task 5: Deploy to Testnet

**Files:**
- Create: `/workspace/contracts/scripts/deploy-0g-integration.js`

- [ ] **Step 1: Create deployment script**

Create `/workspace/contracts/scripts/deploy-0g-integration.js`:

```javascript
const { ethers } = require("hardhat");

async function main() {
    console.log("========================================");
    console.log("  Deploying 0G Integration Contract");
    console.log("========================================\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.utils.formatEther(balance), "ETH\n");

    // Deploy 0G Integration
    console.log("Deploying 0GIntegration...");
    const 0GIntegration = await ethers.getContractFactory("0GIntegration");
    const integration = await 0GIntegration.deploy(deployer.address);
    await integration.deployed();
    
    console.log("0GIntegration deployed to:", integration.address);
    console.log("Transaction hash:", integration.deploymentTransaction().hash);
    
    // Save deployment info
    const fs = require("fs");
    const path = require("path");
    
    const deploymentInfo = {
        network: "testnet",
        chainId: 16602,
        contracts: {
            "0GIntegration": {
                address: integration.address,
                transactionHash: integration.deploymentTransaction().hash
            }
        },
        deployedAt: new Date().toISOString()
    };
    
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    const filePath = path.join(deploymentsDir, "deployment-0g-integration.json");
    fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
    
    console.log("\nDeployment info saved to:", filePath);
    console.log("\n========================================");
    console.log("  Deployment Complete!");
    console.log("========================================");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
```

- [ ] **Step 2: Deploy to testnet**

```bash
cd /workspace/contracts
npx hardhat run scripts/deploy-0g-integration.js --network testnet
```

Expected output:
```
========================================
  Deploying 0G Integration Contract
========================================

Deployer address: 0x...
Balance: X.XXXX ETH

Deploying 0GIntegration...
0GIntegration deployed to: 0x...
Transaction hash: 0x...

Deployment info saved to: deployments/deployment-0g-integration.json

========================================
  Deployment Complete!
========================================
```

- [ ] **Step 3: Verify on block explorer**

1. Open https://chainscan-galileo.0g.ai/
2. Search for the deployed contract address
3. Verify contract is created and has transactions

---

### Task 6: Create Documentation

**Files:**
- Create: `/workspace/docs/0G_INTEGRATION_README.md`

- [ ] **Step 1: Create integration documentation**

Create `/workspace/docs/0G_INTEGRATION_README.md`:

```markdown
# DarkShield x 0G Integration Guide

## Overview

This guide explains how to integrate 0G's Compute Network and Data Availability layer into DarkShield for AI-powered liquidation prediction.

## Architecture

```
User/Frontend
    ↓
RiskHedgeExecutor.triggerRiskCheck()
    ↓
0GIntegration Contract
    ↓ (off-chain)
0G Compute SDK → AI Model
    ↓
0G DA SDK → Data Storage
    ↓
Verification Proof → Contract Update
```

## Setup

### 1. Environment Variables

Create `.env` file:
```bash
DEPLOYER_KEY=your_private_key
OG_TESTNET_RPC=https://evmrpc-testnet.0g.ai
```

### 2. Install Dependencies

```bash
npm install @0glabs/0g-compute-sdk @0glabs/0g-da-sdk
```

### 3. Deploy Contracts

```bash
npx hardhat run scripts/deploy-0g-integration.js --network testnet
```

## Usage

### 1. Basic On-Chain Prediction

```javascript
const prediction = await integrationContract.getPrediction(userAddress);
```

### 2. Request AI Prediction

```javascript
const tx = await integrationContract.requestPrediction(
  userAddress,
  healthFactor,
  totalDebt,
  totalCollateral
);
await tx.wait();
```

### 3. Update with 0G DA Proof

```javascript
await integrationContract.updatePredictionWithProof(
  userAddress,
  aiProbability,
  aiConfidence,
  daProof
);
```

## Testing

Run tests:
```bash
npx hardhat test test/0GIntegration.test.js
npx hardhat test test/RiskHedgeExecutor-0G.test.js
```

## Troubleshooting

### Issue: "AI service unavailable"

**Solution**: Fallback to basic on-chain calculation
```javascript
if (aiServiceError) {
  const basicPrediction = await calculateBasicRisk(userData);
  return basicPrediction;
}
```

### Issue: "DA storage failed"

**Solution**: Log error but continue execution
```javascript
try {
  const proof = await daService.store(data);
} catch (error) {
  console.error("DA storage failed, continuing...");
}
```

## Next Steps

- [ ] Phase 2: Implement risk scoring with 0G Compute
- [ ] Phase 3: Add strategy recommendation engine
- [ ] Deploy to mainnet

## Resources

- [0G Documentation](https://docs.0g.ai/)
- [0G Compute SDK](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/sdk)
- [0G DA SDK](https://docs.0g.ai/developer-hub/building-on-0g/da-integration)
```

---

## Phase 1 Completion Checklist

- [ ] Task 1: Environment Setup & SDK Installation - COMPLETE
- [ ] Task 2: 0GIntegration.sol Smart Contract - COMPLETE
- [ ] Task 3: 0G SDK Integration Services - COMPLETE
- [ ] Task 4: RiskHedgeExecutor Integration - COMPLETE
- [ ] Task 5: Testnet Deployment - COMPLETE
- [ ] Task 6: Documentation - COMPLETE

**Phase 1 Success Criteria:**

- [ ] All tests passing (4/4)
- [ ] Contract deployed to 0G testnet
- [ ] Basic prediction working on-chain
- [ ] 0G Compute integration functional
- [ ] 0G DA storage working
- [ ] Documentation complete

---

## Next Phases Preview

**Phase 2: Risk Scoring System (Weeks 4-7)**
- Implement historical data retrieval from 0G DA
- Create comprehensive risk scoring AI model
- Add batch processing for multiple users
- Performance optimization

**Phase 3: Strategy Recommendation (Weeks 8-12)**
- Deploy strategy recommendation AI
- Implement multi-factor analysis
- Create execution verification system
- User interface for recommendations

---

**End of Implementation Plan**
