import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "知阅 · 文献阅读与笔记管理",
  description: "管理文献、标签、阅读状态与研究笔记的个人工作台",
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
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
