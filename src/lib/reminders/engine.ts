import { CronExpressionParser } from "cron-parser";
import { db } from "@/db";
import { children, pushLogs, reminderRules, reminders } from "@/db/schema";
import type { InferSelectModel } from "drizzle-orm";
import { eq, and, desc } from "drizzle-orm";
import { sendChannel } from "./channels";

export type Reminder = InferSelectModel<typeof reminders>;
export type Rule = InferSelectModel<typeof reminderRules>;

/** 页面不开放时区编辑，全应用统一北京时间 */
export const DEFAULT_TZ = "Asia/Shanghai";

export const DEFAULT_RULE: Omit<Rule, "reminderId"> = {
  channels: "wxpusher",
  quietHours: "",
  minIntervalMinutes: 60,
  maxRetries: 3,
  fallbackChannel: "",
};

export interface DispatchResult {
  sent: string[];
  /** quiet_hours | throttled | failed */
  skipped?: string;
  failures?: { channel: string; error: string }[];
}

export function getRule(reminderId: number): Rule {
  const rule = db.select().from(reminderRules).where(eq(reminderRules.reminderId, reminderId)).get();
  if (rule) return rule;
  return { reminderId, ...DEFAULT_RULE };
}

// ===== 时间计算 =====

/** 把 HH:mm 拆成 cron 的分/时字段，格式非法时回退 09:00 */
function timeParts(time: string): { mm: string; hh: string } {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time || "09:00").trim());
  if (!m) return { mm: "0", hh: "9" };
  return { mm: String(Number(m[2])), hh: String(Number(m[1])) };
}

function cronNext(expr: string, r: { timezone: string }, from: Date): string | null {
  const it = CronExpressionParser.parse(expr, { tz: r.timezone || DEFAULT_TZ, currentDate: from });
  return it.next().toISOString();
}

/** 提前预告候选点（advanceDays 各值 + 事件当天），已按日期升序去重 */
function advancePoints(r: Reminder): string[] {
  if (!r.advanceDays.trim() || !r.targetDate) return [r.targetDate];
  const days = [...new Set(r.advanceDays.split(",").map((s) => Number(s.trim())).filter((n) => n >= 0))];
  const base = Date.parse(`${r.targetDate}T00:00:00Z`); // 事件日零点（UTC 数学，仅做日期位移）
  const points = days
    .map((n) => new Date(base - n * 86400000).toISOString().slice(0, 10))
    .concat([r.targetDate]);
  return [...new Set(points)].sort();
}

/**
 * 预计算 next_run_at：调度只认这一列，不重复解析表达式。
 * 返回 null 表示无后续触发点（once 全部发完），由调用方停用提醒。
 */
export function computeNextRunAt(r: Reminder, from: Date): string | null {
  const { mm, hh } = timeParts(r.timeOfDay);
  if (r.scheduleType === "once") {
    // 预告/事件日按时区构造本地时刻（项目默认北京时间，+08:00）
    const tzOff = +8;
    const points = advancePoints(r);
    for (const day of points) {
      if (!day) continue;
      const iso = `${day}T${r.timeOfDay || "09:00"}:00.000+${String(tzOff).padStart(2, "0")}:00`;
      const t = Date.parse(iso);
      if (!Number.isNaN(t) && t >= from.getTime()) return new Date(t).toISOString();
    }
    return null;
  }
  const expr =
    r.scheduleType === "daily"
      ? `0 ${mm} ${hh} * * *`
      : r.scheduleType === "weekly"
        ? `0 ${mm} ${hh} * * ${(r.weekdays || "1").trim()}`
        : r.scheduleType === "monthly"
          ? `0 ${mm} ${hh} ${(r.monthDays || "1").trim()} * *`
          : r.scheduleType === "cron"
            ? r.cronExpr.trim()
            : null;
  if (!expr) return null;
  return cronNext(expr, r, from);
}

