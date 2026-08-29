import type { Metadata } from "next";
import "animal-island-ui/style";
// v1.7.0 打包遗漏：Cursor 组件的光标样式不在 style 主文件里，需单独引入
import "animal-island-ui/es/components/Cursor/cursor.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oak - 儿童成长教育记录",
  description: "记录孩子的成长、教育与学习点滴",
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
