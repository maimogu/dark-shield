/**
 * 简单的 Lock 合约测试
 * 用于验证 Hardhat 测试环境是否正常
 */
const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { ethers } = require("hardhat");

describe("Lock", function () {
  it("应正确部署 Lock 合约", async function () {
    const lockedAmount = ethers.parseEther("0.001");
    const unlockTime = (await time.latest()) + 60;

    const Lock = await ethers.getContractFactory("Lock");
    const lock = await Lock.deploy(unlockTime, { value: lockedAmount });
    await lock.waitForDeployment();

    expect(await lock.unlockTime()).to.equal(unlockTime);
    expect(await ethers.provider.getBalance(await lock.getAddress())).to.equal(lockedAmount);
  });
});
