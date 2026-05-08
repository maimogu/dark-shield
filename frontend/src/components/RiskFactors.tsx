interface RiskFactorsProps {
  factors: {
    liquidation_risk: number;
    volatility_risk: number;
    correlation_risk: number;
    liquidity_risk: number;
  };
}

export default function RiskFactors({ factors }: RiskFactorsProps) {
  const factorList = [
    { key: "liquidation_risk", label: "清算风险", weight: "35%", color: "bg-red-500" },
    { key: "volatility_risk", label: "波动率风险", weight: "35%", color: "bg-orange-500" },
    { key: "correlation_risk", label: "集中度风险", weight: "20%", color: "bg-yellow-500" },
    { key: "liquidity_risk", label: "流动性风险", weight: "10%", color: "bg-blue-500" },
  ];

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="text-sm font-medium text-gray-400 mb-4">风险因子分解</h2>
      <div className="space-y-4">
        {factorList.map((factor) => {
          const value = factors[factor.key as keyof typeof factors];
          return (
            <div key={factor.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-300">{factor.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">权重 {factor.weight}</span>
                  <span className="text-sm font-medium text-white">{value.toFixed(0)}%</span>
                </div>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-700 ${factor.color}`}
                  style={{ width: `${Math.min(100, value)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
