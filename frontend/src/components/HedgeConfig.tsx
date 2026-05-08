"use client";

import { useState } from "react";

export default function HedgeConfig() {
  const [enabled, setEnabled] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);
  const [maxAmount, setMaxAmount] = useState("10000");
  const [cooldown, setCooldown] = useState("3600");

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-400">自动风控设置</h2>
        <span className="text-xs text-gray-500">TEE 保护</span>
      </div>

      <div className="space-y-4">
        {/* 启用开关 */}
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
          <div>
            <div className="text-sm text-white">启用风险监控</div>
            <div className="text-xs text-gray-500">开启后将持续监控仓位风险</div>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`w-12 h-6 rounded-full transition-colors ${enabled ? "bg-blue-600" : "bg-gray-700"}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${enabled ? "translate-x-6" : ""}`} />
          </button>
        </div>

        {/* 自动执行开关 */}
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
          <div>
            <div className="text-sm text-white">自动执行对冲</div>
            <div className="text-xs text-gray-500">风险超阈值时自动执行（需 TEE 验证）</div>
          </div>
          <button
            onClick={() => setAutoExecute(!autoExecute)}
            className={`w-12 h-6 rounded-full transition-colors ${autoExecute ? "bg-green-600" : "bg-gray-700"}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${autoExecute ? "translate-x-6" : ""}`} />
          </button>
        </div>

        {/* 参数配置 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">单次最大对冲金额 (USDC)</label>
            <input
              type="number"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">冷却时间 (秒)</label>
            <input
              type="number"
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* 保存按钮 */}
        <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          保存配置
        </button>

        {/* 0G 集成说明 */}
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="text-xs text-blue-400 font-medium mb-1">🔐 TEE 策略保护</div>
          <div className="text-xs text-gray-400">
            您的策略参数将通过 TEE 加密保护，确保交易策略不被泄露。所有执行操作均通过 0G 链上验证。
          </div>
        </div>
      </div>
    </div>
  );
}
