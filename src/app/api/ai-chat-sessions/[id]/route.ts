import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages, chatSessions } from "@/db/schema";
import { requirePerm } from "@/lib/auth";

/** 会话详情：消息列表（升序，最多 100 条），assistant 的 data 解析为 JSON */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requirePerm("ai-chat-sessions", "detail", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "会话 id 无效" }, { status: 400 });
  }

  const session = db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, user.id)))
    .get();
  if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });

  const rows = db
    .select({
      id: chatMessages.id,
      sessionId: chatMessages.sessionId,
      role: chatMessages.role,
      content: chatMessages.content,
      data: chatMessages.data,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(and(eq(chatMessages.sessionId, id), eq(chatMessages.userId, user.id)))
    .orderBy(asc(chatMessages.id))
    .limit(100)
    .all();

  const messages = rows.map((r) => {
    let data: unknown = {};
    try {
      data = JSON.parse(r.data || "{}");
    } catch {
      data = {};
    }
    return { ...r, data };
  });

  return NextResponse.json({ session, messages });
}

/** 删除会话（消息级联删除） */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requirePerm("ai-chat-sessions", "delete", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "会话 id 无效" }, { status: 400 });
  }

  const row = db
    .delete(chatSessions)
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, user.id)))
    .run();
  if (row.changes === 0) return NextResponse.json({ error: "会话不存在" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
