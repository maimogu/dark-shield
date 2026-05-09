require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    testnet: {
      url: process.env.OG_TESTNET_RPC || "https://evmrpc-testnet.0g.ai",
      chainId: 16602,
      accounts: (process.env.DEPLOYER_KEY && process.env.DEPLOYER_KEY.startsWith("0x") && process.env.DEPLOYER_KEY.length === 66) ? [process.env.DEPLOYER_KEY] : ["0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"],
      gasPrice: "auto"
    }
  },
  paths: {
    sources: "./",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
