"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Title } from "animal-island-ui";
import type { JSONContent } from "novel";
import { api } from "@/lib/api";
import { Notification } from "@/lib/toast";
import { NoteForm } from "@/components/NoteForm";

interface Notebook {
  id: number;
  name: string;
  icon: string;
}

interface NoteDetail {
  id: number;
  title: string;
  kind: "mistake" | "article";
  contentFormat: "doc" | "markdown";
  notebookId: number | null;
  source: string;
  tags: string[];
  enabled: number;
  question: string;
  answer: string;
  content: string;
}

export default function EditNotePage() {
  const params = useParams<{ id: string }>();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params?.id) return;
    Promise.all([
      api<Notebook[]>("/api/notebooks"),
      api<NoteDetail>(`/api/notes/${params.id}`),
    ])
      .then(([nbs, n]) => {
        setNotebooks(nbs);
        if (n.kind === "article") {
          // 文章随笔：content 即 markdown 源文本，原样传给表单
          setNote({ ...n, content: n.content || "" });
          return;
        }
        let content: JSONContent = { type: "doc", content: [] };
        try {
          content = JSON.parse(n.content || "") as JSONContent;
        } catch {}
        setNote({
          ...n,
          content: JSON.stringify(content),
        });
      })
      .catch((e) => setError(e.message));
  }, [params?.id]);

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
  let parsed: JSONContent = { type: "doc", content: [] };
  if (!isArticle) {
    try {
      parsed = JSON.parse(note.content) as JSONContent;
    } catch {}
  }

  return (
    <div className="space-y-4">
      <Title size="middle" color="app-orange">
        编辑笔记
      </Title>
      <NoteForm
        noteId={note.id}
        notebooks={notebooks}
        initial={{
          kind: note.kind,
          title: note.title,
          notebookId: note.notebookId,
          source: note.source,
          tags: note.tags,
          enabled: !!note.enabled,
          question: note.question,
          answer: note.answer,
          content: isArticle ? note.content : parsed,
        }}
      />
    </div>
  );
}
