import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ragImageCaptions } from "@/db/schema";
import { certArchives, healthRecords, moments, quickNotes, reminders } from "@/db/schema";
import { chatJSON } from "@/lib/ai/client";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { photoPathToDataUrl } from "@/lib/ai/classify";

/**
 * 照片视觉描述（图片内容 RAG 兜底）：
 * 各模块附件图片（快记/时光/卡证/健康/提醒）经对话模型（视觉能力）生成一句话描述，
 * 缓存到 rag_image_captions，corpus 建索引时作为「照片描述」文档加入。
 * 用途：OCR 对家庭照/无文字图片无效，「孩子打疫苗那张照片」这类记忆靠语义描述检索。
 * 说明：不做多模态 embedding——百炼多模态 embedding 要求图片公网 URL（本地自托管 uploads 不满足），
 * 且本文场景是"文检索图片内容"，文字描述已足够。
 */

export interface ImageRef {
  path: string;
  childId: number | null;
  module: string; // 展示用来源模块名
  date: string;
}

function jsonPaths(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr
          .filter((p) => typeof p === "string")
          .map((p) => p.replace(/^\/+/, ""))
          .filter((p) => p.startsWith("uploads/"))
      : [];
  } catch {
    return [];
  }
}

/** 收集该用户所有「待描述」图片路径（只读，不生成）；同一张图被多表引用时只取首次出现的归属 */
export function collectImagePaths(userId: number): ImageRef[] {
  const out: ImageRef[] = [];
  const seen = new Set<string>();
  const push = (paths: string[], childId: number | null, module: string, date: string) => {
    for (const p of paths) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push({ path: p, childId, module, date });
    }
  };
  for (const r of db
    .select({ id: quickNotes.id, childId: quickNotes.childId, photos: quickNotes.photos, createdAt: quickNotes.createdAt })
    .from(quickNotes)
    .where(eq(quickNotes.userId, userId))
    .all()) {
    push(jsonPaths(r.photos), r.childId, "快记", (r.createdAt || "").slice(0, 10));
  }
  for (const r of db
    .select({ id: moments.id, childId: moments.childId, photos: moments.photos, date: moments.date })
    .from(moments)
    .where(eq(moments.userId, userId))
    .all()) {
    push(jsonPaths(r.photos), r.childId, "时光相册", r.date);
  }
  for (const r of db
    .select({ id: certArchives.id, childId: certArchives.childId, attachments: certArchives.attachments, issueDate: certArchives.issueDate })
    .from(certArchives)
    .where(eq(certArchives.userId, userId))
    .all()) {
    push(jsonPaths(r.attachments), r.childId, "卡证档案", r.issueDate);
  }
  for (const r of db
    .select({ id: healthRecords.id, childId: healthRecords.childId, attachments: healthRecords.attachments, date: healthRecords.date })
    .from(healthRecords)
    .where(eq(healthRecords.userId, userId))
    .all()) {
    push(jsonPaths(r.attachments), r.childId, "健康档案", r.date);
  }
  for (const r of db
    .select({ id: reminders.id, childId: reminders.childId, attachments: reminders.attachments, targetDate: reminders.targetDate })
    .from(reminders)
    .where(eq(reminders.userId, userId))
    .all()) {
    push(jsonPaths(r.attachments), r.childId, "提醒", r.targetDate);
  }
  return out;
}

const CAPTION_SYSTEM = `你是家庭照片描述助手。根据用户提供的图片，输出一项 caption：
- 图片包含文字（发票、证件、单据、报告、通知等）：提取并保留图片中的关键文字内容——编号/证号、金额、日期、单位名称、姓名、事项等，按原文顺序组织，尽量完整。
- 图片没有文字（生活照、风景等）：用一句中文描述（50 字以内）：人物、场景、物品、事件。
只描述事实，不评论、不加价值判断。输出严格 JSON：{"caption": "..."}`;

/** 对尚未生成描述的图片调用视觉模型（复用当前对话模型；DeepSeek 非视觉型号自动切视觉），失败的单个跳过不阻塞 */
export async function ensureImageCaptions(userId: number): Promise<void> {
  const cfg = getAiRuntimeConfig(userId);
  if (!cfg.enabled || !cfg.provider?.baseUrl || !cfg.provider.model) return;
  const model =
    cfg.provider.provider === "deepseek" && !cfg.provider.model.includes("vision")
      ? "deepseek-v4-flash-vision-exp"
      : cfg.provider.model;
  const aiCfg = {
    baseUrl: cfg.provider.baseUrl,
    apiKey: cfg.provider.apiKey,
    model,
    provider: cfg.provider.provider,
  };

  const images = collectImagePaths(userId);
  for (const img of images) {
    const row = db
      .select({ caption: ragImageCaptions.caption, status: ragImageCaptions.status })
      .from(ragImageCaptions)
      .where(eq(ragImageCaptions.path, img.path))
      .get();
    if (row?.status === "done") continue;
    try {
      const raw = await chatJSON<any>(aiCfg, {
        messages: [
          { role: "system", content: CAPTION_SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: `来源：${img.module}${img.date ? `（${img.date}）` : ""}` },
              { type: "image_url", image_url: { url: photoPathToDataUrl(img.path) } },
            ],
          },
        ],
        temperature: 0.1,
        maxTokens: 4096,
      });
      const caption = String(raw?.caption ?? "").trim().slice(0, 800);
      const now = new Date().toISOString();
      if (caption) {
        db.insert(ragImageCaptions)
          .values({ userId, path: img.path, caption, status: "done", createdAt: now, updatedAt: now })
          .onConflictDoUpdate({ target: [ragImageCaptions.userId, ragImageCaptions.path], set: { caption, status: "done", error: "", updatedAt: now } })
          .run();
      } else {
        db.insert(ragImageCaptions)
          .values({ userId, path: img.path, status: "failed", error: "模型未返回描述", createdAt: now, updatedAt: now })
          .onConflictDoUpdate({ target: [ragImageCaptions.userId, ragImageCaptions.path], set: { status: "failed", error: "模型未返回描述", updatedAt: now } })
          .run();
      }
    } catch (err) {
      const now = new Date().toISOString();
      const error = err instanceof Error ? err.message : String(err);
      db.insert(ragImageCaptions)
        .values({ userId, path: img.path, status: "failed", error, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: [ragImageCaptions.userId, ragImageCaptions.path], set: { status: "failed", error, updatedAt: now } })
        .run();
      // 单张失败不阻塞整轮索引
      console.error(`[rag] 照片描述失败 ${img.path}:`, error);
    }
  }
}

/** 读取已生成的描述（corpus 建索引用） */
export function getCaption(userId: number, path: string): string {
  const row = db
    .select({ caption: ragImageCaptions.caption })
    .from(ragImageCaptions)
    .where(eq(ragImageCaptions.path, path))
    .get();
  return row?.caption ?? "";
}
