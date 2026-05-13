// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CrossChainRiskMonitor
 * @notice 跨链风险监控器
 * @dev 监控多个链上的风险状况
 */
contract CrossChainRiskMonitor is Ownable {
    /**
     * @notice 链信息结构
     */
    struct ChainInfo {
        uint256 chainId;
        string name;
        string rpcUrl;
        address riskMonitorContract;
        bool active;
    }

    /**
     * @notice 链风险数据结构
     */
    struct ChainRiskData {
        uint256 chainId;
        uint256 timestamp;
        uint256 aggregateRiskScore;
        uint256 criticalUsers;
        uint256 highRiskUsers;
        uint256 mediumRiskUsers;
        uint256 totalUsers;
        bytes32 dataHash;
        bool verified;
    }

    mapping(uint256 => ChainInfo) public chains;
    uint256[] public chainIds;
    mapping(uint256 => bool) public chainExists;
    mapping(uint256 => ChainRiskData) public latestRiskData;
    mapping(uint256 => ChainRiskData[]) public historicalRiskData;

    uint256 public constant MAX_HISTORY_LENGTH = 100;

    event ChainAdded(uint256 indexed chainId, string name, address riskMonitorContract);
    event ChainUpdated(uint256 indexed chainId, string name, address riskMonitorContract);
    event ChainRemoved(uint256 indexed chainId);
    event ChainActivated(uint256 indexed chainId);
    event ChainDeactivated(uint256 indexed chainId);
    event RiskDataUpdated(uint256 indexed chainId, uint256 aggregateRiskScore, uint256 timestamp);
    event RiskDataVerified(uint256 indexed chainId, bytes32 dataHash);
    event CrossChainAlert(uint256 indexed chainId, uint256 riskLevel, string message);

    /**
     * @notice 构造函数
     * @param initialOwner 初始所有者
     */
    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice 添加新链
     * @param chainId 链 ID
     * @param name 链名称
     * @param rpcUrl RPC URL
     * @param riskMonitorContract 风险监控合约地址
     */
    function addChain(
        uint256 chainId,
        string calldata name,
        string calldata rpcUrl,
        address riskMonitorContract
    ) external onlyOwner {
        require(!chainExists[chainId], "Chain already exists");
        require(chainId != 0, "Invalid chain ID");

        chains[chainId] = ChainInfo({
            chainId: chainId,
            name: name,
            rpcUrl: rpcUrl,
            riskMonitorContract: riskMonitorContract,
            active: true
        });

        chainIds.push(chainId);
        chainExists[chainId] = true;

        emit ChainAdded(chainId, name, riskMonitorContract);
    }

    /**
     * @notice 更新链信息
     * @param chainId 链 ID
     * @param name 链名称
     * @param rpcUrl RPC URL
     * @param riskMonitorContract 风险监控合约地址
     */
    function updateChain(
        uint256 chainId,
        string calldata name,
        string calldata rpcUrl,
        address riskMonitorContract
    ) external onlyOwner {
        require(chainExists[chainId], "Chain does not exist");

        chains[chainId].name = name;
        chains[chainId].rpcUrl = rpcUrl;
        chains[chainId].riskMonitorContract = riskMonitorContract;

        emit ChainUpdated(chainId, name, riskMonitorContract);
    }

    /**
     * @notice 激活链
     * @param chainId 链 ID
     */
    function activateChain(uint256 chainId) external onlyOwner {
        require(chainExists[chainId], "Chain does not exist");
        require(!chains[chainId].active, "Chain already active");

        chains[chainId].active = true;
        emit ChainActivated(chainId);
    }

    /**
     * @notice 停用链
     * @param chainId 链 ID
     */
    function deactivateChain(uint256 chainId) external onlyOwner {
        require(chainExists[chainId], "Chain does not exist");
        require(chains[chainId].active, "Chain already inactive");

        chains[chainId].active = false;
        emit ChainDeactivated(chainId);
    }

    /**
     * @notice 移除链
     * @param chainId 链 ID
     */
    function removeChain(uint256 chainId) external onlyOwner {
        require(chainExists[chainId], "Chain does not exist");

        delete chains[chainId];
        chainExists[chainId] = false;

        // 从数组中移除
        for (uint256 i = 0; i < chainIds.length; i++) {
            if (chainIds[i] == chainId) {
                chainIds[i] = chainIds[chainIds.length - 1];
                chainIds.pop();
                break;
            }
        }

        emit ChainRemoved(chainId);
    }

    /**
     * @notice 更新链风险数据
     * @param chainId 链 ID
     * @param riskData 风险数据
     */
    function updateRiskData(
        uint256 chainId,
        ChainRiskData calldata riskData
    ) external onlyOwner {
        require(chainExists[chainId], "Chain does not exist");
        require(chains[chainId].active, "Chain not active");

        latestRiskData[chainId] = ChainRiskData({
            chainId: chainId,
            timestamp: block.timestamp,
            aggregateRiskScore: riskData.aggregateRiskScore,
            criticalUsers: riskData.criticalUsers,
            highRiskUsers: riskData.highRiskUsers,
            mediumRiskUsers: riskData.mediumRiskUsers,
            totalUsers: riskData.totalUsers,
            dataHash: riskData.dataHash,
            verified: false
        });

        // 添加到历史数据
        historicalRiskData[chainId].push(latestRiskData[chainId]);

        // 限制历史数据长度
        if (historicalRiskData[chainId].length > MAX_HISTORY_LENGTH) {
            for (uint256 i = 0; i < historicalRiskData[chainId].length - 1; i++) {
                historicalRiskData[chainId][i] = historicalRiskData[chainId][i + 1];
            }
            historicalRiskData[chainId].pop();
        }

        emit RiskDataUpdated(chainId, riskData.aggregateRiskScore, block.timestamp);

        // 检查是否需要发出警报
        _checkAndEmitAlert(chainId, riskData.aggregateRiskScore);
    }

    /**
     * @notice 验证风险数据
     * @param chainId 链 ID
     * @param dataHash 数据哈希
     */
    function verifyRiskData(
        uint256 chainId,
        bytes32 dataHash
    ) external onlyOwner {
        require(chainExists[chainId], "Chain does not exist");
        require(latestRiskData[chainId].timestamp != 0, "No risk data available");
        require(latestRiskData[chainId].dataHash == dataHash, "Hash mismatch");

        latestRiskData[chainId].verified = true;
        emit RiskDataVerified(chainId, dataHash);
    }

    /**
     * @notice 获取所有活跃链
     * @return activeChainIds 活跃链 ID 数组
     */
    function getActiveChains() external view returns (uint256[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < chainIds.length; i++) {
            if (chains[chainIds[i]].active) {
                activeCount++;
            }
        }

        uint256[] memory activeChainIds = new uint256[](activeCount);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < chainIds.length; i++) {
            if (chains[chainIds[i]].active) {
                activeChainIds[currentIndex] = chainIds[i];
                currentIndex++;
            }
        }

        return activeChainIds;
    }

    /**
     * @notice 获取所有链
     * @return allChainIds 所有链 ID 数组
     */
    function getAllChains() external view returns (uint256[] memory) {
        return chainIds;
    }

    /**
     * @notice 获取链信息
     * @param chainId 链 ID
     * @return info 链信息
     */
    function getChainInfo(uint256 chainId) external view returns (ChainInfo memory) {
        require(chainExists[chainId], "Chain does not exist");
        return chains[chainId];
    }

    /**
     * @notice 获取最新风险数据
     * @param chainId 链 ID
     * @return riskData 风险数据
     */
    function getLatestRiskData(uint256 chainId) external view returns (ChainRiskData memory) {
        require(chainExists[chainId], "Chain does not exist");
        return latestRiskData[chainId];
    }

    /**
     * @notice 获取历史风险数据
     * @param chainId 链 ID
     * @param limit 返回数量限制
     * @return riskDataArray 风险数据数组
     */
    function getHistoricalRiskData(
        uint256 chainId,
        uint256 limit
    ) external view returns (ChainRiskData[] memory) {
        require(chainExists[chainId], "Chain does not exist");

        uint256 actualLimit = limit;
        if (actualLimit > historicalRiskData[chainId].length) {
            actualLimit = historicalRiskData[chainId].length;
        }

        ChainRiskData[] memory riskDataArray = new ChainRiskData[](actualLimit);
        for (uint256 i = 0; i < actualLimit; i++) {
            uint256 index = historicalRiskData[chainId].length - actualLimit + i;
            riskDataArray[i] = historicalRiskData[chainId][index];
        }

        return riskDataArray;
    }

    /**
     * @notice 计算跨链综合风险分数
     * @return aggregateScore 综合风险分数
     */
    function calculateCrossChainAggregateRisk() external view returns (uint256) {
        uint256 totalScore = 0;
        uint256 activeChainCount = 0;

        for (uint256 i = 0; i < chainIds.length; i++) {
            uint256 chainId = chainIds[i];
            if (chains[chainId].active && latestRiskData[chainId].timestamp != 0) {
                totalScore += latestRiskData[chainId].aggregateRiskScore;
                activeChainCount++;
            }
        }

        if (activeChainCount == 0) {
            return 50;
        }

        return totalScore / activeChainCount;
    }

    /**
     * @notice 获取所有链的最新风险数据
     * @return riskDataArray 风险数据数组
     */
    function getAllLatestRiskData() external view returns (ChainRiskData[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < chainIds.length; i++) {
            if (chains[chainIds[i]].active) {
                activeCount++;
            }
        }

        ChainRiskData[] memory riskDataArray = new ChainRiskData[](activeCount);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < chainIds.length; i++) {
            uint256 chainId = chainIds[i];
            if (chains[chainId].active) {
                riskDataArray[currentIndex] = latestRiskData[chainId];
                currentIndex++;
            }
        }

        return riskDataArray;
    }

    /**
     * @notice 检查并发出警报
     * @param chainId 链 ID
     * @param riskScore 风险分数
     */
    function _checkAndEmitAlert(uint256 chainId, uint256 riskScore) internal {
        if (riskScore >= 80) {
            emit CrossChainAlert(chainId, 3, "Critical risk level detected");
        } else if (riskScore >= 60) {
            emit CrossChainAlert(chainId, 2, "High risk level detected");
        } else if (riskScore >= 40) {
            emit CrossChainAlert(chainId, 1, "Medium risk level detected");
        }
    }
}
