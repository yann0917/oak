"use client";

// 文章随笔编辑器：markdown 源码 + 实时预览（KaTeX 公式）+ AI 流式续写（光标处插入）
import { useEffect, useRef, useState } from "react";
import { Button } from "animal-island-ui";
import { Notification } from "@/lib/toast";
import { MathMd } from "./MathMd";

export function MarkdownEditor({
  value,
  onChange,
  aiTitle,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  aiTitle?: string;
  placeholder?: string;
}) {
  const [completing, setCompleting] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 流式插入时把光标保持在插入点之后
  const cursorRef = useRef<number | null>(null);
  useEffect(() => {
    if (cursorRef.current != null && taRef.current) {
      taRef.current.selectionStart = taRef.current.selectionEnd = cursorRef.current;
      cursorRef.current = null;
    }
  }, [value]);

  const runCompletion = async () => {
    if (completing) {
      abortRef.current?.abort();
      return;
    }
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? start;
    const before = value.slice(0, start);
    const after = value.slice(end);
    if (!before.trim() && !after.trim()) {
      Notification.warning("先写点内容再让 AI 续写");
      return;
    }
    setCompleting(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/ai/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: aiTitle, prefix: before, suffix: after, mode: "markdown" }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "AI 补全失败");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let inserted = "";
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        if (!chunk) continue;
        inserted += decoder.decode(chunk, { stream: true });
        onChange(before + inserted + after);
        cursorRef.current = before.length + inserted.length;
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") Notification.error(e.message || "AI 补全失败");
    } finally {
      setCompleting(false);
      abortRef.current = null;
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Button size="small" type={completing ? "default" : "primary"} onClick={runCompletion}>
          {completing ? "停止生成" : "AI 补全"}
        </Button>
        <Button size="small" type="text" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? "隐藏预览" : "显示预览"}
        </Button>
        <span className="text-[11px]" style={{ color: "var(--animal-text-color-secondary)" }}>
          Markdown 语法 · 公式 $…$ · 图片直接贴 /uploads/ 链接
        </span>
      </div>
      <div className={showPreview ? "grid gap-3 lg:grid-cols-2" : ""}>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={14}
          placeholder={placeholder ?? "用 Markdown 写：## 小标题、**重点**、- 列表、```代码块```、$公式$…"}
          className="w-full rounded-2xl border border-[var(--animal-border-color-light)] bg-white px-3 py-2.5 text-sm font-mono leading-6 outline-none focus:border-[var(--animal-primary-color)]"
        />
        {showPreview && (
          <div
            className="rounded-2xl border border-[var(--animal-border-color-light)] bg-white px-4 py-3 text-sm leading-7 overflow-auto max-h-[480px]"
            style={{ color: "var(--animal-text-color)" }}
          >
            {value.trim() ? (
              <MathMd text={value} className="note-md" />
            ) : (
              <span style={{ color: "var(--animal-text-color-secondary)" }}>预览区</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
