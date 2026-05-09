// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../interfaces/IWETH.sol";

contract MockWETH is IWETH {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function deposit() external payable override {
        balanceOf[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external override {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    receive() external payable {
        balanceOf[msg.sender] += msg.value;
    }
}
