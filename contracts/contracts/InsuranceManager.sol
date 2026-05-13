// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title InsuranceManager
 * @notice DeFi 保险管理器
 * @dev 管理多个 DeFi 保险协议的集成
 */
contract InsuranceManager is Ownable {
    /**
     * @notice 保险协议信息结构
     */
    struct InsuranceProvider {
        uint256 providerId;
        string name;
        address contractAddress;
        bool active;
        uint256 totalPolicies;
        uint256 totalCoverage;
    }

    /**
     * @notice 保险政策结构
     */
    struct InsurancePolicy {
        uint256 policyId;
        address user;
        uint256 providerId;
        uint256 coverageAmount;
        uint256 premium;
        uint256 startTimestamp;
        uint256 endTimestamp;
        bool active;
        bool claimed;
        bytes32 policyDataHash;
    }

    /**
     * @notice 索赔结构
     */
    struct Claim {
        uint256 claimId;
        uint256 policyId;
        address user;
        uint256 amount;
        string reason;
        uint256 timestamp;
        ClaimStatus status;
        bytes32 claimDataHash;
    }

    enum ClaimStatus {
        Pending,
        Approved,
        Rejected,
        Paid
    }

    mapping(uint256 => InsuranceProvider) public providers;
    uint256[] public providerIds;
    mapping(uint256 => bool) public providerExists;
    uint256 public nextProviderId;

    mapping(uint256 => InsurancePolicy) public policies;
    mapping(address => uint256[]) public userPolicies;
    uint256 public nextPolicyId;

    mapping(uint256 => Claim) public claims;
    mapping(uint256 => uint256[]) public policyClaims;
    uint256 public nextClaimId;

    address public immutable USDC;

    event ProviderAdded(uint256 indexed providerId, string name, address contractAddress);
    event ProviderUpdated(uint256 indexed providerId, string name, address contractAddress);
    event ProviderRemoved(uint256 indexed providerId);
    event ProviderActivated(uint256 indexed providerId);
    event ProviderDeactivated(uint256 indexed providerId);
    event PolicyCreated(uint256 indexed policyId, address indexed user, uint256 providerId, uint256 coverageAmount);
    event PolicyCancelled(uint256 indexed policyId);
    event ClaimSubmitted(uint256 indexed claimId, uint256 indexed policyId, address indexed user, uint256 amount);
    event ClaimApproved(uint256 indexed claimId, uint256 indexed policyId);
    event ClaimRejected(uint256 indexed claimId, uint256 indexed policyId, string reason);
    event ClaimPaid(uint256 indexed claimId, uint256 indexed policyId, uint256 amount);

    /**
     * @notice 构造函数
     * @param initialOwner 初始所有者
     * @param usdcAddress USDC 代币地址
     */
    constructor(address initialOwner, address usdcAddress) Ownable(initialOwner) {
        USDC = usdcAddress;
        nextProviderId = 1;
        nextPolicyId = 1;
        nextClaimId = 1;
    }

    /**
     * @notice 添加保险提供商
     * @param name 提供商名称
     * @param contractAddress 合约地址
     */
    function addProvider(
        string calldata name,
        address contractAddress
    ) external onlyOwner {
        require(contractAddress != address(0), "Invalid contract address");

        uint256 providerId = nextProviderId++;
        providers[providerId] = InsuranceProvider({
            providerId: providerId,
            name: name,
            contractAddress: contractAddress,
            active: true,
            totalPolicies: 0,
            totalCoverage: 0
        });

        providerIds.push(providerId);
        providerExists[providerId] = true;

        emit ProviderAdded(providerId, name, contractAddress);
    }

    /**
     * @notice 更新保险提供商
     * @param providerId 提供商 ID
     * @param name 提供商名称
     * @param contractAddress 合约地址
     */
    function updateProvider(
        uint256 providerId,
        string calldata name,
        address contractAddress
    ) external onlyOwner {
        require(providerExists[providerId], "Provider does not exist");
        require(contractAddress != address(0), "Invalid contract address");

        providers[providerId].name = name;
        providers[providerId].contractAddress = contractAddress;

        emit ProviderUpdated(providerId, name, contractAddress);
    }

    /**
     * @notice 激活保险提供商
     * @param providerId 提供商 ID
     */
    function activateProvider(uint256 providerId) external onlyOwner {
        require(providerExists[providerId], "Provider does not exist");
        require(!providers[providerId].active, "Provider already active");

        providers[providerId].active = true;
        emit ProviderActivated(providerId);
    }

    /**
     * @notice 停用保险提供商
     * @param providerId 提供商 ID
     */
    function deactivateProvider(uint256 providerId) external onlyOwner {
        require(providerExists[providerId], "Provider does not exist");
        require(providers[providerId].active, "Provider already inactive");

        providers[providerId].active = false;
        emit ProviderDeactivated(providerId);
    }

    /**
     * @notice 移除保险提供商
     * @param providerId 提供商 ID
     */
    function removeProvider(uint256 providerId) external onlyOwner {
        require(providerExists[providerId], "Provider does not exist");

        delete providers[providerId];
        providerExists[providerId] = false;

        // 从数组中移除
        for (uint256 i = 0; i < providerIds.length; i++) {
            if (providerIds[i] == providerId) {
                providerIds[i] = providerIds[providerIds.length - 1];
                providerIds.pop();
                break;
            }
        }

        emit ProviderRemoved(providerId);
    }

    /**
     * @notice 创建保险政策
     * @param providerId 提供商 ID
     * @param coverageAmount 保额
     * @param premium 保费
     * @param duration 持续时间（秒）
     * @param policyDataHash 政策数据哈希
     */
    function createPolicy(
        uint256 providerId,
        uint256 coverageAmount,
        uint256 premium,
        uint256 duration,
        bytes32 policyDataHash
    ) external {
        require(providerExists[providerId], "Provider does not exist");
        require(providers[providerId].active, "Provider not active");
        require(coverageAmount > 0, "Coverage amount must be positive");
        require(duration > 0, "Duration must be positive");

        // 转移保费
        require(IERC20(USDC).transferFrom(msg.sender, address(this), premium), "Premium transfer failed");

        uint256 policyId = nextPolicyId++;
        policies[policyId] = InsurancePolicy({
            policyId: policyId,
            user: msg.sender,
            providerId: providerId,
            coverageAmount: coverageAmount,
            premium: premium,
            startTimestamp: block.timestamp,
            endTimestamp: block.timestamp + duration,
            active: true,
            claimed: false,
            policyDataHash: policyDataHash
        });

        userPolicies[msg.sender].push(policyId);
        providers[providerId].totalPolicies++;
        providers[providerId].totalCoverage += coverageAmount;

        emit PolicyCreated(policyId, msg.sender, providerId, coverageAmount);
    }

    /**
     * @notice 取消保险政策
     * @param policyId 政策 ID
     */
    function cancelPolicy(uint256 policyId) external {
        require(policies[policyId].user == msg.sender, "Not policy owner");
        require(policies[policyId].active, "Policy not active");

        policies[policyId].active = false;
        providers[policies[policyId].providerId].totalCoverage -= policies[policyId].coverageAmount;

        emit PolicyCancelled(policyId);
    }

    /**
     * @notice 提交索赔
     * @param policyId 政策 ID
     * @param amount 索赔金额
     * @param reason 索赔原因
     * @param claimDataHash 索赔数据哈希
     */
    function submitClaim(
        uint256 policyId,
        uint256 amount,
        string calldata reason,
        bytes32 claimDataHash
    ) external {
        require(policies[policyId].user == msg.sender, "Not policy owner");
        require(policies[policyId].active, "Policy not active");
        require(!policies[policyId].claimed, "Policy already claimed");
        require(amount <= policies[policyId].coverageAmount, "Claim exceeds coverage");
        require(block.timestamp <= policies[policyId].endTimestamp, "Policy expired");

        uint256 claimId = nextClaimId++;
        claims[claimId] = Claim({
            claimId: claimId,
            policyId: policyId,
            user: msg.sender,
            amount: amount,
            reason: reason,
            timestamp: block.timestamp,
            status: ClaimStatus.Pending,
            claimDataHash: claimDataHash
        });

        policyClaims[policyId].push(claimId);

        emit ClaimSubmitted(claimId, policyId, msg.sender, amount);
    }

    /**
     * @notice 批准索赔
     * @param claimId 索赔 ID
     */
    function approveClaim(uint256 claimId) external onlyOwner {
        require(claims[claimId].status == ClaimStatus.Pending, "Claim not pending");

        claims[claimId].status = ClaimStatus.Approved;
        emit ClaimApproved(claimId, claims[claimId].policyId);
    }

    /**
     * @notice 拒绝索赔
     * @param claimId 索赔 ID
     * @param reason 拒绝原因
     */
    function rejectClaim(uint256 claimId, string calldata reason) external onlyOwner {
        require(claims[claimId].status == ClaimStatus.Pending, "Claim not pending");

        claims[claimId].status = ClaimStatus.Rejected;
        emit ClaimRejected(claimId, claims[claimId].policyId, reason);
    }

    /**
     * @notice 支付索赔
     * @param claimId 索赔 ID
     */
    function payClaim(uint256 claimId) external onlyOwner {
        require(claims[claimId].status == ClaimStatus.Approved, "Claim not approved");

        claims[claimId].status = ClaimStatus.Paid;
        policies[claims[claimId].policyId].claimed = true;

        // 转移索赔金额
        require(IERC20(USDC).transfer(claims[claimId].user, claims[claimId].amount), "Claim payment failed");

        emit ClaimPaid(claimId, claims[claimId].policyId, claims[claimId].amount);
    }

    /**
     * @notice 获取用户的所有政策
     * @param user 用户地址
     * @return policyIds 政策 ID 数组
     */
    function getUserPolicies(address user) external view returns (uint256[] memory) {
        return userPolicies[user];
    }

    /**
     * @notice 获取政策的所有索赔
     * @param policyId 政策 ID
     * @return claimIds 索赔 ID 数组
     */
    function getPolicyClaims(uint256 policyId) external view returns (uint256[] memory) {
        return policyClaims[policyId];
    }

    /**
     * @notice 获取所有活跃的提供商
     * @return activeProviderIds 活跃提供商 ID 数组
     */
    function getActiveProviders() external view returns (uint256[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < providerIds.length; i++) {
            if (providers[providerIds[i]].active) {
                activeCount++;
            }
        }

        uint256[] memory activeProviderIds = new uint256[](activeCount);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < providerIds.length; i++) {
            if (providers[providerIds[i]].active) {
                activeProviderIds[currentIndex] = providerIds[i];
                currentIndex++;
            }
        }

        return activeProviderIds;
    }

    /**
     * @notice 获取所有提供商
     * @return allProviderIds 所有提供商 ID 数组
     */
    function getAllProviders() external view returns (uint256[] memory) {
        return providerIds;
    }

    /**
     * @notice 获取提供商信息
     * @param providerId 提供商 ID
     * @return provider 提供商信息
     */
    function getProvider(uint256 providerId) external view returns (InsuranceProvider memory) {
        require(providerExists[providerId], "Provider does not exist");
        return providers[providerId];
    }

    /**
     * @notice 检查用户是否有活跃的保险政策
     * @param user 用户地址
     * @return hasActivePolicy 是否有活跃政策
     */
    function hasActivePolicy(address user) external view returns (bool) {
        for (uint256 i = 0; i < userPolicies[user].length; i++) {
            uint256 policyId = userPolicies[user][i];
            if (policies[policyId].active && !policies[policyId].claimed && block.timestamp <= policies[policyId].endTimestamp) {
                return true;
            }
        }
        return false;
    }

    /**
     * @notice 获取用户的总保额
     * @param user 用户地址
     * @return totalCoverage 总保额
     */
    function getUserTotalCoverage(address user) external view returns (uint256) {
        uint256 totalCoverage = 0;
        for (uint256 i = 0; i < userPolicies[user].length; i++) {
            uint256 policyId = userPolicies[user][i];
            if (policies[policyId].active && !policies[policyId].claimed && block.timestamp <= policies[policyId].endTimestamp) {
                totalCoverage += policies[policyId].coverageAmount;
            }
        }
        return totalCoverage;
    }
}
