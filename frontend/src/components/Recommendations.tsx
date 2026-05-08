interface RecommendationsProps {
  recommendations: string[];
}

export default function Recommendations({ recommendations }: RecommendationsProps) {
  const getIcon = (text: string) => {
    if (text.includes("紧急")) return "🚨";
    if (text.includes("建议")) return "⚠️";
    if (text.includes("高波动")) return "📉";
    if (text.includes("集中度")) return "🔄";
    return "📋";
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="text-sm font-medium text-gray-400 mb-4">风控建议</h2>
      <div className="space-y-3">
        {recommendations.map((rec, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50"
          >
            <span className="text-lg mt-0.5">{getIcon(rec)}</span>
            <p className="text-sm text-gray-300">{rec}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
