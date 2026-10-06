import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "短线决策台",
  description: "A股市场观察、交易日志与每日复盘。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
