"use client";

// 错题录入/编辑表单：novel 正文 + 复习卡正反面（Markdown + $公式）
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select, Switch } from "animal-island-ui";
import type { JSONContent } from "novel";
import { api } from "@/lib/api";
import { Notification } from "@/lib/toast";
import { NoteEditor } from "@/components/NoteEditor";

interface Notebook {
  id: number;
  name: string;
  icon: string;
}

interface NoteFormData {
  title: string;
  notebookId: number | null;
  source: string;
  tags: string[];
  enabled: boolean;
  question: string;
  answer: string;
  content: JSONContent;
}

interface NoteFormProps {
  noteId?: number; // 传了就是编辑
  initial: Partial<NoteFormData>;
  notebooks: Notebook[];
  onSaved?: () => void;
}

export function NoteForm({ noteId, initial, notebooks }: NoteFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title ?? "");
  const [notebookId, setNotebookId] = useState(initial.notebookId ? String(initial.notebookId) : "");
  const [source, setSource] = useState(initial.source ?? "");
  const [tagsText, setTagsText] = useState((initial.tags ?? []).join(", "));
  const [enabled, setEnabled] = useState(initial.enabled ?? true);
  const [question, setQuestion] = useState(initial.question ?? "");
  const [answer, setAnswer] = useState(initial.answer ?? "");
  const [content, setContent] = useState<JSONContent>(
    initial.content ?? { type: "doc", content: [{ type: "paragraph" }] }
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      Notification.warning("标题不能为空");
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({
        title: title.trim(),
        notebookId: notebookId ? Number(notebookId) : null,
        source: source.trim(),
        tags: tagsText.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
        enabled,
        question,
        answer,
        content: JSON.stringify(content),
      });
      if (noteId) {
        await api(`/api/notes/${noteId}`, { method: "PUT", body });
        Notification.success("已保存");
        router.push(`/notes/${noteId}`);
      } else {
        const created = await api<{ id: number }>("/api/notes", { method: "POST", body });
        Notification.success("已录入，加入复习队列");
        router.push(`/notes/${created.id}`);
      }
    } catch (e: any) {
      Notification.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div>
          <label className="block text-sm font-bold mb-1.5">标题</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：二次函数顶点式求法" aria-label="笔记标题" />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-bold mb-1.5">笔记本</label>
            <Select
              value={notebookId}
              onChange={setNotebookId}
              options={[
                { key: "", label: "未分类" },
                ...notebooks.map((n) => ({ key: String(n.id), label: `${n.icon} ${n.name}` })),
              ]}
              aria-label="选择笔记本"
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">出处</label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="如：教材 P123 / 月考卷" aria-label="题目出处" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-bold mb-1.5">标签（逗号分隔）</label>
          <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="如：函数, 易错点, 期中" aria-label="标签" />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onChange={setEnabled} />
          <span className="text-sm">参与复习（关闭则暂停调度）</span>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-bold">正文（题目、解析、推导）</label>
          <span className="text-xs text-secondary">公式：输入 Latex: 后跟 LaTeX（如 Latex:\frac{1}{2}）</span>
        </div>
        <NoteEditor
          initialContent={content}
          onChange={setContent}
          onExtract={(text) => {
            setQuestion((prev) => (prev ? prev + "\n" : "") + text);
            Notification.info("已填入卡片正面");
          }}
        />
      </Card>

      <Card className="p-4 space-y-3">
        <div>
          <label className="block text-sm font-bold mb-1.5">卡片正面（复习时先看到）</label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            placeholder="支持 Markdown 和 $ 公式，如：求 $y=x^2$ 的顶点"
            className="w-full rounded-2xl border border-[var(--animal-border-color-light)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--animal-primary-color)]"
          />
        </div>
        <div>
          <label className="block text-sm font-bold mb-1.5">卡片背面（答案）</label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            placeholder="支持 Markdown 和 $ 公式"
            className="w-full rounded-2xl border border-[var(--animal-border-color-light)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--animal-primary-color)]"
          />
        </div>
      </Card>

      <div className="flex gap-3">
        <Button type="primary" size="large" loading={saving} onClick={save} className="flex-1">
          {noteId ? "保存修改" : "保存入库"}
        </Button>
        <Button size="large" onClick={() => router.back()}>
          取消
        </Button>
      </div>
    </div>
  );
}
