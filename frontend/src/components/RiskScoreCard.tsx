interface RiskScoreCardProps {
  score: number;
  level: string;
}

export default function RiskScoreCard({ score, level }: RiskScoreCardProps) {
  const getLevelStyle = (level: string) => {
    switch (level) {
      case "LOW": return { color: "text-green-400", ring: "ring-green-500/30", bg: "bg-green-500/10", label: "低风险" };
      case "MEDIUM": return { color: "text-yellow-400", ring: "ring-yellow-500/30", bg: "bg-yellow-500/10", label: "中风险" };
      case "HIGH": return { color: "text-orange-400", ring: "ring-orange-500/30", bg: "bg-orange-500/10", label: "高风险" };
      case "CRITICAL": return { color: "text-red-400", ring: "ring-red-500/30", bg: "bg-red-500/10", label: "极高风险" };
      default: return { color: "text-gray-400", ring: "ring-gray-500/30", bg: "bg-gray-500/10", label: "未知" };
    }
  };

  const style = getLevelStyle(level);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-400">综合风险评分</h2>
        <span className={`text-xs px-2 py-1 rounded-full ${style.color} ${style.bg}`}>
          {style.label}
        </span>
      </div>

      <div className="flex items-center justify-center py-4">
        <div className={`w-32 h-32 rounded-full border-4 ${style.ring} ring-8 flex items-center justify-center`}>
          <div className="text-center">
            <div className={`text-4xl font-bold ${style.color}`}>{score.toFixed(0)}</div>
            <div className="text-xs text-gray-500">/ 100</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
        <div className="bg-gray-800 rounded-lg p-2 text-center">
          <div className="text-gray-400">清算风险</div>
          <div className="text-white font-medium">40%</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-2 text-center">
          <div className="text-gray-400">波动风险</div>
          <div className="text-white font-medium">65%</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-2 text-center">
          <div className="text-gray-400">集中风险</div>
          <div className="text-white font-medium">55%</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-2 text-center">
          <div className="text-gray-400">流动性风险</div>
          <div className="text-white font-medium">30%</div>
        </div>
      </div>
    </div>
  );
}
