import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reminders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { dispatchNow } from "@/lib/reminders/engine";

/** 立即测试推送：走真实渠道发送，跳过静默期/节流，不动计划状态 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.uid;
  const { id } = await ctx.params;
  const r = db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, Number(id)), eq(reminders.userId, uid)))
    .get();
  if (!r) return NextResponse.json({ error: "记录不存在" }, { status: 404 });

  try {
    const result = await dispatchNow(r);
    if (result.sent.length > 0) {
      return NextResponse.json({ ok: true, channels: result.sent, failures: result.failures ?? [] });
    }
    return NextResponse.json(
      { ok: false, error: "发送失败", failures: result.failures ?? [] },
      { status: 502 }
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "发送异常" }, { status: 500 });
  }
}
