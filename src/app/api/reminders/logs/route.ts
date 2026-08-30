import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { pushLogs, reminders } from "@/db/schema";
import { requireUser } from "@/lib/auth";

/** 发送流水列表：送达状态、失败原因一目了然。?limit=50&channel=&status=&reminderId= */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.uid;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);

  const conditions = [eq(pushLogs.userId, uid)];
  const channel = searchParams.get("channel");
  if (channel) conditions.push(eq(pushLogs.channel, channel));
  const status = searchParams.get("status");
  if (status) conditions.push(eq(pushLogs.status, status));
  const reminderId = searchParams.get("reminderId");
  if (reminderId) conditions.push(eq(pushLogs.reminderId, Number(reminderId)));
  // 默认近 30 天，避免列表无限长（节流顺延的 muted 历史不影响查询）
  conditions.push(gte(pushLogs.createdAt, new Date(Date.now() - 30 * 86400000).toISOString()));

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
    .limit(limit)
    .all();

  return NextResponse.json(rows);
}
