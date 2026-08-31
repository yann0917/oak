import { db } from "@/db";
import { bills, certArchives, children, growthRecords, healthRecords, learningRecords, moments, policyNotes, reminderRules, reminders, todos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { computeNextRunAt, DEFAULT_TZ } from "@/lib/reminders/engine";
import { QUICK_TYPE_META, type QuickType } from "@/lib/quick/meta";
import { todayString, type QuickIntent } from "./classify";

/** 归类落库结果：前端展示归类标签并跳到目标模块 */
export interface DispatchTarget {
  module: QuickType;
  label: string;
  /** 目标页路径；未落库（other 或缺少成员/时间）为空 */
  path: string;
  targetId: number | null;
  /** 最终归属成员（仅 child-scoped 落库时有值） */
  childId: number | null;
}

/** 校验 childId 是否属于该用户；不合法/未提供时回退默认成员 */
function resolveChildId(intent: QuickIntent, userId: number, defaultChildId: number | null): number | null {
  const ids = new Set(
    db.select({ id: children.id }).from(children).where(eq(children.userId, userId)).all().map((c) => c.id)
  );
  if (intent.childId != null && ids.has(intent.childId)) return intent.childId;
  if (defaultChildId != null && ids.has(defaultChildId)) return defaultChildId;
  return null;
}

function excerpt(text: string, max = 20): string {
  return (text || "").trim().slice(0, max);
}

/**
 * 按 AI（或手动）给出的意图写入业务表。
 * 返回 targetId 为 null 表示未落库（仅保留原始流水）。
 */
export function dispatchQuickIntent(
  intent: QuickIntent,
  userId: number,
  content: string,
  defaultChildId: number | null,
  photos: string[] = []
): DispatchTarget {
  const meta = QUICK_TYPE_META[intent.type];
  if (intent.type === "other") return { module: "other", label: meta.label, path: "", targetId: null, childId: null };

  const date = intent.date || todayString();
  const childId = resolveChildId(intent, userId, defaultChildId);
  const photosJson = JSON.stringify(photos);
  if (meta.childScoped && !childId) {
    // 无法归属成员：不落业务表，保留原始流水（DIKW Data 层）
    return { module: intent.type, label: meta.label, path: "", targetId: null, childId: null };
  }

  const f = intent.fields;
  switch (intent.type) {
    case "health": {
      const row = db
        .insert(healthRecords)
        .values({
          userId,
          childId: childId!,
          type: f.healthType ?? "体检",
          date,
          title: intent.title || excerpt(f.detail) || "健康记录",
          detail: f.detail ?? "",
          attachments: photosJson,
        })
        .returning()
        .get();
      return { module: "health", label: meta.label, path: meta.path, targetId: row.id, childId };
    }
    case "fee": {
      const row = db
        .insert(bills)
        .values({
          userId,
          childId: childId!,
          title: intent.title || "账单",
          type: f.feeType ?? "其他",
          direction: f.direction ?? "支出",
          amount: Number(f.amount) || 0,
          date,
          organization: f.organization ?? "",
          status: f.status ?? "已缴",
          notes: intent.summary || "",
          attachments: photosJson,
        })
        .returning()
        .get();
      return { module: "fee", label: meta.label, path: meta.path, targetId: row.id, childId };
    }
    case "growth": {
      const row = db
        .insert(growthRecords)
        .values({
          userId,
          childId: childId!,
          date,
          height: f.height ?? null,
          weight: f.weight ?? null,
          notes: intent.summary || content,
        })
        .returning()
        .get();
      return { module: "growth", label: meta.label, path: meta.path, targetId: row.id, childId };
    }
    case "moment": {
      const row = db
        .insert(moments)
        .values({
          userId,
          childId: childId!,
          date,
          title: intent.title || "一条快记",
          // 不限制长度：完整原文入册，展示层超出省略、悬浮展开
          description: f.detail ?? content,
          photos: photosJson,
          tags: f.tags ?? "",
        })
        .returning()
        .get();
      return { module: "moment", label: meta.label, path: meta.path, targetId: row.id, childId };
    }
    case "learning": {
      const row = db
        .insert(learningRecords)
        .values({
          userId,
          childId: childId!,
          date,
          subject: f.subject ?? "",
          grade: f.grade ?? "",
          evaluation: f.evaluation ?? "",
          content: f.content ?? content,
        })
        .returning()
        .get();
      return { module: "learning", label: meta.label, path: meta.path, targetId: row.id, childId };
    }
    case "reminder": {
      const targetDate = f.targetDate ?? "";
      const advanceDays = /^\d+$/.test(String(f.advanceDays ?? "")) ? String(f.advanceDays) : "";
      let computedNext = "";
      try {
        const rem: any = {
          scheduleType: "once",
          targetDate,
          advanceDays,
          timeOfDay: "09:00",
          timezone: DEFAULT_TZ,
          nextRunAt: "",
          enabled: 1,
          retryCount: 0,
        };
        computedNext = computeNextRunAt(rem, new Date()) ?? "";
      } catch {
        computedNext = "";
      }
      // 目标日期缺失或已过期：仍落库并停用，用户可在提醒中心补日期后重新启用
      const expiredOrMissing = !computedNext;
      const nextRunAt = computedNext || new Date(Date.now() + 30 * 86_400_000).toISOString();
      const row = db
        .insert(reminders)
        .values({
          userId,
          childId: childId ?? null,
          title: intent.title || "快记提醒",
          content: intent.summary || content,
          attachments: photosJson,
          scheduleType: "once",
          targetDate,
          advanceDays,
          nextRunAt,
          timezone: DEFAULT_TZ,
          enabled: expiredOrMissing ? 0 : 1,
          retryCount: 0,
        })
        .returning()
        .get();
      db.insert(reminderRules).values({ reminderId: row.id }).run();
      return { module: "reminder", label: meta.label, path: meta.path, targetId: row.id, childId: childId ?? null };
    }
    case "todo": {
      const row = db.insert(todos).values({ userId, title: intent.title || excerpt(content, 50), done: 0 }).returning().get();
      return { module: "todo", label: meta.label, path: meta.path, targetId: row.id, childId: null };
    }
    case "cert": {
      // 证件可能是家庭共用（家长的证）：只在模型明确点名该成员时才归属，不回退默认成员
      const owned = intent.childId != null && resolveChildId(intent, userId, null) != null;
      const certChildId = owned ? intent.childId : null;
      const row = db
        .insert(certArchives)
        .values({
          userId,
          childId: certChildId,
          category: f.category ?? "证件",
          title: intent.title || "卡证档案",
          number: f.number ?? "",
          issuer: f.issuer ?? "",
          issueDate: f.issueDate ?? "",
          expireDate: f.expireDate ?? "",
          content: intent.ocrText || intent.summary || content,
          notes: "",
          attachments: photosJson,
        })
        .returning()
        .get();
      return { module: "cert", label: meta.label, path: meta.path, targetId: row.id, childId: certChildId };
    }
    case "policy": {
      const row = db
        .insert(policyNotes)
        .values({
          userId,
          title: intent.title || "政策动态",
          category: f.category ?? "其他",
          date,
          content: f.content ?? content,
          link: f.link ?? "",
          attachments: photosJson,
        })
        .returning()
        .get();
      return { module: "policy", label: meta.label, path: meta.path, targetId: row.id, childId: null };
    }
    default:
      return { module: "other", label: meta.label, path: "", targetId: null, childId: null };
  }
}

/** 手动归类：未配置 AI 时由用户指定类型，按类型建立最小默认记录 */
export function buildManualIntent(type: QuickType, content: string, childId: number | null, date: string): QuickIntent {
  return {
    type,
    childId,
    date,
    title: excerpt(content, 30),
    summary: "",
    ocrText: "",
    fields: {},
  };
}
