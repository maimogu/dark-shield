// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IWETH
 * @notice WETH（Wrapped ETH）接口
 * @dev 提供与 WETH 合约交互所需的函数签名
 */
interface IWETH {
    /**
     * @notice 将 ETH 转换为 WETH
     * @dev 需要发送 ETH 并附带此调用
     */
    function deposit() external payable;

    /**
     * @notice 将 WETH 转换为 ETH 并提取
     * @param amount 提取的 WETH 数量
     */
    function withdraw(uint256 amount) external;

    /**
     * @notice 转移 WETH
     * @param to 接收地址
     * @param amount 转移数量
     * @return success 是否转移成功
     */
    function transfer(address to, uint256 amount) external returns (bool);

    /**
     * @notice 查询 WETH 余额
     * @param account 查询地址
     * @return balance 该地址的 WETH 余额
     */
    function balanceOf(address account) external view returns (uint256);
}
