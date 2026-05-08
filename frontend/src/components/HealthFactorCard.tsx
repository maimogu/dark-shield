interface HealthFactorCardProps {
  healthFactor: number;
}

export default function HealthFactorCard({ healthFactor }: HealthFactorCardProps) {
  const getStatus = (hf: number) => {
    if (hf >= 2.0) return { label: "安全", color: "text-green-400", bg: "bg-green-500", percent: 100 };
    if (hf >= 1.5) return { label: "良好", color: "text-yellow-400", bg: "bg-yellow-500", percent: 75 };
    if (hf >= 1.2) return { label: "警告", color: "text-orange-400", bg: "bg-orange-500", percent: 50 };
    if (hf >= 1.0) return { label: "危险", color: "text-red-400", bg: "bg-red-500", percent: 25 };
    return { label: "清算中", color: "text-red-500", bg: "bg-red-600", percent: 10 };
  };

  const status = getStatus(healthFactor);
  const barWidth = Math.min(100, (healthFactor / 3.0) * 100);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-400">健康因子 (Health Factor)</h2>
        <span className={`text-xs px-2 py-1 rounded-full ${status.color} bg-gray-800`}>
          {status.label}
        </span>
      </div>

      <div className="text-4xl font-bold mb-4">
        <span className={status.color}>{healthFactor.toFixed(4)}</span>
      </div>

      {/* 进度条 */}
      <div className="w-full bg-gray-800 rounded-full h-3 mb-2">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${status.bg}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {/* 参考线 */}
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        <span>0 (清算)</span>
        <span className="text-red-400">1.0</span>
        <span className="text-yellow-400">1.5</span>
        <span className="text-green-400">2.0+</span>
      </div>
    </div>
  );
}
