"use client";

// 错题本/笔记列表：筛选 + 搜索 + 新建/编辑/删除 + 复习入口（FSRS 到期队列）
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Modal, Select, Switch, Tag, Title } from "animal-island-ui";
import { api } from "@/lib/api";
import { Notification } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Notebook {
  id: number;
  name: string;
  icon: string;
}

interface NoteItem {
  id: number;
  title: string;
  source: string;
  tags: string[];
  enabled: number;
  notebookId: number | null;
  notebookName: string;
  due: string | null;
  state: number | null;
  reps: number;
}

const STATE_LABEL: Record<number, string> = { 0: "新卡", 1: "学习中", 2: "复习中", 3: "重学中" };

function fmtDue(due: string | null): string {
  if (!due) return "未安排";
  const diff = new Date(due).getTime() - Date.now();
  if (diff <= 0) return "今天到期";
  const days = Math.floor(diff / 86400000);
  if (days <= 0) {
    const hours = Math.floor(diff / 3600000);
    return hours <= 0 ? "1 小时内到期" : `${hours} 小时后`;
  }
  return days === 1 ? "明天到期" : `${days} 天后`;
}

export default function NotesPage() {
  const [notesList, setNotesList] = useState<NoteItem[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "enabled" | "paused" | "due">("all");
  const [q, setQ] = useState("");
  const [nbFilter, setNbFilter] = useState("");
  const [dueCount, setDueCount] = useState(0);

  const [nbModal, setNbModal] = useState(false);
  const [nbName, setNbName] = useState("");
  const [nbIcon, setNbIcon] = useState("");
  const [savingNb, setSavingNb] = useState(false);

  const [deleting, setDeleting] = useState<NoteItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (tab === "enabled") params.set("enabled", "1");
    if (tab === "paused") params.set("enabled", "0");
    if (tab === "due") params.set("due", "1");
    if (nbFilter) params.set("notebookId", nbFilter);
    if (q.trim()) params.set("q", q.trim());
    const [list, nbs, due] = await Promise.all([
      api<NoteItem[]>(`/api/notes?${params.toString()}`),
      api<Notebook[]>("/api/notebooks"),
      api<NoteItem[]>("/api/notes?due=1"),
    ]);
    setNotesList(list);
    setNotebooks(nbs);
    setDueCount(due.length);
  }, [tab, q, nbFilter]);

  useEffect(() => {
    load()
      .catch((e) => Notification.error(e.message))
      .finally(() => setLoading(false));
  }, [load]);

  const toggleEnabled = async (item: NoteItem) => {
    try {
      await api(`/api/notes/${item.id}`, { method: "PUT", body: JSON.stringify({ enabled: !item.enabled }) });
      setNotesList((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, enabled: n.enabled ? 0 : 1 } : n))
      );
      Notification.success(item.enabled ? "已暂停复习" : "已恢复复习");
      api<NoteItem[]>("/api/notes?due=1")
        .then((due) => setDueCount(due.length))
        .catch(() => {});
    } catch (e: any) {
      Notification.error(e.message);
    }
  };

  const createNotebook = async () => {
    if (!nbName.trim()) return;
    setSavingNb(true);
    try {
      await api("/api/notebooks", { method: "POST", body: JSON.stringify({ name: nbName.trim(), icon: nbIcon }) });
      Notification.success("笔记本已创建");
      setNbModal(false);
      setNbName("");
      setNbIcon("");
      api<Notebook[]>("/api/notebooks").then(setNotebooks).catch(() => {});
    } catch (e: any) {
      Notification.error(e.message);
    } finally {
      setSavingNb(false);
    }
  };

  const removeNote = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api(`/api/notes/${deleting.id}`, { method: "DELETE" });
      Notification.success("已删除");
      setDeleting(null);
      load().catch(() => {});
    } catch (e: any) {
      Notification.error(e.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Title size="middle" color="app-orange">
          错题本/笔记
        </Title>
        {dueCount > 0 && (
          <Tag size="small" variant="soft" color="app-red">
            今日待复习 {dueCount} 张
          </Tag>
        )}
        <div className="ml-auto flex gap-2">
          <Link href="/review">
            <Button size="small" type="primary">
              开始复习{dueCount > 0 ? `（${dueCount}）` : ""}
            </Button>
          </Link>
          <Link href="/notes/new">
            <Button size="small">录入错题</Button>
          </Link>
          <Button size="small" onClick={() => setNbModal(true)}>
            笔记本
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Select
            value={tab}
            onChange={(v) => setTab(v as typeof tab)}
            options={[
              { key: "all", label: "全部" },
              { key: "enabled", label: "参与复习" },
              { key: "paused", label: "已暂停" },
              { key: "due", label: "今日到期" },
            ]}
            aria-label="筛选复习状态"
          />
        </div>
        <div className="w-48">
          <Select
            value={nbFilter}
            onChange={setNbFilter}
            options={[{ key: "", label: "全部笔记本" }, ...notebooks.map((n) => ({ key: String(n.id), label: `${n.icon} ${n.name}` }))]}
            aria-label="按笔记本筛选"
          />
        </div>
        <div className="flex-1 min-w-44 max-w-72">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索标题…"
            aria-label="搜索错题标题"
          />
        </div>
        <Link href="/stats" className="text-sm text-secondary">
          查看复习统计 →
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-16 text-sm text-secondary">加载中…</div>
      ) : notesList.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-4xl mb-2">📚</div>
          <p className="text-secondary text-sm">
            {tab === "due" ? "今天没有到期的卡片，去休息一下或者录点新错题吧" : "还没有笔记，点击右上角「录入错题」开始"}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notesList.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-40">
                  <Link
                    href={`/notes/${item.id}`}
                    className="font-bold text-base hover:underline"
                    style={{ color: "var(--animal-text-color)" }}
                  >
                    {item.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {item.notebookName && <Tag size="small" color="app-teal">{item.notebookName}</Tag>}
                    {item.source && <span className="text-xs text-secondary">📄 {item.source}</span>}
                    {item.tags.map((t) => (
                      <Tag key={t} size="small" variant="soft" color="app-yellow">
                        {t}
                      </Tag>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right text-xs">
                    <div className={item.state !== null && item.state !== 0 ? "font-bold" : ""} style={{ color: "var(--animal-primary-color-active)" }}>
                      {item.state !== null ? STATE_LABEL[item.state] ?? "新卡" : "新卡"}
                    </div>
                    <div className="text-secondary mt-0.5">{fmtDue(item.due)}</div>
                  </div>
                  <Switch checked={!!item.enabled} onChange={() => toggleEnabled(item)} aria-label="暂停/恢复复习" />
                  <Link href={`/notes/${item.id}/edit`} className="text-sm text-secondary hover:underline">
                    编辑
                  </Link>
                  <Button size="small" type="text" onClick={() => setDeleting(item)}>
                    删除
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={nbModal} onClose={() => setNbModal(false)} title="笔记本">
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input value={nbName} onChange={(e) => setNbName(e.target.value)} placeholder="如：数学错题 / 英语笔记" aria-label="笔记本名称" />
            </div>
            <div className="w-16">
              <Input value={nbIcon} onChange={(e) => setNbIcon(e.target.value)} placeholder="📕" aria-label="笔记本图标" />
            </div>
          </div>
          {notebooks.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {notebooks.map((n) => (
                <div key={n.id} className="flex items-center justify-between rounded-xl px-3 py-2 bg-warm">
                  <span className="text-sm font-semibold">
                    {n.icon} {n.name}
                  </span>
                  <span className="text-xs text-secondary">已建</span>
                </div>
              ))}
            </div>
          )}
          <Button type="primary" loading={savingNb} onClick={createNotebook} className="w-full">
            创建笔记本
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="删除笔记"
        content={`确定删除「${deleting?.title}」？复习记录会一并清除，且无法恢复。`}
        confirmText="删除"
        danger
        loading={deleteLoading}
        onConfirm={removeNote}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
