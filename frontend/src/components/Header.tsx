"use client";

interface HeaderProps {
  onRefresh: () => void;
  loading: boolean;
}

export default function Header({ onRefresh, loading }: HeaderProps) {
  return (
    <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-lg">
            🛡️
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">DarkShield</h1>
            <p className="text-xs text-gray-400">DeFi Risk Shield</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg text-sm">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-gray-300">0G Testnet</span>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? "⏳ 分析中..." : "🔍 风险检查"}
          </button>
        </div>
      </div>
    </header>
  );
}
