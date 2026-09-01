/**
 * 待办重复规则：daily|weekly|monthly|yearly|Nd（每 N 天）。
 * 纯日期字符串运算（UTC 天），与提醒中心的时区模型不耦合。
 */
export type RepeatKind = "daily" | "weekly" | "monthly" | "yearly";

export interface RepeatRule {
  kind: RepeatKind;
  everyN?: number;
}

export function parseRepeatRule(rule: string): RepeatRule | null {
  if (!rule) return null;
  if (rule === "daily") return { kind: "daily" };
  if (rule === "weekly") return { kind: "weekly" };
  if (rule === "monthly") return { kind: "monthly" };
  if (rule === "yearly") return { kind: "yearly" };
  const m = rule.match(/^(\d+)d$/);
  if (m) return { kind: "daily", everyN: Number(m[1]) };
  return null;
}

/** 从基准日期推算下一次触发日期（完成后生成下一实例） */
export function nextDate(base: string, rule: string): string {
  const r = parseRepeatRule(rule);
  if (!r || !base) return "";
  const d = new Date(`${base}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  switch (r.kind) {
    case "daily":
      d.setUTCDate(d.getUTCDate() + (r.everyN ?? 1));
      break;
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "yearly":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
  }
  return d.toISOString().slice(0, 10);
}

/** 提醒时间平移一个周期（保留时分，日期平移） */
export function nextRemindAt(remindAt: string, rule: string): string {
  if (!remindAt || !rule) return "";
  const datePart = remindAt.slice(0, 10);
  const timePart = remindAt.slice(11) || "";
  const nd = nextDate(datePart, rule);
  return nd && timePart ? `${nd}T${timePart}` : "";
}
