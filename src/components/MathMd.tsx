"use client";

// Markdown + KaTeX 轻渲染：复习卡片/笔记详情读侧用，不挂编辑器
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export function MathMd({ text, className }: { text: string; className?: string }) {
  if (!text.trim()) return null;
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
