import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { pushLogs } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

/**
 * 标记通知已读：{ ids?: number[] } 或 { all: true }（均限本人）。
 * all 覆盖**所有渠道**：概览未读数（/api/app/home）按 read=0 统计、不区分渠道，
 * 若这里只清 inapp，wxpusher 等渠道的记录会留下清不掉的未读角标。
 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:reminders:logs-read-post");
  if (denied) return denied;
  const body = await req.json();
  const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];

  if (body.all || ids.length === 0) {
    db.run(sql`UPDATE push_logs SET read = 1 WHERE read = 0 AND user_id = ${uid}`);
  } else {
    db.update(pushLogs)
      .set({ read: 1 })
      .where(and(inArray(pushLogs.id, ids), eq(pushLogs.userId, uid)))
      .run();
  }
  return NextResponse.json({ ok: true });
}
