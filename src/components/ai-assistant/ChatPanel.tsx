"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Button } from "animal-island-ui";
import { X, Plus, Trash2, Send, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const TOOL_LABEL: Record<string, string> = {
  getChildren: "成员档案",
  queryGrowth: "成长记录",
  queryHealth: "健康档案",
  queryBills: "账单",
  queryLearning: "学习记录",
  queryMoments: "时光",
  queryReminders: "提醒",
  queryTodos: "待办",
  queryNotes: "笔记",
  queryGarden: "学习园地",
  queryGardenMastery: "掌握度",
  queryCertArchives: "卡证",
  queryPolicyNotes: "政策",
  queryQuickNotes: "快记",
  queryInsights: "家庭洞察",
  searchAll: "搜索",
  webSearch: "联网搜索",
  webExtract: "网页内容",
  webSearchNative: "联网搜索",
  web_search: "联网搜索",
};

const EXAMPLES: { label: string; text: string }[] = [
  { label: "这个月账单花了多少？", text: "这个月的账单一共花了多少？" },
  { label: "孩子最近一次身高体重", text: "孩子最近一次的身高体重是多少？" },
  { label: "有哪些未缴的费用？", text: "有哪些费用还没交？" },
  { label: "最近有什么重要提醒？", text: "最近有什么重要提醒？" },
];

interface ChatSession {
  id: number;
  title: string;
  updatedAt: string;
  lastMessage?: string;
  messageCount?: number;
}

function MsgText({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p className="chat-md-p">{children}</p>,
        ul: ({ children }) => <ul className="chat-md-ul">{children}</ul>,
        ol: ({ children }) => <ol className="chat-md-ol">{children}</ol>,
        table: ({ children }) => (
          <div className="chat-md-table-wrap">
            <table className="chat-md-table">{children}</table>
          </div>
        ),
        code: ({ children }) => <code className="chat-md-code">{children}</code>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function ToolChip({ names, streaming }: { names: string[]; streaming?: boolean }) {
  const labels = names.map((n) => TOOL_LABEL[n] ?? n);
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((l, i) => (
        <span
          key={`${l}-${i}`}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs"
          style={{
            background: "var(--animal-primary-color-bg)",
            color: "var(--animal-primary-color)",
            border: "1px solid var(--animal-border-color-light)",
          }}
        >
          <Sparkles size={11} />
          {streaming ? `${l}（查询中…）` : `已查询 ${l}`}
        </span>
      ))}
    </div>
  );
}

/** 单个会话的聊天视图：key=sessionId 重挂载，避免跨会话流式状态串扰 */
function ChatView({
  sessionId,
  onChanged,
}: {
  sessionId: number;
  onChanged: () => void;
}) {
  const [toolCallsByMsg, setToolCallsByMsg] = useState<Record<string, string[]>>({});
  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    id: String(sessionId),
    transport: new DefaultChatTransport({ api: "/api/ai-chat" }),
  });
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true); // 用户停留在底部附近时自动跟随，翻上去了就不打扰
  const busy = status === "submitted" || status === "streaming";
  const prevBusy = useRef(false);

  // 一轮对话结束后刷新会话列表（标题/预览/条数）
  useEffect(() => {
    if (prevBusy.current && !busy) onChanged();
    prevBusy.current = busy;
  }, [busy, onChanged]);

  useEffect(() => {
    let live = true;
    api<{ session: ChatSession; messages: any[] }>(`/api/ai-chat-sessions/${sessionId}`)
      .then((res) => {
        if (!live) return;
        const uis: UIMessage[] = [];
        const tools: Record<string, string[]> = {};
        for (const m of res.messages) {
          const id = `m_${m.id}`;
          if (m.role === "assistant") {
            const names = Array.isArray(m.data?.toolCalls)
              ? m.data.toolCalls.map((t: any) => String(t?.name ?? ""))
              : [];
            if (names.length) tools[id] = names;
          }
          uis.push({
            id,
            role: m.role === "assistant" ? "assistant" : "user",
            parts: [{ type: "text", text: m.content }],
          });
        }
        setToolCallsByMsg(tools);
        setMessages(uis);
        stickBottom.current = true;
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // 自动跟随：直接改容器 scrollTop（瞬时、不滚窗口），不用 scrollIntoView，
  // 避免流式每个 delta 都重启平滑动画导致窗口上下跳动/连带滚动整个页面
  useEffect(() => {
    const el = listRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // 用户手动上滚时记录"不再跟随"；回到接近底部时恢复跟随
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  };

  const toolNamesOf = (msgId: string) => toolCallsByMsg[msgId] ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 消息列表 */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-3"
      >
        {messages.length === 0 && (
          <div className="pt-6 text-center text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            <p className="mb-1 inline-flex items-center gap-1">
              AI 助手已就绪，可以帮你查询家庭记录 <Sparkles size={14} />
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e.label}
                  type="button"
                  disabled={busy}
                  onClick={() => sendMessage({ text: e.text })}
                  className="rounded-full px-3 py-1.5 text-xs transition-colors hover:opacity-80 disabled:opacity-50"
                  style={{
                    background: "var(--animal-primary-color-bg)",
                    color: "var(--animal-primary-color)",
                    border: "1px solid var(--animal-border-color-light)",
                  }}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          const isUser = m.role === "user";
          const toolNames = isUser ? [] : toolNamesOf(m.id);
          return (
            <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div
                className={
                  `max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ` +
                  (isUser ? "rounded-br-md" : "rounded-bl-md")
                }
                style={
                  isUser
                    ? { background: "var(--animal-primary-color)", color: "#fff" }
                    : { background: "var(--animal-bg-color-secondary)", color: "var(--animal-text-color)" }
                }
              >
                {!isUser && toolNames.length > 0 && (
                  <div className="mb-1.5">
                    <ToolChip names={toolNames} />
                  </div>
                )}
                {m.parts.map((part: any, i: number) => {
                  if (part.type === "text") return <MsgText key={i} text={part.text ?? ""} />;
                  if (part.type === "tool") {
                    const name = String(part.toolName ?? "");
                    const streaming = part.state === "input-streaming" || part.state === "output-streaming";
                    return (
                      <div key={i} className="mb-1.5">
                        <ToolChip names={[name]} streaming={streaming} />
                      </div>
                    );
                  }
                  return null;
                })}
                {status === "streaming" && messages[messages.length - 1]?.id === m.id && (
                  <span className="chat-md-cursor" />
                )}
              </div>
            </div>
          );
        })}

        {error && (
          <div className="rounded-xl px-3 py-2 text-sm" style={{ background: "var(--animal-error-color-bg, #fff7f0)", color: "var(--animal-error-color)" }}>
            {error.message.includes("配置") ? (
              <>
                {error.message} <Link href="/settings" className="underline">去设置</Link>
              </>
            ) : (
              error.message || "出错了，请稍后再试"
            )}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="border-t px-3 py-2.5" style={{ borderColor: "var(--animal-border-color-light)" }}>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            rows={2}
            placeholder={busy ? "AI 正在回答…" : "想问点什么？Enter 发送，Shift+Enter 换行"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="min-h-[48px] flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--animal-bg-color-secondary)",
              border: "1px solid var(--animal-border-color-light)",
              color: "var(--animal-text-color)",
            }}
          />
          <div className="flex flex-col gap-1.5">
            {busy ? (
              <Button type="default" size="small" onClick={stop}>
                停止
              </Button>
            ) : (
              <Button type="primary" size="small" icon={<Send size={13} />} disabled={!input.trim()} onClick={submit}>
                发送
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** AI 助手聊天面板（跟随悬浮按钮开合） */
export function ChatPanel({ onClose }: { onClose: () => void }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [confirmDel, setConfirmDel] = useState<ChatSession | null>(null);
  const [delLoading, setDelLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadSessions = async (selectId?: number | null) => {
    try {
      const res = await api<{ list: ChatSession[] }>("/api/ai-chat-sessions");
      setSessions(res.list);
      setCurrentId((cur) => selectId ?? cur ?? res.list[0]?.id ?? null);
    } catch {
      /* 面板内不弹出全页错误 */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const createSession = async () => {
    try {
      const row = await api<ChatSession>("/api/ai-chat-sessions", { method: "POST" });
      setSessions((prev) => [row, ...prev]);
      setCurrentId(row.id);
    } catch {}
  };

  const deleteSession = async () => {
    if (!confirmDel) return;
    setDelLoading(true);
    try {
      await api(`/api/ai-chat-sessions/${confirmDel.id}`, { method: "DELETE" });
      const rest = sessions.filter((s) => s.id !== confirmDel.id);
      setSessions(rest);
      setCurrentId(rest[0]?.id ?? null);
    } catch {}
    setDelLoading(false);
    setConfirmDel(null);
  };

  const current = useMemo(
    () => (sessions.find((s) => s.id === currentId) ?? null),
    [sessions, currentId]
  );

  return (
    <div
      className="fixed bottom-24 right-4 z-[60] flex flex-col overflow-hidden rounded-2xl border"
      style={{
        width: "min(400px, calc(100vw - 40px))",
        height: "min(600px, calc(100dvh - 128px))",
        background: "var(--animal-bg-color)",
        borderColor: "var(--animal-border-color-light)",
        boxShadow: "var(--animal-shadow-lg)",
      }}
    >
      {/* 头部 */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2.5"
        style={{ borderColor: "var(--animal-border-color-light)", background: "var(--animal-bg-color-secondary)" }}
      >
        <Sparkles size={16} style={{ color: "var(--animal-primary-color)" }} />
        <span className="truncate text-sm font-semibold">
          {current ? current.title : "AI 助手"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button type="text" size="small" onClick={createSession} title="新建对话">
            <Plus size={14} />
          </Button>
          <Button
            type="text"
            size="small"
            disabled={!current}
            onClick={() => setConfirmDel(current)}
            title="删除对话"
          >
            <Trash2 size={14} />
          </Button>
          <Button type="text" size="small" onClick={onClose} title="关闭">
            <X size={14} />
          </Button>
        </div>
      </div>

      {/* 会话切换 */}
      {sessions.length > 1 && (
        <div className="border-b px-3 py-1.5" style={{ borderColor: "var(--animal-border-color-light)" }}>
          <select
            value={currentId ?? ""}
            onChange={(e) => setCurrentId(Number(e.target.value))}
            className="w-full rounded-lg px-2 py-1 text-xs outline-none"
            style={{ background: "var(--animal-bg-color-secondary)", border: "1px solid var(--animal-border-color-light)", color: "var(--animal-text-color)" }}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}（{s.messageCount ?? 0} 条）
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 聊天主体 */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
          加载中…
        </div>
      ) : currentId ? (
        <ChatView key={currentId} sessionId={currentId} onChanged={() => loadSessions()} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            还没有对话，点击「新建对话」开始
          </p>
          <Button type="primary" size="small" icon={<Plus size={13} />} onClick={createSession}>
            新建对话
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title="删除对话"
        content={`确定删除「${confirmDel?.title ?? ""}」吗？聊天记录将一并删除。`}
        confirmText="删除"
        danger
        loading={delLoading}
        onClose={() => setConfirmDel(null)}
        onConfirm={deleteSession}
      />
    </div>
  );
}
