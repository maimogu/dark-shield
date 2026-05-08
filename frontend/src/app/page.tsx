"use client";

import { useState } from "react";
import Header from "@/components/Header";
import HealthFactorCard from "@/components/HealthFactorCard";
import RiskScoreCard from "@/components/RiskScoreCard";
import PositionOverview from "@/components/PositionOverview";
import RiskFactors from "@/components/RiskFactors";
import Recommendations from "@/components/Recommendations";
import HedgeConfig from "@/components/HedgeConfig";

// 模拟数据
const MOCK_DATA = {
  wallet: "0x1234...5678",
  healthFactor: 1.42,
  totalCollateral: 60000,
  totalDebt: 30000,
  riskScore: 58.5,
  riskLevel: "HIGH",
  factors: {
    liquidation_risk: 40.0,
    volatility_risk: 65.0,
    correlation_risk: 55.0,
    liquidity_risk: 30.0,
  },
  recommendations: [
    "建议增加抵押品缓冲至健康因子 1.5 以上",
    "高波动风险：考虑将部分高波动资产替换为稳定币",
    "集中度风险：建议分散资产类别",
  ],
  positions: [
    { asset: "ETH", collateral: 50000, debt: 30000, ltv: 0.75 },
    { asset: "USDC", collateral: 10000, debt: 0, ltv: 0.0 },
  ],
};

export default function Home() {
  const [riskData, setRiskData] = useState(MOCK_DATA);
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    // 模拟 API 调用
    setTimeout(() => {
      setRiskData({
        ...MOCK_DATA,
        healthFactor: +(MOCK_DATA.healthFactor * (0.95 + Math.random() * 0.1)).toFixed(4),
        riskScore: +(MOCK_DATA.riskScore * (0.9 + Math.random() * 0.2)).toFixed(1),
      });
      setLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <Header onRefresh={handleRefresh} loading={loading} />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* 顶部概览卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <PositionOverview
            label="抵押品总额"
            value={riskData.totalCollateral}
            type="collateral"
          />
          <PositionOverview
            label="借款总额"
            value={riskData.totalDebt}
            type="debt"
          />
          <PositionOverview
            label="可用借款"
            value={Math.max(0, riskData.totalCollateral * 0.8 - riskData.totalDebt)}
            type="available"
          />
          <PositionOverview
            label="风险评分"
            value={riskData.riskScore}
            type="score"
          />
        </div>

        {/* 健康因子 + 风险评分 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <HealthFactorCard healthFactor={riskData.healthFactor} />
          <RiskScoreCard score={riskData.riskScore} level={riskData.riskLevel} />
        </div>

        {/* 风险因子分解 */}
        <RiskFactors factors={riskData.factors} />

        {/* 风控建议 */}
        <Recommendations recommendations={riskData.recommendations} />

        {/* 自动风控配置 */}
        <HedgeConfig />
      </main>

      {/* 页脚 */}
      <footer className="border-t border-gray-800 mt-12 py-6 text-center text-gray-500 text-sm">
        <p>DarkShield - DeFi Risk Shield | 0G APAC Hackathon Track 2</p>
        <p className="mt-1">Built with 0G Compute + TEE + Storage</p>
      </footer>
    </div>
  );
}
