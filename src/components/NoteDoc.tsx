"use client";

// novel(TipTap) JSON 文档的静态渲染器：详情页阅读态用，不依赖编辑器实例。
// 覆盖常见节点；公式节点（math）与文本内 $..$ 用 KaTeX 输出；未知节点退化为文本拼接。
/* eslint-disable @next/next/no-img-element -- 正文图片是用户内容，尺寸未知，用原生 img 不经 Next 优化 */
import katex from "katex";
import "katex/dist/katex.min.css";
import type { ReactNode } from "react";
import type { JSONContent } from "novel";

// 把文本节点拆成 纯文本 + 内联/块级公式（$..$ / $$..$$ 用 KaTeX 渲染）
const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

function splitMath(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  MATH_RE.lastIndex = 0;
  while ((m = MATH_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const latex = (m[1] ?? m[2] ?? "").trim();
    const block = m[1] !== undefined;
    try {
      const html = katex.renderToString(latex, { throwOnError: false, displayMode: block });
      parts.push(
        block ? (
          <div key={`m${i++}`} className="my-2 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span key={`m${i++}`} className="mx-0.5" dangerouslySetInnerHTML={{ __html: html }} />
        )
      );
    } catch {
      // KaTeX 出错时保留原文，避免丢内容
      parts.push(text.slice(m.index, m.index + m[0].length));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderText(node: JSONContent, key: number): ReactNode {
  let text: ReactNode = splitMath(node.text ?? "").map((p, i) => <span key={i}>{p}</span>);
  const marks = node.marks ?? [];
  for (const mark of marks) {
    if (mark.type === "bold") text = <strong key={key}>{text}</strong>;
    else if (mark.type === "italic") text = <em key={key}>{text}</em>;
    else if (mark.type === "underline") text = <u key={key}>{text}</u>;
    else if (mark.type === "strike") text = <s key={key}>{text}</s>;
    else if (mark.type === "code") text = <code key={key}>{text}</code>;
    else if (mark.type === "link") text = <a key={key} href={mark.attrs?.href} target="_blank" rel="noreferrer">{text}</a>;
    else if (mark.type === "highlight") text = <mark key={key}>{text}</mark>;
  }
  return text;
}

function renderLatex(node: JSONContent, key: number, display: boolean) {
  const latex = String(node.attrs?.latex ?? "");
  const html = katex.renderToString(latex, { throwOnError: false, displayMode: display });
  return display ? (
    <div key={key} className="my-2 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span key={key} className="mx-0.5" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export function NoteDoc({ content }: { content: JSONContent | string }) {
  const doc = typeof content === "string" ? safeParse(content) : content;
  return <div className="note-prose max-w-none">{renderNode(doc, 0)}</div>;
}

function safeParse(s: string): JSONContent {
  try {
    return JSON.parse(s) as JSONContent;
  } catch {
    return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: s }] }] };
  }
}

function renderNode(node: JSONContent | undefined, key: number): ReactNode {
  if (!node) return null;
  switch (node.type) {
    case "doc":
      return (node.content ?? []).map((c, i) => renderNode(c, i));
    case "paragraph":
      return <p key={key}>{(node.content ?? []).map((c, i) => renderNode(c, i))}</p>;
    case "heading": {
      const level = Math.min(4, Math.max(1, Number(node.attrs?.level ?? 2)));
      const Tag = (`h${level}` as "h1" | "h2" | "h3" | "h4");
      return <Tag key={key}>{(node.content ?? []).map((c, i) => renderNode(c, i))}</Tag>;
    }
    case "text":
      return <span key={key}>{renderText(node, key)}</span>;
    case "bulletList":
      return <ul key={key}>{(node.content ?? []).map((c, i) => renderNode(c, i))}</ul>;
    case "orderedList":
      return <ol key={key}>{(node.content ?? []).map((c, i) => renderNode(c, i))}</ol>;
    case "listItem":
      return <li key={key}>{(node.content ?? []).map((c, i) => renderNode(c, i))}</li>;
    case "taskList":
      return (
        <ul key={key} className="list-none pl-0">
          {(node.content ?? []).map((c, i) => renderNode(c, i))}
        </ul>
      );
    case "taskItem": {
      const checked = !!node.attrs?.checked;
      return (
        <li key={key} className="flex gap-2 items-start">
          <span className="mt-0.5 inline-flex w-4 h-4 shrink-0 items-center justify-center rounded-full border text-[10px] bg-[var(--animal-bg-color-secondary)] border-[var(--animal-border-color-light)]">
            {checked ? "✓" : ""}
          </span>
          <span>{(node.content ?? []).map((c, i) => renderNode(c, i))}</span>
        </li>
      );
    }
    case "blockquote":
      return (
        <blockquote key={key} className="border-l-4 pl-3 opacity-90">
          {(node.content ?? []).map((c, i) => renderNode(c, i))}
        </blockquote>
      );
    case "codeBlock":
      return <pre key={key} className="border-none bg-[var(--animal-bg-color-secondary)] p-3 rounded-xl overflow-x-auto">{(node.content ?? []).map((c, i) => renderNode(c, i))}</pre>;
    case "math":
      return renderLatex(node, key, false);
    case "image":
      return (
        <img key={key} src={node.attrs?.src} alt={node.attrs?.alt ?? ""} className="max-w-full rounded-xl my-2" />
      );
    case "horizontalRule":
      return <hr key={key} />;
    default:
      // 未知节点：仍把文本内容渲出来，避免漏内容
      return <span key={key}>{(node.content ?? []).map((c, i) => renderNode(c, i))}</span>;
  }
}
