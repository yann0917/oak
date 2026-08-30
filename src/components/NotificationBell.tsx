"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "animal-island-ui";
import { api } from "@/lib/api";

interface Notice {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  read: number;
}

const POLL_MS = 30_000;

/** 站内通知铃铛：轮询 push_logs 中 channel=inapp 的记录，红点提示未读 */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api<{ unread: number; items: Notice[] }>("/api/reminders/notifications?limit=8");
      setUnread(res.unread);
      setItems(res.items);
    } catch {
      /* 未登录或后端异常时静默 */
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markRead = async (ids?: number[]) => {
    await api("/api/reminders/logs/read", { method: "POST", body: JSON.stringify(ids ? { ids } : { all: true }) });
    setItems((prev) => prev.map((i) => ({ ...i, read: 1 })));
    setUnread(0);
  };

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={unread > 0 ? `站内通知，${unread} 条未读` : "站内通知"}
        className="relative flex items-center justify-center w-9 h-9 rounded-full border-0 bg-transparent transition-all hover:opacity-80"
        style={{ color: "var(--animal-text-color-secondary)" }}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="icon-chat" size={20} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ background: "var(--animal-error-color)" }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-2xl shadow-lg z-50"
          style={{ background: "#fff", border: "2px solid var(--animal-border-color-light)" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--animal-border-color-light)" }}>
            <span className="text-sm font-bold">站内通知</span>
            {unread > 0 && (
              <Button size="small" type="text" onClick={() => markRead()}>
                全部已读
              </Button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
              {loading ? "加载中…" : "暂无通知"}
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => !n.read && markRead([n.id])}
                className="w-full text-left px-4 py-3 border-b last:border-b-0 hover:opacity-80"
                style={{ borderColor: "var(--animal-border-color-light)" }}
              >
                <div className="flex items-center gap-2">
                  {!n.read && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: "var(--animal-error-color)" }}
                    />
                  )}
                  <span className="text-sm font-semibold truncate">{n.title}</span>
                  <span className="text-xs ml-auto shrink-0" style={{ color: "var(--animal-text-color-secondary)" }}>
                    {fmtTime(n.createdAt)}
                  </span>
                </div>
                {n.content && (
                  <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--animal-text-color-secondary)" }}>
                    {n.content}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
