import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reminderRules, reminders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { computeNextRunAt, type Reminder } from "@/lib/reminders/engine";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.uid;
  const { id } = await ctx.params;
  const existing = db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, Number(id)), eq(reminders.userId, uid)))
    .get();
  if (!existing) return NextResponse.json({ error: "记录不存在" }, { status: 404 });

  const body = await req.json();
  const built = buildReminderLocal(body, existing);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

  // 启用状态下重算下次触发；停用状态下仅保存字段、保留原 next_run_at（重新启用时再重算）
  let nextRunAt = existing.nextRunAt;
  let enabled = Number(body.enabled ?? existing.enabled);
  const needsReschedule = Number(body.enabled ?? existing.enabled) === 1;
  if (needsReschedule) {
    let next: string | null;
    try {
      next = computeNextRunAt({ ...existing, ...built.value, enabled: 1 } as Reminder, new Date());
    } catch {
      return NextResponse.json({ error: "Cron 表达式不合法" }, { status: 400 });
    }
    if (!next) return NextResponse.json({ error: "触发时间已全部过期，请检查事件日期" }, { status: 400 });
    nextRunAt = next;
    enabled = 1;
  }

  const row = db
    .update(reminders)
    .set({ ...built.value, nextRunAt, enabled, retryCount: 0 })
    .where(eq(reminders.id, existing.id))
    .returning()
    .get();

  // 规则 upsert（一对一）
  const ruleValues = {
    channels: body.channels ?? "wxpusher",
    quietHours: body.quietHours ?? "",
    minIntervalMinutes: Number(body.minIntervalMinutes ?? 60) || 60,
    maxRetries: Number(body.maxRetries ?? 3) || 3,
    fallbackChannel: body.fallbackChannel ?? "",
  };
  db.insert(reminderRules)
    .values({ reminderId: row.id, ...ruleValues })
    .onConflictDoUpdate({ target: reminderRules.reminderId, set: ruleValues })
    .run();

  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.uid;
  const { id } = await ctx.params;
  // 只允许操作本人提醒；FK 级联删除 reminder_rules；push_logs 保留供排障
  const row = db
    .delete(reminders)
    .where(and(eq(reminders.id, Number(id)), eq(reminders.userId, uid)))
    .returning()
    .get();
  if (!row) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// ===== 与 collection 路由复用同构校验（避免循环依赖，此处轻量复制） =====

const SCHEDULE_TYPES = ["once", "daily", "weekly", "monthly", "cron"];

function buildReminderLocal(body: any, existing: Reminder) {
  const title = (body.title ?? "").trim();
  if (!title) return { ok: false, error: "标题不能为空" };
  const scheduleType = body.scheduleType ?? existing.scheduleType;
  if (!SCHEDULE_TYPES.includes(scheduleType)) return { ok: false, error: "未知的提醒类型" };
  if (scheduleType === "once" && !(body.targetDate ?? existing.targetDate ?? "")) {
    return { ok: false, error: "一次性提醒需要选择事件日期" };
  }
  if (scheduleType === "cron" && !(body.cronExpr ?? existing.cronExpr ?? "").trim()) {
    return { ok: false, error: "Cron 提醒需要填写表达式，如 0 9 * * 1-5" };
  }
  return {
    ok: true,
    value: {
      title,
      content: body.content ?? "",
      childId: body.childId != null ? Number(body.childId) : existing.childId,
      scheduleType,
      cronExpr: body.cronExpr ?? "",
      timeOfDay: body.timeOfDay ?? "09:00",
      weekdays: body.weekdays ?? "",
      monthDays: body.monthDays ?? "",
      targetDate: body.targetDate ?? "",
      advanceDays: body.advanceDays ?? "",
      timezone: existing.timezone || "Asia/Shanghai",
    },
  };
}
