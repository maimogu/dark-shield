"""
DarkShield 风险评估模型
多因子风险评估引擎，用于 DeFi 仓位风险分析
"""
from dataclasses import dataclass, field
from typing import List, Dict, Optional
from enum import Enum
import numpy as np
import time
import json
import hashlib

class RiskLevel(Enum):
    """风险等级枚举"""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

@dataclass
class RiskFactors:
    """风险因子"""
    liquidation_risk: float = 0.0      # 清算风险 (0-100)
    volatility_risk: float = 0.0        # 波动率风险 (0-100)
    correlation_risk: float = 0.0       # 集中度风险 (0-100)
    liquidity_risk: float = 0.0         # 流动性风险 (0-100)

@dataclass
class Position:
    """仓位数据"""
    asset: str = ""               # 资产符号
    collateral_usd: float = 0.0   # 抵押品价值 (USD)
    debt_usd: float = 0.0         # 债务价值 (USD)
    ltv: float = 0.0              # 贷款价值比

@dataclass
class RiskReport:
    """风险报告"""
    timestamp: int = 0
    wallet_address: str = ""
    health_factor: float = 0.0
    total_collateral_usd: float = 0.0
    total_debt_usd: float = 0.0
    factors: RiskFactors = field(default_factory=RiskFactors)
    composite_score: float = 0.0
    risk_level: RiskLevel = RiskLevel.LOW
    recommendations: List[str] = field(default_factory=list)
    action_required: bool = False
    action_type: str = "HOLD"
    action_amount: float = 0.0
    input_hash: str = ""


