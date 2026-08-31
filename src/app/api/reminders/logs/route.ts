import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { pushLogs, reminders } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

/** 发送流水列表：送达状态、失败原因一目了然。?page=1&pageSize=10&channel=&status=&reminderId= */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:reminders:logs-get");
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(Math.max(1, Number(searchParams.get("pageSize") ?? 10) || 10), 200);

  const conditions = [eq(pushLogs.userId, uid)];
  const channel = searchParams.get("channel");
  if (channel) conditions.push(eq(pushLogs.channel, channel));
  const status = searchParams.get("status");
  if (status) conditions.push(eq(pushLogs.status, status));
  const reminderId = searchParams.get("reminderId");
  if (reminderId) conditions.push(eq(pushLogs.reminderId, Number(reminderId)));
  // 默认近 30 天，避免列表无限长（节流顺延的 muted 历史不影响查询）
  conditions.push(gte(pushLogs.createdAt, new Date(Date.now() - 30 * 86400000).toISOString()));

  const total = await db.$count(pushLogs, and(...conditions));

  const rows = db
    .select({
      id: pushLogs.id,
      reminderId: pushLogs.reminderId,
      channel: pushLogs.channel,
      status: pushLogs.status,
      content: pushLogs.content,
      error: pushLogs.error,
      read: pushLogs.read,
      createdAt: pushLogs.createdAt,
      reminderTitle: reminders.title,
    })
    .from(pushLogs)
    .leftJoin(reminders, eq(reminders.id, pushLogs.reminderId))
    .where(and(...conditions))
    .orderBy(desc(pushLogs.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  return NextResponse.json({ total, list: rows });
}

/** 清空当前用户的全部发送日志（不可恢复） */
export async function DELETE(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:reminders:logs-delete");
  if (denied) return denied;
  const result = db.delete(pushLogs).where(eq(pushLogs.userId, uid)).run();
  return NextResponse.json({ ok: true, deleted: result.changes });
}
