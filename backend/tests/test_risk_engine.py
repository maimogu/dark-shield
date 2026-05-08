"""
风控引擎单元测试
"""
import sys
sys.path.insert(0, ".")
from risk_engine.models.risk_models import RiskEngine, Position, RiskLevel

engine = RiskEngine()

def test_liquidation_risk_safe():
    """测试安全区间的清算风险"""
    score = engine.calculate_liquidation_risk(2.5, 50000)
    assert score < 10, f"安全区间风险应低于10，实际: {score}"
    print("✅ test_liquidation_risk_safe 通过")

def test_liquidation_risk_critical():
    """测试危险区间的清算风险"""
    score = engine.calculate_liquidation_risk(1.05, 50000)
    assert score > 70, f"危险区间风险应高于70，实际: {score}"
    print("✅ test_liquidation_risk_critical 通过")

def test_volatility_risk():
    """测试波动率风险"""
    positions = [
        Position(asset="ETH", collateral_usd=50000, debt_usd=30000),
        Position(asset="USDC", collateral_usd=10000, debt_usd=0)
    ]
    score = engine.calculate_volatility_risk(positions)
    assert 0 <= score <= 100, f"波动率风险应在0-100之间，实际: {score}"
    print(f"✅ test_volatility_risk 通过 (score={score:.1f})")

def test_correlation_risk_diversified():
    """测试分散投资的集中度风险"""
    positions = [
        Position(asset="ETH", collateral_usd=25000, debt_usd=0),
        Position(asset="USDC", collateral_usd=25000, debt_usd=0),
        Position(asset="WBTC", collateral_usd=25000, debt_usd=0),
        Position(asset="DAI", collateral_usd=25000, debt_usd=0)
    ]
    score = engine.calculate_correlation_risk(positions)
    assert score < 50, f"分散投资风险应低于50，实际: {score}"
    print(f"✅ test_correlation_risk_diversified 通过 (score={score:.1f})")

def test_correlation_risk_concentrated():
    """测试集中投资的集中度风险"""
    positions = [
        Position(asset="ETH", collateral_usd=99000, debt_usd=0),
        Position(asset="USDC", collateral_usd=1000, debt_usd=0)
    ]
    score = engine.calculate_correlation_risk(positions)
    assert score > 50, f"集中投资风险应高于50，实际: {score}"
    print(f"✅ test_correlation_risk_concentrated 通过 (score={score:.1f})")

def test_full_analysis():
    """测试完整风险分析"""
    positions = [
        Position(asset="ETH", collateral_usd=50000, debt_usd=30000, ltv=0.75),
        Position(asset="USDC", collateral_usd=10000, debt_usd=0, ltv=0.0)
    ]
    report = engine.analyze("0x1234567890abcdef", positions, 1.42)
    assert report.composite_score > 0
    assert report.risk_level in [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL]
    assert len(report.recommendations) > 0
    assert report.input_hash != ""
    print(f"✅ test_full_analysis 通过 (score={report.composite_score}, level={report.risk_level.value})")
    print(f"   建议: {report.recommendations}")
    print(f"   行动: {report.action_type}, 金额: {report.action_amount}")

def test_determine_action_hold():
    """测试低风险时保持"""
    action = engine.determine_action(20, 2.0, 30000)
    assert action["type"] == "HOLD"
    print("✅ test_determine_action_hold 通过")

def test_determine_action_hedge():
    """测试高风险时对冲"""
    action = engine.determine_action(80, 1.1, 30000)
    assert action["type"] == "ADD_COLLATERAL"
    assert action["amount"] > 0
    print(f"✅ test_determine_action_hedge 通过 (amount={action['amount']})")

if __name__ == "__main__":
    print("=" * 50)
    print("DarkShield 风控引擎测试")
    print("=" * 50)
    test_liquidation_risk_safe()
    test_liquidation_risk_critical()
    test_volatility_risk()
    test_correlation_risk_diversified()
    test_correlation_risk_concentrated()
    test_full_analysis()
    test_determine_action_hold()
    test_determine_action_hedge()
    print("=" * 50)
    print("所有测试通过! ✅")
