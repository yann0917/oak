import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reminders } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { computeNextRunAt } from "@/lib/reminders/engine";

/** 启用/停用提醒。启用时若原 next_run_at 已过期则从当前时刻重算。 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:reminders:toggle-post");
  if (denied) return denied;
  const { id } = await ctx.params;
  const r = db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, Number(id)), eq(reminders.userId, uid)))
    .get();
  if (!r) return NextResponse.json({ error: "记录不存在" }, { status: 404 });

  const { enabled } = await req.json();
  const enable = enabled == null ? (r.enabled ? 0 : 1) : enabled ? 1 : 0;

  let nextRunAt = r.nextRunAt;
  if (enable) {
    if (!r.nextRunAt || Date.parse(r.nextRunAt) <= Date.now()) {
      const next = computeNextRunAt(r, new Date());
      if (!next) {
        return NextResponse.json({ error: "该提醒没有剩余触发点（日期已全部过期）" }, { status: 400 });
      }
      nextRunAt = next;
    }
  }

  const row = db
    .update(reminders)
    .set({ enabled: enable, nextRunAt, retryCount: 0 })
    .where(eq(reminders.id, r.id))
    .returning()
    .get();
  return NextResponse.json(row);
}
