import { NextRequest, NextResponse } from "next/server";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { children, reminderRules, reminders } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { computeNextRunAt, DEFAULT_TZ, type Reminder } from "@/lib/reminders/engine";

const SCHEDULE_TYPES = ["once", "daily", "weekly", "monthly", "cron"];

/** 前端提交的扁平表单字段（规则字段与提醒字段同层） */
interface ReminderBody {
  title?: string;
  content?: string;
  childId?: number | null;
  scheduleType?: string;
  cronExpr?: string;
  timeOfDay?: string;
  weekdays?: string;
  monthDays?: string;
  targetDate?: string;
  advanceDays?: string;
  enabled?: number;
  channels?: string;
  quietHours?: string;
  minIntervalMinutes?: number;
  maxRetries?: number;
  fallbackChannel?: string;
}

/** 校验并构造可入库的提醒对象（nextRunAt 由调用方计算） */
function buildReminder(body: ReminderBody, existing?: Reminder): { ok: true; value: any } | { ok: false; error: string } {
  const title = (body.title ?? "").trim();
  if (!title) return { ok: false, error: "标题不能为空" };
  const scheduleType = body.scheduleType ?? existing?.scheduleType ?? "once";
  if (!SCHEDULE_TYPES.includes(scheduleType)) return { ok: false, error: "未知的提醒类型" };
  if (scheduleType === "once" && !(body.targetDate ?? existing?.targetDate ?? "")) {
    return { ok: false, error: "一次性提醒需要选择事件日期" };
  }
  if (scheduleType === "cron" && !(body.cronExpr ?? existing?.cronExpr ?? "").trim()) {
    return { ok: false, error: "Cron 提醒需要填写表达式，如 0 9 * * 1-5" };
  }
  return {
    ok: true,
    value: {
      title,
      content: body.content ?? "",
      childId: body.childId != null ? Number(body.childId) : existing?.childId ?? null,
      scheduleType,
      cronExpr: body.cronExpr ?? "",
      timeOfDay: body.timeOfDay ?? "09:00",
      weekdays: body.weekdays ?? "",
      monthDays: body.monthDays ?? "",
      targetDate: body.targetDate ?? "",
      advanceDays: body.advanceDays ?? "",
      timezone: existing?.timezone ?? DEFAULT_TZ,
    },
  };
}

function buildRule(body: ReminderBody): Record<string, any> {
  return {
    channels: body.channels ?? "wxpusher",
    quietHours: body.quietHours ?? "",
    minIntervalMinutes: Number(body.minIntervalMinutes ?? 60) || 60,
    maxRetries: Number(body.maxRetries ?? 3) || 3,
    fallbackChannel: body.fallbackChannel ?? "",
  };
}

export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:reminders:list");
  if (denied) return denied;

  const rows = db
    .select({
      id: reminders.id,
      childId: reminders.childId,
      title: reminders.title,
      content: reminders.content,
      scheduleType: reminders.scheduleType,
      cronExpr: reminders.cronExpr,
      timeOfDay: reminders.timeOfDay,
      weekdays: reminders.weekdays,
      monthDays: reminders.monthDays,
      targetDate: reminders.targetDate,
      advanceDays: reminders.advanceDays,
      nextRunAt: reminders.nextRunAt,
      enabled: reminders.enabled,
      retryCount: reminders.retryCount,
      createdAt: reminders.createdAt,
      rule: reminderRules,
    })
    .from(reminders)
    .leftJoin(reminderRules, eq(reminderRules.reminderId, reminders.id))
    .where(eq(reminders.userId, uid))
    .orderBy(desc(reminders.id))
    .all();

  // 一次性取孩子名，供列表展示
  const childIds = [...new Set(rows.map((r) => r.childId).filter((v): v is number => v != null))];
  const childNames = new Map<number, string>();
  if (childIds.length) {
    for (const c of db.select().from(children).where(inArray(children.id, childIds)).all()) {
      childNames.set(c.id, c.name);
    }
  }

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      childId: r.childId,
      childName: r.childId != null ? childNames.get(r.childId) ?? "" : "",
      title: r.title,
      content: r.content,
      scheduleType: r.scheduleType,
      cronExpr: r.cronExpr,
      timeOfDay: r.timeOfDay,
      weekdays: r.weekdays,
      monthDays: r.monthDays,
      targetDate: r.targetDate,
      advanceDays: r.advanceDays,
      nextRunAt: r.nextRunAt,
      enabled: r.enabled,
      retryCount: r.retryCount,
      createdAt: r.createdAt,
      rules: r.rule ?? null,
    }))
  );
}

export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:reminders:create");
  if (denied) return denied;
  const body = (await req.json()) as ReminderBody;

  const built = buildReminder(body);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

  let next: string | null;
  try {
    next = computeNextRunAt({ ...built.value, nextRunAt: "", enabled: 1, retryCount: 0 } as Reminder, new Date());
  } catch {
    return NextResponse.json({ error: "Cron 表达式不合法" }, { status: 400 });
  }
  if (!next) {
    return NextResponse.json({ error: "触发时间已全部过期，请检查事件日期" }, { status: 400 });
  }

  const row = db
    .insert(reminders)
    .values({ ...built.value, userId: uid, nextRunAt: next, enabled: 1, retryCount: 0 })
    .returning()
    .get();
  db.insert(reminderRules).values({ reminderId: row.id, ...buildRule(body) }).run();
  return NextResponse.json(row, { status: 201 });
}
