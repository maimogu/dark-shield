"""
DarkShield API 路由
提供风险评估、仓位查询、策略管理等 REST API
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from ..risk_engine.models.risk_models import (
    RiskEngine, Position, RiskReport, RiskLevel
)

router = APIRouter(prefix="/api/v1", tags=["risk"])

# 全局风控引擎实例
engine = RiskEngine()

# ========== 请求/响应模型 ==========

class PositionInput(BaseModel):
    asset: str
    collateral_usd: float
    debt_usd: float
    ltv: float = 0.0

class AnalyzeRequest(BaseModel):
    wallet: str
    positions: List[PositionInput]
    health_factor: float

class StrategyConfig(BaseModel):
    enabled: bool = True
    max_hedge_amount: float = 10000.0
    cooldown_period: int = 3600
    auto_execute: bool = False

# ========== API 端点 ==========

@router.get("/health")
async def health():
    return {"status": "ok", "service": "dark-shield-api"}

@router.post("/risk/analyze", response_model=RiskReport)
async def analyze_risk(req: AnalyzeRequest):
    """
    分析钱包风险

    - wallet: 钱包地址
    - positions: 仓位列表
    - health_factor: Aave 健康因子
    """
    positions = [
        Position(asset=p.asset, collateral_usd=p.collateral_usd, debt_usd=p.debt_usd, ltv=p.ltv)
        for p in req.positions
    ]
    report = engine.analyze(req.wallet, positions, req.health_factor)
    return report

@router.get("/risk/{wallet}")
async def get_risk_report(wallet: str):
    """获取钱包风险报告（使用模拟数据）"""
    # 模拟数据用于演示
    positions = [
        Position(asset="ETH", collateral_usd=50000, debt_usd=30000, ltv=0.75),
        Position(asset="USDC", collateral_usd=10000, debt_usd=0, ltv=0.0)
    ]
    report = engine.analyze(wallet, positions, 1.42)
    return report

@router.post("/strategy/config")
async def set_strategy_config(config: StrategyConfig):
    """设置风控策略配置"""
    return {"status": "ok", "config": config.model_dump()}

@router.get("/info")
async def get_info():
    """获取服务信息"""
    return {
        "name": "DarkShield API",
        "version": "1.0.0",
        "track": "Track 2: Agentic Trading Arena",
        "features": [
            "多因子风险评估",
            "TEE 保护策略执行",
            "自动对冲",
            "0G Compute 集成"
        ]
    }
