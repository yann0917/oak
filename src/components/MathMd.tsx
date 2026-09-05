"use client";

// Markdown + KaTeX + 代码高亮轻渲染：复习卡片/文章详情/预览共用，不挂编辑器
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
// PrismLight + 按需注册语言（全量构建体积过大），覆盖博客/错题常见的十几种
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import "katex/dist/katex.min.css";

const LANGS: Record<string, any> = {
  javascript,
  typescript,
  jsx,
  python,
  java,
  c,
  cpp,
  csharp,
  go,
  rust,
  php,
  sql,
  bash,
  json,
  yaml,
  css,
  markup,
};
// 常见别名归一到 refractor 语言 id
const ALIAS: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  html: "markup",
  xml: "markup",
  golang: "go",
  "c++": "cpp",
};
for (const [id, def] of Object.entries(LANGS)) SyntaxHighlighter.registerLanguage(id, def);

/** 表格/标题等基础排版（react-markdown 输出为裸标签；代码块样式由高亮组件自带） */
const MD_STYLES =
  "[&_h1]:text-xl [&_h1]:font-black [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-black [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:opacity-80 [&_blockquote]:my-2 [&_table]:w-full [&_table]:text-xs [&_table]:my-2 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:font-bold [&_th]:bg-warm [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border-[var(--animal-border-color-light)] [&_td]:border-[var(--animal-border-color-light)] [&_a]:underline [&_img]:max-w-full [&_hr]:my-3";

export function MathMd({ text, className }: { text: string; className?: string }) {
  if (!text.trim()) return null;
  return (
    <div className={`${MD_STYLES} ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // 代码块由 SyntaxHighlighter 自带 pre，去掉外层重复 pre
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...rest }: any) => {
            const match = /language-(\w+)/.exec(className || "");
            if (!match) {
              // 行内代码
              return (
                <code className="rounded bg-warm-soft px-1 py-0.5 text-[13px]" {...rest}>
                  {children}
                </code>
              );
            }
            const lang = ALIAS[match[1]] ?? match[1];
            const known = lang in LANGS;
            return (
              <div className="my-2 overflow-auto rounded-xl">
                <SyntaxHighlighter
                  language={known ? lang : "markup"}
                  style={oneDark}
                  customStyle={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}
                  codeTagProps={{ style: { fontFamily: "var(--font-mono, ui-monospace, monospace)" } }}
                >
                  {String(children).replace(/\n$/, "")}
                </SyntaxHighlighter>
              </div>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
