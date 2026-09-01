import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bills,
  certArchives,
  growthRecords,
  healthRecords,
  learningRecords,
  moments,
  quickNotes,
} from "@/db/schema";

export type InsightPeriod = "weekly" | "monthly";

/** 一条时间线摘要：快记/账单/健康/成长/学习/时光/卡证 混合排序的浓缩流水 */
export interface TimelineRow {
  date: string; // YYYY-MM-DD
  module: string;
  text: string;
}

/** 周/月复盘的自然周期起点（weekly=本周一，monthly=本月 1 日）：用于「本期是否已生成」判断与展示 */
export function windowStart(period: InsightPeriod, today: string): string {
  if (period === "monthly") return `${today.slice(0, 7)}-01`;
  const d = new Date(`${today}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // 周一 = 0
  return new Date(d.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
}

/** 数据聚合的滚动窗口起点：monthly=近 30 天，weekly=近 7 天（往前含当天共 N 天） */
export function dataWindowStart(period: InsightPeriod, today: string): string {
  const days = period === "monthly" ? 29 : 6;
  const d = new Date(`${today}T00:00:00Z`);
  return new Date(d.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

function truncate(s: string, max: number): string {
  const t = (s || "").trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function quickNoteLabel(n: any): string {
  try {
    const r = JSON.parse(n.result || "{}");
    return r.entries?.[0]?.label ?? r.label ?? "快记";
  } catch {
    return "快记";
  }
}

/**
 * 聚合窗口内各业务表记录为浓缩时间线，按日期正序（旧→新）最多 64 行。
 * 只取窗口内数据：date 列为空字符串的记录天然被排除（"" < "YYYY-MM-DD"）。
 */
export function aggregateTimeline(userId: number, startDate: string): TimelineRow[] {
  const rows: TimelineRow[] = [];

  for (const n of db
    .select()
    .from(quickNotes)
    .where(
      and(
        eq(quickNotes.userId, userId),
        gte(sql`substr(${quickNotes.createdAt}, 1, 10)`, startDate)
      )
    )
    .orderBy(desc(quickNotes.id))
    .limit(40)
    .all()) {
    rows.push({
      date: n.createdAt.slice(0, 10),
      module: quickNoteLabel(n),
      text: truncate(n.content, 60),
    });
  }
  for (const b of db
    .select()
    .from(bills)
    .where(and(eq(bills.userId, userId), gte(bills.date, startDate)))
    .orderBy(desc(bills.id))
    .limit(20)
    .all()) {
    rows.push({ date: b.date, module: "账单", text: `${b.title} ${b.amount}元 · ${b.type} · ${b.direction}` });
  }
  for (const h of db
    .select()
    .from(healthRecords)
    .where(and(eq(healthRecords.userId, userId), gte(healthRecords.date, startDate)))
    .orderBy(desc(healthRecords.id))
    .limit(10)
    .all()) {
    rows.push({ date: h.date, module: "健康档案", text: `${h.title}（${h.type}）${truncate(h.detail, 50)}` });
  }
  for (const g of db
    .select()
    .from(growthRecords)
    .where(and(eq(growthRecords.userId, userId), gte(growthRecords.date, startDate)))
    .orderBy(desc(growthRecords.id))
    .limit(10)
    .all()) {
    rows.push({ date: g.date, module: "成长记录", text: `身高 ${g.height ?? "—"}cm · 体重 ${g.weight ?? "—"}kg` });
  }
  for (const l of db
    .select()
    .from(learningRecords)
    .where(and(eq(learningRecords.userId, userId), gte(learningRecords.date, startDate)))
    .orderBy(desc(learningRecords.id))
    .limit(10)
    .all()) {
    rows.push({ date: l.date, module: "学习记录", text: `${l.subject || ""} ${l.grade || ""} ${truncate(l.content, 50)}`.trim() });
  }
  for (const m of db
    .select()
    .from(moments)
    .where(and(eq(moments.userId, userId), gte(moments.date, startDate)))
    .orderBy(desc(moments.id))
    .limit(10)
    .all()) {
    rows.push({ date: m.date, module: "时光相册", text: m.title });
  }
  for (const c of db
    .select()
    .from(certArchives)
    .where(
      and(
        eq(certArchives.userId, userId),
        gte(sql`substr(${certArchives.createdAt}, 1, 10)`, startDate)
      )
    )
    .orderBy(desc(certArchives.id))
    .limit(5)
    .all()) {
    rows.push({
      date: c.createdAt.slice(0, 10),
      module: "卡证档案",
      text: `${c.category}${c.expireDate ? `（${c.expireDate} 到期）` : ""} ${c.title}`.trim(),
    });
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date)).slice(-64);
}

/** 时间线转提示词中的文本块 */
export function timelineToText(rows: TimelineRow[]): string {
  return rows.map((r) => `[${r.date.slice(5)} ${r.module}] ${r.text}`).join("\n");
}
