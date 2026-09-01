import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reminderRules, reminders } from "@/db/schema";
import { computeNextRunAt, DEFAULT_TZ } from "@/lib/reminders/engine";

/**
 * 为待办创建一次性提醒（复用提醒中心：会出现在提醒中心列表，走既有推送渠道）。
 * remindAt 形如 YYYY-MM-DDTHH:mm；过期时间返回 null（不创建）。
 */
export function createTodoReminder(userId: number, title: string, content: string, remindAt: string): number | null {
  const date = remindAt.slice(0, 10);
  const time = remindAt.slice(11, 16) || "09:00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let nextRunAt = "";
  try {
    const rem: any = {
      scheduleType: "once",
      targetDate: date,
      advanceDays: "",
      timeOfDay: time,
      timezone: DEFAULT_TZ,
      nextRunAt: "",
      enabled: 1,
      retryCount: 0,
    };
    nextRunAt = computeNextRunAt(rem, new Date()) ?? "";
  } catch {
    return null;
  }
  if (!nextRunAt || time < "00:00") return null;
  const row = db
    .insert(reminders)
    .values({
      userId,
      title: `待办：${title}`,
      content: content || "待办提醒",
      scheduleType: "once",
      targetDate: date,
      timeOfDay: time,
      nextRunAt,
      timezone: DEFAULT_TZ,
      enabled: 1,
      retryCount: 0,
    })
    .returning()
    .get();
  db.insert(reminderRules).values({ reminderId: row.id }).run();
  return row.id;
}

/** 停用待办关联的提醒（任务完成/删除/改时间时） */
export function disableReminder(reminderId: number | null): void {
  if (!reminderId) return;
  db.update(reminders).set({ enabled: 0 }).where(eq(reminders.id, reminderId)).run();
}
