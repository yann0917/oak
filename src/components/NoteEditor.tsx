"use client";

// novel(TipTap) 富文本编辑器封装：数学公式用 novel 内置 Mathematics（KaTeX），
// 编辑器里输入 Latex: 后跟公式（如 Latex:\frac{1}{2}）即插入数学节点
import { useRef, useState } from "react";
import { EditorContent, EditorRoot, Mathematics, Placeholder, StarterKit, useEditor, type JSONContent } from "novel";
import "katex/dist/katex.min.css";
import { Notification } from "@/lib/toast";

interface NoteEditorProps {
  initialContent?: JSONContent;
  onChange: (json: JSONContent) => void;
  placeholder?: string;
  /** 点击后把编辑器当前选中文字提取出来（用于填卡片正反面） */
  onExtract?: (text: string) => void;
  /** AI 续写用的笔记标题（NoteForm 传入实时标题） */
  aiTitle?: string;
}

function ToolbarButton({ label, onClick, hint }: { label: string; onClick: () => void; hint?: string }) {
  return (
    <button
      type="button"
      title={hint}
      className="text-xs px-2.5 h-7 rounded-full bg-warm border border-[var(--animal-border-color-light)] font-semibold cursor-pointer hover:bg-warm-soft"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function EditorTools({
  onExtract,
  placeholder,
  aiTitle,
}: {
  onExtract?: (text: string) => void;
  placeholder?: string;
  aiTitle?: string;
}) {
  // useEditor 取 EditorRoot 上下文里的当前编辑器
  const { editor } = useEditor();
  const [completing, setCompleting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  if (!editor) return null;

  /** AI 续写：取光标前后文请求流式补全，逐块插入光标处（再点一次 = 停止） */
  const runCompletion = async () => {
    if (completing) {
      abortRef.current?.abort();
      return;
    }
    const { selection } = editor.state;
    const before = editor.state.doc.textBetween(0, selection.from, "\n");
    const after = editor.state.doc.textBetween(selection.to, editor.state.doc.content.size, "\n");
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
        body: JSON.stringify({ title: aiTitle, prefix: before, suffix: after }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "AI 补全失败");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pos = selection.to;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        // \n 转 hardBreak 节点，文本逐块插到光标处，插入点随选区前移
        const parts = chunk.split("\n");
        const content: any[] = [];
        parts.forEach((p, idx) => {
          if (idx > 0) content.push({ type: "hardBreak" });
          if (p) content.push({ type: "text", text: p });
        });
        editor.chain().insertContentAt(pos, content, { updateSelection: true }).run();
        pos = editor.state.selection.to;
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") Notification.error(e.message || "AI 补全失败");
    } finally {
      setCompleting(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex gap-2 relative z-10">
      <ToolbarButton
        label={completing ? "停止生成" : "AI 补全"}
        hint={completing ? "停止生成" : "在光标处让 AI 续写（结合标题与上下文）"}
        onClick={runCompletion}
      />
      <ToolbarButton
        label="插入公式"
        hint="在光标处插入 $...$，支持 LaTeX，如 $x^2$"
        onClick={() => {
          const { selection } = editor.state;
          const selText = editor.state.doc.textBetween(selection.from, selection.to, " ", "").trim();
          if (selText) {
            editor.chain().insertContentAt(selection, `$${selText}$`).run();
          } else {
            editor.chain().insertContent("$$").setTextSelection(editor.state.selection.from + 1).run();
          }
        }}
      />
      {onExtract && (
        <ToolbarButton
          label="选中文字 → 卡片"
          hint="把正文选中的文字填入卡片正面"
          onClick={() => {
            const { selection } = editor.state;
            const text = editor.state.doc.textBetween(selection.from, selection.to, " ", "");
            if (text.trim()) onExtract(text.trim());
          }}
        />
      )}
      <span className="text-[11px] self-center text-secondary">{placeholder}</span>
    </div>
  );
}

export function NoteEditor({ initialContent, onChange, placeholder, onExtract, aiTitle }: NoteEditorProps) {
  return (
    <EditorRoot>
      {/* 工具栏必须作为 EditorContent 的子节点：novel 的 useEditor（实为 useCurrentEditor）
          从 EditorProvider 上下文取实例，放外面拿到的永远是 null（此前工具栏一直未渲染） */}
      <EditorContent
        immediatelyRender={false}
        initialContent={initialContent}
        extensions={[StarterKit, Mathematics, Placeholder]}
        onUpdate={({ editor }) => onChange(editor.getJSON())}
        editorProps={{
          attributes: {
            class: "note-prose outline-none min-h-48 max-w-none px-4 py-3 bg-white rounded-2xl border border-[var(--animal-border-color-light)]",
            "data-placeholder": placeholder ?? "这里写题目解析、推导过程…",
          },
        }}
      >
        <div className="flex items-center gap-1 flex-wrap mt-2">
          <EditorTools onExtract={onExtract} placeholder="公式用 $...$ 书写，如 $x^2$、$\frac{1}{2}$" aiTitle={aiTitle} />
        </div>
      </EditorContent>
    </EditorRoot>
  );
}