/** 时区感知的当天日期 YYYY-MM-DD */
function todayInTz(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** 目标日与今天的自然日差值；0 → "今天" */
function daysLeftLabel(target: string, now: Date, tz: string): string {
  if (!target) return "";
  const diff = Math.ceil(
    (Date.parse(`${target}T00:00:00Z`) - Date.parse(`${todayInTz(now, tz)}T00:00:00Z`)) / 86400000
  );
  if (diff <= 0) return "今天";
  return String(diff);
}

// ===== 静默期 =====

/**
 * 静默期顺延目标时刻：'22:00-07:00' 的结束时刻（今天或明天，视当前时间）。
 * 不在静默期返回 null。
 */
function quietResumeAt(range: string, r: Reminder, now: Date): string | null {
  const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(range.trim());
  if (!m) return null;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  const inQuiet = start <= end ? nowMins >= start && nowMins <= end : nowMins >= start || nowMins <= end;
  if (!inQuiet) return null;
  return cronNext(`0 ${Number(m[4])} ${Number(m[3])} * * *`, r, now);
}

// ===== 模板渲染 =====

export function renderContent(r: Reminder, childName: string, now: Date = new Date()): { title: string; body: string } {
  const vars: [string, string][] = [
    ["{{child}}", childName || "孩子"],
    ["{{target_date}}", r.targetDate],
    ["{{date}}", r.targetDate],
    ["{{days_left}}", daysLeftLabel(r.targetDate, now, r.timezone || DEFAULT_TZ)],
  ];
  const render = (s: string) => vars.reduce((acc, [k, v]) => acc.replaceAll(k, v), s);
  return { title: render(r.title), body: render(r.content || r.title) };
}

// ===== 发送流水 =====

function logPush(userId: number, reminderId: number | null, channel: string, status: string, error = "", content = "") {
  db.insert(pushLogs).values({ userId, reminderId, channel, status, error, content }).run();
}

/**
 * 规则引擎管线：静默期顺延 → 节流去重 → 模板渲染 → 多渠道发送 →
 * 失败兜底渠道 → 结果落库（成功推进 next_run_at / 失败退避重试 / 超限停用）。
 * test 模式（立即测试推送）跳过静默期与节流，不改动计划状态。
 */
export async function dispatch(r: Reminder, opts: { test?: boolean } = {}): Promise<DispatchResult> {
  const rule = getRule(r.id);
  const now = new Date();

  // 模板渲染（提前到管线开头，静默/节流日志也带上消息内容）
  const childName = r.childId
    ? db.select().from(children).where(eq(children.id, r.childId)).get()?.name ?? ""
    : "";
  const { title, body } = renderContent(r, childName, now);

  // 1. 静默期：顺延到静默结束，本次不发送
  if (!opts.test && rule.quietHours) {
    const resume = quietResumeAt(rule.quietHours, r, now);
    if (resume) {
      db.update(reminders)
        .set({ nextRunAt: resume })
        .where(eq(reminders.id, r.id))
        .run();
      logPush(r.userId, r.id, "", "muted", `静默期（${rule.quietHours}）顺延`, body);
      return { sent: [], skipped: "quiet_hours" };
    }
  }

  // 2. 节流：距上次 sent 不足 min_interval 时顺延，避免每 60s tick 刷一次 muted
  if (!opts.test) {
    const last = db
      .select()
      .from(pushLogs)
      .where(and(eq(pushLogs.reminderId, r.id), eq(pushLogs.status, "sent")))
      .orderBy(desc(pushLogs.id))
      .limit(1)
      .get();
    if (last) {
      const gap = Date.now() - Date.parse(last.createdAt);
      if (gap >= 0 && gap < rule.minIntervalMinutes * 60000) {
        const resume = new Date(Date.parse(last.createdAt) + rule.minIntervalMinutes * 60000).toISOString();
        db.update(reminders).set({ nextRunAt: resume }).where(eq(reminders.id, r.id)).run();
        logPush(r.userId, r.id, "", "muted", `距上次发送不足 ${rule.minIntervalMinutes} 分钟`, body);
        return { sent: [], skipped: "throttled" };
      }
    }
  }

  // 3. 多渠道并行发送 + 逐渠道落流水
  const channels = (rule.channels || "wxpusher").split(",").map((s) => s.trim()).filter(Boolean);
  const results = await Promise.all(
    channels.map((ch) => sendChannel(r.userId, ch, title, body).then((res) => ({ ch, res })))
  );
  const sent: string[] = [];
  const failures: { channel: string; error: string }[] = [];
  for (const { ch, res } of results) {
    if (res.ok) {
      sent.push(ch);
      logPush(r.userId, r.id, ch, "sent", "", body);
    } else {
      failures.push({ channel: ch, error: res.error || "发送失败" });
      logPush(r.userId, r.id, ch, "failed", res.error || "", body);
    }
  }

  // 4. 主渠道全挂 → 兜底渠道
  if (failures.length > 0 && rule.fallbackChannel && !channels.includes(rule.fallbackChannel)) {
    const fb = await sendChannel(r.userId, rule.fallbackChannel, title, body);
    if (fb.ok) {
      sent.push(rule.fallbackChannel);
      logPush(r.userId, r.id, rule.fallbackChannel, "sent", "", body);
    } else {
      failures.push({ channel: rule.fallbackChannel, error: fb.error || "兜底发送失败" });
      logPush(r.userId, r.id, rule.fallbackChannel, "failed", fb.error || "", body);
    }
  }

  // 5. 结果落库：成功推进计划；全失败退避重试（30s/2m/10m），超限停用。
  //    测试推送跳过本步：只真发消息，不改动提醒的计划与状态
  if (opts.test) return { sent, failures: failures.length ? failures : undefined };

  if (sent.length > 0) {
    const next = computeNextRunAt(r, now);
    db.update(reminders)
      .set({ nextRunAt: next ?? r.nextRunAt, enabled: next ? 1 : 0, retryCount: 0 })
      .where(eq(reminders.id, r.id))
      .run();
    return { sent, failures: failures.length ? failures : undefined };
  }

  const BACKOFFS = [30, 120, 600];
  const retries = r.retryCount + 1;
  const backoff = BACKOFFS[Math.min(retries - 1, BACKOFFS.length - 1)];
  const exceed = retries >= rule.maxRetries;
  db.update(reminders)
    .set({
      nextRunAt: new Date(Date.now() + backoff * 1000).toISOString(),
      retryCount: retries,
      enabled: exceed ? 0 : 1,
    })
    .where(eq(reminders.id, r.id))
    .run();
  return { sent: [], skipped: "failed", failures };
}

/** 手动触发：语义等同调度器认领后 dispatch（跳过静默/节流），供「立即测试推送」 */
export async function dispatchNow(r: Reminder): Promise<DispatchResult> {
  return dispatch(r, { test: true });
}
