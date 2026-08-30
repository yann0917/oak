import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { pushLogs, reminders } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

/** 站内通知轮询：本人未读 + 近 7 天已读的最近记录（铃铛下拉用） */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:reminders:notifications-get");
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 10) || 10, 50);

  const rows = db
    .select({
      id: pushLogs.id,
      channel: pushLogs.channel,
      status: pushLogs.status,
      content: pushLogs.content,
      read: pushLogs.read,
      createdAt: pushLogs.createdAt,
      reminderTitle: reminders.title,
    })
    .from(pushLogs)
    .leftJoin(reminders, eq(reminders.id, pushLogs.reminderId))
    .where(
      and(
        eq(pushLogs.userId, uid),
        eq(pushLogs.channel, "inapp"),
        eq(pushLogs.status, "sent"),
        gte(pushLogs.createdAt, new Date(Date.now() - 7 * 86400000).toISOString())
      )
    )
    .orderBy(desc(pushLogs.id))
    .limit(limit)
    .all();

  return NextResponse.json({
    unread: rows.filter((r) => !r.read).length,
    items: rows.map((r) => ({ ...r, title: r.reminderTitle || "提醒中心" })),
  });
}
