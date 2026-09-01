import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages, chatSessions } from "@/db/schema";
import { requirePerm } from "@/lib/auth";

/** 会话列表：标题 + 最后一条消息预览 + 消息数（供聊天面板会话切换） */
export async function GET(req: NextRequest) {
  const { user, denied } = await requirePerm("ai-chat-sessions", "list", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const sessions = db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      updatedAt: chatSessions.updatedAt,
      createdAt: chatSessions.createdAt,
    })
    .from(chatSessions)
    .where(eq(chatSessions.userId, user.id))
    .orderBy(desc(chatSessions.updatedAt))
    .limit(50)
    .all();

  const list = sessions.map((s) => ({
    ...s,
    // 有消息时附带最后一条预览（默认由 chat_messages 汇总合并，见下）
    lastMessage: "",
    messageCount: 0,
  }));

  const ids = list.map((s) => s.id);
  if (ids.length) {
    const msgs = db
      .select({
        sessionId: chatMessages.sessionId,
        content: chatMessages.content,
        role: chatMessages.role,
      })
      .from(chatMessages)
      .where(inArray(chatMessages.sessionId, ids))
      .orderBy(desc(chatMessages.id))
      .all();
    const map = new Map<number, { count: number; last: string }>();
    for (const m of msgs) {
      const entry = map.get(m.sessionId) ?? { count: 0, last: "" };
      entry.count += 1;
      if (!entry.last) {
        entry.last = `${m.role === "user" ? "我" : "AI"}：${m.content.replace(/\s+/g, " ").slice(0, 40)}`;
      }
      map.set(m.sessionId, entry);
    }
    for (const s of list) {
      const e = map.get(s.id);
      if (e) {
        s.messageCount = e.count;
        s.lastMessage = e.last;
      }
    }
  }

  return NextResponse.json({ list });
}

/** 新建会话 */
export async function POST(req: NextRequest) {
  const { user, denied } = await requirePerm("ai-chat-sessions", "create", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const row = db
    .insert(chatSessions)
    .values({ userId: user.id, title: "新对话" })
    .returning()
    .get();
  return NextResponse.json(row, { status: 201 });
}