class RiskEngine:
    """
    DarkShield 核心风险评估引擎

    评估维度：
    - 清算风险 (35%): 基于健康因子距离清算线的安全边际
    - 波动率风险 (35%): 基于持仓资产的波动率和仓位占比
    - 集中度风险 (20%): 基于资产多样性和相关性
    - 流动性风险 (10%): 基于资产变现能力
    """

    # 风险权重配置
    WEIGHTS = {
        "liquidation": 0.35,
        "volatility": 0.35,
        "correlation": 0.20,
        "liquidity": 0.10
    }

    # 健康因子阈值
    HF_SAFE = 2.0
    HF_WARNING = 1.5
    HF_DANGER = 1.2
    HF_CRITICAL = 1.0

    # 资产默认波动率 (年化)
    DEFAULT_VOLATILITY = {
        "ETH": 0.80, "WETH": 0.80, "WBTC": 0.60,
        "USDC": 0.02, "USDT": 0.02, "DAI": 0.02,
        "LINK": 0.90, "UNI": 1.00, "AAVE": 0.85
    }

    def calculate_liquidation_risk(self, health_factor: float, debt_usd: float) -> float:
        """计算清算风险评分 (0-100)"""
        if health_factor >= self.HF_SAFE:
            return 5.0
        elif health_factor >= self.HF_WARNING:
            margin = (health_factor - self.HF_WARNING) / (self.HF_SAFE - self.HF_WARNING)
            return 20.0 * (1 - margin)
        elif health_factor >= self.HF_DANGER:
            margin = (health_factor - self.HF_DANGER) / (self.HF_WARNING - self.HF_DANGER)
            return 20.0 + 30.0 * (1 - margin)
        elif health_factor >= self.HF_CRITICAL:
            margin = (health_factor - self.HF_CRITICAL) / (self.HF_DANGER - self.HF_CRITICAL)
            return 50.0 + 30.0 * (1 - margin)
        else:
            return 80.0 + min(20.0, (1.0 - health_factor) * 100)

    def calculate_volatility_risk(self, positions: List[Position]) -> float:
        """计算波动率风险评分 (0-100)"""
        if not positions:
            return 0.0
        total_value = sum(p.collateral_usd + p.debt_usd for p in positions)
        if total_value == 0:
            return 0.0
        weighted_vol = 0.0
        for p in positions:
            weight = (p.collateral_usd + p.debt_usd) / total_value
            vol = self.DEFAULT_VOLATILITY.get(p.asset, 0.50)
            weighted_vol += weight * vol
        return min(100.0, weighted_vol * 100)

    def calculate_correlation_risk(self, positions: List[Position]) -> float:
        """计算集中度风险 (0-100)"""
        if not positions:
            return 0.0
        n = len(positions)
        total_value = sum(p.collateral_usd + p.debt_usd for p in positions)
        if total_value == 0:
            return 0.0
        weights = [(p.collateral_usd + p.debt_usd) / total_value for p in positions]
        hhi = sum(w ** 2 for w in weights)
        normalized = (hhi - 1/n) / (1 - 1/n) if n > 1 else 1.0
        return normalized * 80.0

    def calculate_liquidity_risk(self, positions: List[Position]) -> float:
        """计算流动性风险 (0-100)"""
        stablecoins = {"USDC", "USDT", "DAI"}
        stable_ratio = sum(
            (p.collateral_usd + p.debt_usd)
            for p in positions if p.asset in stablecoins
        )
        total = sum(p.collateral_usd + p.debt_usd for p in positions)
        if total == 0:
            return 0.0
        return (1 - stable_ratio / total) * 60.0

    def get_composite_score(self, factors: RiskFactors) -> float:
        """计算综合风险评分"""
        return (
            factors.liquidation_risk * self.WEIGHTS["liquidation"]
            + factors.volatility_risk * self.WEIGHTS["volatility"]
            + factors.correlation_risk * self.WEIGHTS["correlation"]
            + factors.liquidity_risk * self.WEIGHTS["liquidity"]
        )

    def get_risk_level(self, score: float) -> RiskLevel:
        """根据评分确定风险等级"""
        if score < 25: return RiskLevel.LOW
        elif score < 50: return RiskLevel.MEDIUM
        elif score < 75: return RiskLevel.HIGH
        else: return RiskLevel.CRITICAL

    def generate_recommendations(self, factors: RiskFactors, health_factor: float) -> List[str]:
        """生成风控建议"""
        recs = []
        if health_factor < 1.2:
            recs.append("紧急：增加抵押品或减少借款以提升健康因子")
        elif health_factor < 1.5:
            recs.append("建议增加抵押品缓冲至健康因子 1.5 以上")
        if factors.volatility_risk > 60:
            recs.append("高波动风险：考虑将部分高波动资产替换为稳定币")
        if factors.correlation_risk > 50:
            recs.append("集中度风险：建议分散资产类别")
        if not recs:
            recs.append("当前风险水平可控，持续监控中")
        return recs

    def determine_action(self, score: float, health_factor: float, total_debt: float) -> Dict:
        """决定行动方案"""
        if score < 50:
            return {"type": "HOLD", "amount": 0.0}
        if health_factor < 1.2:
            # 需要增加抵押品使健康因子达到 1.5
            # 公式：新抵押品 = 债务 * (1/目标HF - 1/当前HF) * 当前总抵押品/债务
            # 简化为：需要额外抵押品 = 债务 * (1/目标HF - 1/当前HF) 的绝对值
            target_hf = 1.5
            if health_factor > 0:
                # 当 HF < target 时，1/target > 1/HF，所以差值为正
                needed = total_debt * abs(1/target_hf - 1/health_factor)
            else:
                needed = total_debt * 0.5
            return {"type": "ADD_COLLATERAL", "amount": round(max(0, needed), 2)}
        elif score > 70:
            ratio = (score - 50) / 50
            return {"type": "REDUCE_POSITION", "amount": round(total_debt * ratio, 2)}
        else:
            return {"type": "ADD_COLLATERAL", "amount": 5000.0}

    def analyze(self, wallet: str, positions: List[Position], health_factor: float) -> RiskReport:
        """执行完整风险分析"""
        total_collateral = sum(p.collateral_usd for p in positions)
        total_debt = sum(p.debt_usd for p in positions)

        factors = RiskFactors(
            liquidation_risk=self.calculate_liquidation_risk(health_factor, total_debt),
            volatility_risk=self.calculate_volatility_risk(positions),
            correlation_risk=self.calculate_correlation_risk(positions),
            liquidity_risk=self.calculate_liquidity_risk(positions)
        )

        composite = self.get_composite_score(factors)
        level = self.get_risk_level(composite)
        recs = self.generate_recommendations(factors, health_factor)
        action = self.determine_action(composite, health_factor, total_debt)

        # 生成输入哈希（用于 TEE 验证）
        input_data = json.dumps({
            "wallet": wallet, "positions": [
                {"asset": p.asset, "collateral": p.collateral_usd, "debt": p.debt_usd}
                for p in positions
            ], "health_factor": health_factor
        }, sort_keys=True)
        input_hash = hashlib.sha256(input_data.encode()).hexdigest()[:16]

        return RiskReport(
            timestamp=int(time.time()),
            wallet_address=wallet,
            health_factor=health_factor,
            total_collateral_usd=total_collateral,
            total_debt_usd=total_debt,
            factors=factors,
            composite_score=round(composite, 2),
            risk_level=level,
            recommendations=recs,
            action_required=composite > 50,
            action_type=action["type"],
            action_amount=action["amount"],
            input_hash=input_hash
        )
