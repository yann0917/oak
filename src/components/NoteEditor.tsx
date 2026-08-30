"use client";

// novel(TipTap) 富文本编辑器封装：数学公式用 novel 内置 Mathematics（KaTeX），
// 编辑器里输入 Latex: 后跟公式（如 Latex:\frac{1}{2}）即插入数学节点
import { EditorContent, EditorRoot, Mathematics, Placeholder, StarterKit, useEditor, type JSONContent } from "novel";
import "katex/dist/katex.min.css";

interface NoteEditorProps {
  initialContent?: JSONContent;
  onChange: (json: JSONContent) => void;
  placeholder?: string;
  /** 点击后把编辑器当前选中文字提取出来（用于填卡片正反面） */
  onExtract?: (text: string) => void;
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
}: {
  onExtract?: (text: string) => void;
  placeholder?: string;
}) {
  // useEditor 取 EditorRoot 上下文里的当前编辑器
  const { editor } = useEditor();
  if (!editor) return null;
  return (
    <div className="flex gap-2 relative z-10">
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

export function NoteEditor({ initialContent, onChange, placeholder, onExtract }: NoteEditorProps) {
  return (
    <EditorRoot>
      <div className="flex items-center gap-1 flex-wrap mb-2">
        <EditorTools onExtract={onExtract} placeholder="公式用 $...$ 书写，如 $x^2$、$\frac{1}{2}$" />
      </div>
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
      />
    </EditorRoot>
  );
}
