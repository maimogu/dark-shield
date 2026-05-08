interface PositionOverviewProps {
  label: string;
  value: number;
  type: "collateral" | "debt" | "available" | "score";
}

export default function PositionOverview({ label, value, type }: PositionOverviewProps) {
  const getStyle = () => {
    switch (type) {
      case "collateral": return { icon: "💰", color: "text-green-400", borderColor: "border-green-500/20" };
      case "debt": return { icon: "📊", color: "text-red-400", borderColor: "border-red-500/20" };
      case "available": return { icon: "✅", color: "text-blue-400", borderColor: "border-blue-500/20" };
      case "score": return { icon: "⚡", color: "text-yellow-400", borderColor: "border-yellow-500/20" };
    }
  };

  const style = getStyle();

  return (
    <div className={`bg-gray-900 rounded-xl border ${style.borderColor} p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <span>{style.icon}</span>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${style.color}`}>
        {type === "score" ? value.toFixed(1) : `$${value.toLocaleString()}`}
      </div>
    </div>
  );
}
