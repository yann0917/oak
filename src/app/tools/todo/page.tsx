"use client";

// 待办清单：增删改查 + 完成态（按登录账号隔离）
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Input } from "animal-island-ui";
import { api } from "@/lib/api";
import { Notification } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Todo {
  id: number;
  title: string;
  done: number;
}

export default function TodoPage() {
  const router = useRouter();
  const [items, setItems] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<Todo | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api<Todo[]>("/api/todos"));
    } catch (e: any) {
      Notification.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!title.trim()) return;
    try {
      await api("/api/todos", { method: "POST", body: JSON.stringify({ title: title.trim() }) });
      setTitle("");
      load();
    } catch (e: any) {
      Notification.error(e.message);
    }
  };

  const toggle = async (item: Todo) => {
    try {
      await api(`/api/todos/${item.id}`, { method: "PUT", body: JSON.stringify({ done: !item.done }) });
      setItems((prev) => prev.map((t) => (t.id === item.id ? { ...t, done: t.done ? 0 : 1 } : t)));
    } catch (e: any) {
      Notification.error(e.message);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api(`/api/todos/${deleting.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((t) => t.id !== deleting.id));
      setDeleting(null);
    } catch (e: any) {
      Notification.error(e.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const doneCount = items.filter((t) => t.done).length;

  return (
    <div className="h-dvh flex flex-col" style={{ background: "var(--animal-bg-color)" }}>
      <header
        className="flex items-center gap-3 px-4 h-14 shrink-0 border-b"
        style={{
          background: "var(--animal-bg-color)",
          borderColor: "var(--animal-border-color-light)",
        }}
      >
        <Button size="small" onClick={() => router.back()}>
          返回
        </Button>
        <span className="font-bold" style={{ color: "var(--animal-text-color)" }}>
          待办清单
        </span>
        <span className="text-xs ml-auto text-secondary">
          {doneCount}/{items.length} 已完成
        </span>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl w-full mx-auto space-y-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="添加一条待办，按回车确认…"
              aria-label="待办内容"
            />
          </div>
          <Button type="primary" onClick={add}>
            添加
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm text-secondary">加载中…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-sm text-secondary">
            <div className="text-4xl mb-2">🌱</div>
            今天还没有待办，轻松一点
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-2xl px-4 py-3 bg-warm-soft border border-[var(--animal-border-color-light)]"
              >
                <button
                  type="button"
                  onClick={() => toggle(item)}
                  aria-label={item.done ? "标记未完成" : "标记完成"}
                  className="w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-black cursor-pointer transition-all"
                  style={{
                    borderColor: item.done ? "var(--animal-primary-color)" : "var(--animal-border-color-light)",
                    background: item.done ? "var(--animal-primary-color)" : "transparent",
                    color: "#fff",
                  }}
                >
                  {item.done ? "✓" : ""}
                </button>
                <span
                  className={`flex-1 text-sm ${item.done ? "line-through" : ""}`}
                  style={{ color: item.done ? "var(--animal-text-color-secondary)" : "var(--animal-text-color)" }}
                >
                  {item.title}
                </span>
                <Button size="small" type="text" onClick={() => setDeleting(item)}>
                  删除
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>

      <ConfirmDialog
        open={!!deleting}
        title="删除待办"
        content={`确定删除「${deleting?.title}」？`}
        confirmText="删除"
        danger
        loading={deleteLoading}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
