import type { Metadata } from "next";
import "animal-island-ui/style";
// v1.7.0 打包遗漏：Cursor 组件的光标样式不在 style 主文件里，需单独引入
import "animal-island-ui/es/components/Cursor/cursor.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oak - 我记",
  description: "记录与我有关的一切——孩子、父母、朋友，随时随手记",
  icons: {
    icon: "/icon.svg",
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
