import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DarkShield - DeFi Risk Shield",
  description: "AI 驱动的 DeFi 风险管理面板 | 0G APAC Hackathon",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="bg-gray-950 text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
