// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title I0GIntegration
 * @notice 0G Integration 接口
 * @dev 定义与 0G Integration 合约交互所需的方法
 */
interface I0GIntegration {
    /**
     * @notice 清算预测结构体
     * @param probability 清算概率 (0-10000, 0.00% - 100.00%)
     * @param riskLevel 风险等级 (LOW=0, MEDIUM=1, HIGH=2, CRITICAL=3)
     * @param confidence 置信度 (0-100)
     * @param daProof 0G DA 证明哈希
     * @param timestamp 预测时间戳
     */
    struct LiquidationPrediction {
        uint256 probability;
        uint256 riskLevel;
        uint256 confidence;
        bytes32 daProof;
        uint256 timestamp;
    }

    /**
     * @notice 获取用户清算预测
     * @param _user 用户地址
     * @return prediction 清算预测结构体
     */
    function getPrediction(address _user) external view returns (LiquidationPrediction memory prediction);

    /**
     * @notice 请求清算预测
     * @param _user 用户地址
     * @param _healthFactor 健康因子
     * @param _totalDebt 总债务
     * @param _totalCollateral 总抵押品
     * @return prediction 清算预测结构体
     */
    function requestPrediction(
        address _user,
        uint256 _healthFactor,
        uint256 _totalDebt,
        uint256 _totalCollateral
    ) external returns (LiquidationPrediction memory prediction);

    /**
     * @notice 获取清算阈值
     * @return threshold 清算阈值
     */
    function liquidationThreshold() external view returns (uint256);
}
