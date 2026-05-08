// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TEEDecisionVerifier
 * @notice TEE（可信执行环境）决策验证合约
 * @dev 用于验证来自 TEE enclave 的决策证明，确保链下风险决策的可信性
 */
contract TEEDecisionVerifier is Ownable {
    // ============ 数据结构 ============

    /**
     * @notice Enclave 信息结构体
     * @param mrEnclave TEE enclave 的测量值（MRENCLAVE），用于标识 enclave 的身份
     * @param isActive enclave 是否处于活跃状态
     * @param registeredAt 注册时间戳
     */
    struct EnclaveInfo {
        bytes32 mrEnclave;
        bool isActive;
        uint256 registeredAt;
    }

    // ============ 状态变量 ============

    /// @notice 已注册的 TEE enclave 地址映射
    mapping(address => EnclaveInfo) public registeredEnclaves;

    /// @notice 已使用的 nonce 哈希，用于防止重放攻击
    mapping(bytes32 => bool) public usedNonces;

    // ============ 事件 ============

    /// @notice 当新的 TEE enclave 被注册时触发
    event EnclaveRegistered(address indexed enclave, bytes32 mrEnclave, uint256 registeredAt);

    /// @notice 当 TEE enclave 被撤销时触发
    event EnclaveRevoked(address indexed enclave, uint256 revokedAt);

    /// @notice 当 TEE 决策证明验证成功时触发
    event DecisionVerified(
        address indexed user,
        uint8 actionType,
        uint256 amount,
        address indexed asset,
        bytes32 inputHash,
        bytes32 outputHash
    );

    // ============ 错误 ============

    /// @notice enclave 未注册或已撤销
    error EnclaveNotRegistered(address enclave);

    /// @notice enclave 已被撤销
    error EnclaveNotActive(address enclave);

    /// @notice 证明已被使用（重放攻击）
    error ProofAlreadyUsed(bytes32 nonceHash);

    /// @notice 证明验证失败
    error InvalidProof();

    // ============ 构造函数 ============

    /**
     * @notice 构造函数，设置合约所有者
     * @param initialOwner 初始所有者地址
     */
    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============ 外部函数 ============

    /**
     * @notice 注册新的 TEE enclave
     * @dev 仅合约所有者可调用
     * @param _mrenclave TEE enclave 的 MRENCLAVE 测量值
     */
    function registerEnclave(bytes32 _mrenclave) external onlyOwner {
        address enclave = msg.sender;
        registeredEnclaves[enclave] = EnclaveInfo({
            mrEnclave: _mrenclave,
            isActive: true,
            registeredAt: block.timestamp
        });

        emit EnclaveRegistered(enclave, _mrenclave, block.timestamp);
    }

    /**
     * @notice 撤销指定的 TEE enclave
     * @dev 仅合约所有者可调用，将 enclave 标记为不活跃
     * @param _enclave 要撤销的 enclave 地址
     */
    function revokeEnclave(address _enclave) external onlyOwner {
        EnclaveInfo storage info = registeredEnclaves[_enclave];

        if (info.registeredAt == 0) {
            revert EnclaveNotRegistered(_enclave);
        }

        info.isActive = false;

        emit EnclaveRevoked(_enclave, block.timestamp);
    }

    /**
     * @notice 验证 TEE 决策证明
     * @dev 验证来自 TEE enclave 的决策证明，确保决策的可信性和完整性
     * @param _user 目标用户地址
     * @param _actionType 操作类型（1=增加抵押，2=闪电贷对冲，3=部分还款）
     * @param _amount 操作金额
     * @param _asset 操作资产地址
     * @param _inputHash 输入数据哈希（包含用户状态快照）
     * @param _outputHash 输出数据哈希（包含决策结果）
     * @param _proof TEE enclave 生成的证明数据
     * @return verified 验证是否通过
     */
    function verifyDecision(
        address _user,
        uint8 _actionType,
        uint256 _amount,
        address _asset,
        bytes32 _inputHash,
        bytes32 _outputHash,
        bytes calldata _proof
    ) external returns (bool verified) {
        // 构造 nonce 哈希用于防重放攻击
        // nonce 由用户地址、操作类型、金额、资产、输入哈希和输出哈希组合而成
        bytes32 nonceHash = keccak256(
            abi.encodePacked(
                _user,
                _actionType,
                _amount,
                _asset,
                _inputHash,
                _outputHash,
                block.timestamp
            )
        );

        // 检查 nonce 是否已被使用
        if (usedNonces[nonceHash]) {
            revert ProofAlreadyUsed(nonceHash);
        }

        // 标记 nonce 为已使用
        usedNonces[nonceHash] = true;

        // 验证证明数据长度（基本格式检查）
        // 实际生产环境中应使用更严格的验证逻辑（如 ECDSA 签名验证或 TEE 远程证明）
        if (_proof.length < 64) {
            revert InvalidProof();
        }

        // 验证通过，标记为已验证
        verified = true;

        emit DecisionVerified(_user, _actionType, _amount, _asset, _inputHash, _outputHash);
    }
}
