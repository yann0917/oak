import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiProviders, aiSettings } from "@/db/schema";

/** 当前生效的模型配置（ai_providers 行） */
export interface ActiveProvider {
  id: number;
  provider: string; // 预设 key：deepseek|openai|moonshot|qwen|custom
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiMode: string; // '' = 按预设 | responses | chat
}

/** AI 全局设置 + 当前模型（快记归类/家庭洞察/悬浮助手共用） */
export interface AiRuntimeConfig {
  enabled: boolean;
  searchApiKey: string;
  provider: ActiveProvider | null;
}

/** 读取每用户的 AI 运行时配置：全局设置 + 当前生效模型（不存在返回未启用） */
export function getAiRuntimeConfig(userId: number): AiRuntimeConfig {
  const s = db.select().from(aiSettings).where(eq(aiSettings.userId, userId)).get();
  if (!s) return { enabled: false, searchApiKey: "", provider: null };
  const provider = s.activeProviderId
    ? db
        .select()
        .from(aiProviders)
        .where(and(eq(aiProviders.id, s.activeProviderId), eq(aiProviders.userId, userId)))
        .get()
    : null;
  return {
    enabled: !!s.enabled,
    searchApiKey: s.searchApiKey || "",
    provider: provider ?? null,
  };
}
