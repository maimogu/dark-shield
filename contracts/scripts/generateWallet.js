const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const wallet = ethers.Wallet.createRandom();

const walletInfo = {
  address: wallet.address,
  privateKey: wallet.privateKey
};

const outputPath = path.join(__dirname, "..", "deployer-wallet.json");
fs.writeFileSync(outputPath, JSON.stringify(walletInfo, null, 2));

console.log("钱包信息已保存到:", outputPath);
console.log("钱包地址:", wallet.address);
console.log("私钥已保存到文件，请查看:", outputPath);
