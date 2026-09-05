"use client";

// 笔记详情阅读态：novel JSON 静态渲染 + 卡片正反面 KaTeX + 复习徽章
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Tag } from "animal-island-ui";
import type { JSONContent } from "novel";
import { api } from "@/lib/api";
import { Notification } from "@/lib/toast";
import { NoteDoc } from "@/components/NoteDoc";
import { MathMd } from "@/components/MathMd";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface NoteDetail {
  id: number;
  title: string;
  kind: "mistake" | "article";
  contentFormat: "doc" | "markdown";
  source: string;
  tags: string[];
  notebookName: string;
  enabled: number;
  question: string;
  answer: string;
  content: string;
  due: string | null;
  state: number | null;
  reps: number;
}

const STATE_LABEL: Record<number, string> = { 0: "新卡", 1: "学习中", 2: "复习中", 3: "重学中" };

export default function NoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    api<NoteDetail>(`/api/notes/${params.id}`)
      .then(setNote)
      .catch((e) => setError(e.message));
  }, [params?.id]);

  const remove = async () => {
    if (!note) return;
    setDeleting(true);
    try {
      await api(`/api/notes/${note.id}`, { method: "DELETE" });
      Notification.success("已删除");
      router.push("/notes");
    } catch (e: any) {
      Notification.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  if (error) {
    return (
      <div className="text-center py-16 text-sm text-red-500">
        {error}，<Link href="/notes" className="underline">返回列表</Link>
      </div>
    );
  }
  if (!note) {
    return <div className="text-center py-16 text-sm text-secondary">加载中…</div>;
  }

  const isArticle = note.kind === "article";
  let content: JSONContent = { type: "doc", content: [] };
  if (!isArticle && note.content) {
    try {
      content = JSON.parse(note.content) as JSONContent;
    } catch {}
  }
  const isDue = note.due && new Date(note.due) <= new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-black m-0" style={{ color: "var(--animal-text-color)" }}>
          {note.title}
        </h1>
        {note.notebookName && <Tag size="small" color="app-teal">{note.notebookName}</Tag>}
        {note.kind === "article" && <Tag size="small" variant="soft" color="app-blue">文章随笔</Tag>}
        {note.state !== null && (
          <Tag size="small" variant="soft" color={isDue ? "app-red" : "app-green"}>
            {STATE_LABEL[note.state] ?? "新卡"} · 已复习 {note.reps} 次
          </Tag>
        )}
      </div>

      {(note.source || note.tags.length > 0) && (
        <div className="flex flex-wrap gap-2 text-sm text-secondary">
          {note.source && <span>📄 {note.source}</span>}
          {note.tags.map((t) => (
            <Tag key={t} size="small" variant="soft" color="app-yellow">{t}</Tag>
          ))}
        </div>
      )}

      {!isArticle && note.question.trim() && (
        <Card className="p-4">
          <div className="text-xs font-bold mb-2" style={{ color: "var(--animal-text-color-secondary)" }}>
            卡片正面
          </div>
          <MathMd text={note.question} />
        </Card>
      )}
      {!isArticle && note.answer.trim() && (
        <Card className="p-4">
          <div className="text-xs font-bold mb-2" style={{ color: "var(--animal-text-color-secondary)" }}>
            卡片背面
          </div>
          <MathMd text={note.answer} />
        </Card>
      )}

      {isArticle ? (
        note.content.trim() ? (
          <Card className="p-4">
            <MathMd text={note.content} className="text-sm leading-7" />
          </Card>
        ) : null
      ) : content.content?.length ? (
        <Card className="p-4">
          <div className="text-xs font-bold mb-2" style={{ color: "var(--animal-text-color-secondary)" }}>
            正文
          </div>
          <NoteDoc content={content} />
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3 pt-1">
        {!isArticle && (
          <Link href={isDue ? "/review" : `#`}>
            <Button type="primary" disabled={!isDue}>
              {isDue ? "去复习（今天到期）" : `下次复习：${note.due ? new Date(note.due).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "未安排"}`}
            </Button>
          </Link>
        )}
        <Link href={`/notes/${note.id}/edit`}>
          <Button>编辑</Button>
        </Link>
        <Button onClick={() => setConfirm(true)}>删除</Button>
        <Link href="/notes">
          <Button type="text">返回列表</Button>
        </Link>
      </div>

      <ConfirmDialog
        open={confirm}
        title="删除笔记"
        content={`确定删除「${note.title}」？复习记录会一并清除，且无法恢复。`}
        confirmText="删除"
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
