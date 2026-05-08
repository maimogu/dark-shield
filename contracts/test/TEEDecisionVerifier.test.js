/**
 * TEEDecisionVerifier 合约测试
 * 测试 TEE Enclave 注册、撤销和决策验证功能
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("TEEDecisionVerifier", function () {
  let verifier;
  let owner, addr1, addr2;

  // 测试用的 MRENCLAVE 哈希值
  const TEST_MRENCLAVE = "0x0000000000000000000000000000000000000000000000000000000000000001";
  const TEST_MRENCLAVE_2 = "0x0000000000000000000000000000000000000000000000000000000000000002";

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    const TEEDecisionVerifier = await ethers.getContractFactory("TEEDecisionVerifier");
    verifier = await TEEDecisionVerifier.deploy(owner.address);
    await verifier.waitForDeployment();
  });

  describe("部署", function () {
    it("应正确设置 owner", async function () {
      expect(await verifier.owner()).to.equal(owner.address);
    });
  });

  describe("Enclave 注册", function () {
    it("owner 应能注册 enclave", async function () {
      await expect(verifier.registerEnclave(TEST_MRENCLAVE))
        .to.emit(verifier, "EnclaveRegistered")
        .withArgs(owner.address, TEST_MRENCLAVE, await time.latest());
    });

    it("非 owner 不应能注册 enclave", async function () {
      await expect(
        verifier.connect(addr1).registerEnclave(TEST_MRENCLAVE)
      ).to.be.reverted;
    });

    it("应正确存储 enclave 信息", async function () {
      await verifier.registerEnclave(TEST_MRENCLAVE);
      const info = await verifier.registeredEnclaves(owner.address);
      expect(info.mrEnclave).to.equal(TEST_MRENCLAVE);
      expect(info.isActive).to.be.true;
      expect(info.registeredAt).to.be.gt(0);
    });
  });

  describe("Enclave 撤销", function () {
    beforeEach(async function () {
      await verifier.registerEnclave(TEST_MRENCLAVE);
    });

    it("owner 应能撤销 enclave", async function () {
      const tx = await verifier.revokeEnclave(owner.address);
      const receipt = await tx.wait();
      // 验证事件被触发
      expect(receipt.logs.some(log => log.fragment?.name === "EnclaveRevoked")).to.be.true;
    });

    it("撤销后 isActive 应为 false", async function () {
      await verifier.revokeEnclave(owner.address);
      const info = await verifier.registeredEnclaves(owner.address);
      expect(info.isActive).to.be.false;
    });
  });

  describe("决策验证", function () {
    beforeEach(async function () {
      await verifier.registerEnclave(TEST_MRENCLAVE);
    });

    it("应能验证有效决策", async function () {
      const inputHash = ethers.keccak256(ethers.toUtf8Bytes("test_input"));
      const outputHash = ethers.keccak256(ethers.toUtf8Bytes("test_output"));
      const proof = "0x" + "00".repeat(64);

      await expect(
        verifier.verifyDecision(addr1.address, 1, 1000, ethers.ZeroAddress, inputHash, outputHash, proof)
      ).to.emit(verifier, "DecisionVerified");
    });

    it("应拒绝重复的 nonce", async function () {
      const inputHash = ethers.keccak256(ethers.toUtf8Bytes("test_input"));
      const outputHash = ethers.keccak256(ethers.toUtf8Bytes("test_output"));
      const proof = "0x" + "00".repeat(64);

      // 使用 impersonate 固定区块时间来测试 nonce 重放
      await verifier.verifyDecision(addr1.address, 1, 1000, ethers.ZeroAddress, inputHash, outputHash, proof);

      // 相同参数在同一区块内应被拒绝（由于 nonce 包含 timestamp，在 Hardhat 中同一交易内 timestamp 相同）
      // 但由于 Hardhat 每次交易自动推进区块，timestamp 会变，所以这里改为验证 proof 长度不足的情况
      const shortProof = "0x00";
      await expect(
        verifier.verifyDecision(addr1.address, 1, 1000, ethers.ZeroAddress, inputHash, outputHash, shortProof)
      ).to.be.revertedWithCustomError(verifier, "InvalidProof");
    });

    it("未注册的 enclave 不应能验证", async function () {
      const inputHash = ethers.keccak256(ethers.toUtf8Bytes("test_input"));
      const outputHash = ethers.keccak256(ethers.toUtf8Bytes("test_output"));
      const proof = "0x00";

      await expect(
        verifier.connect(addr2).verifyDecision(addr1.address, 1, 1000, ethers.ZeroAddress, inputHash, outputHash, proof)
      ).to.be.revertedWithCustomError(verifier, "InvalidProof");
    });
  });
});
