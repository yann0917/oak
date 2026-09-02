import { embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiProviders, aiSettings } from "@/db/schema";
import { EMBEDDING_DEFAULTS, EMBEDDING_SUPPORTED } from "@/lib/ai/presets";

/**
 * RAG 记忆检索的云端 embedding 客户端。
 * 复用 ai_providers 行（baseUrl + apiKey），模型取 ai_settings.embedding_model || 服务商预设默认。
 * deepseek/moonshot 无 embeddings 接口：被选为 embedding 服务商时返回不支持原因，调用方降级为关闭 RAG。
 */

export type EmbeddingSetup =
  | { ok: true; providerKey: string; baseUrl: string; apiKey: string; model: string }
  | { ok: false; message: string };

/** 读取用户的 embedding 配置并校验可用性（不发起网络调用） */
export function getEmbeddingSetup(userId: number): EmbeddingSetup {
  const s = db.select().from(aiSettings).where(eq(aiSettings.userId, userId)).get();
  if (!s || !s.embeddingProviderId) {
    return { ok: false, message: "未配置 embedding 服务商（请在「设置 → AI 大模型」中选择）" };
  }
  const p = db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.id, s.embeddingProviderId), eq(aiProviders.userId, userId)))
    .get();
  if (!p) return { ok: false, message: "embedding 服务商配置不存在，请重新选择" };
  if (!EMBEDDING_SUPPORTED[p.provider]) {
    return { ok: false, message: `「${p.name || p.provider}」不支持 embeddings 接口，请选择 OpenAI / 通义 / 自定义等支持的服务商` };
  }
  if (!p.baseUrl.trim() || !p.apiKey.trim()) {
    return { ok: false, message: "embedding 服务商缺少接口地址或 API Key" };
  }
  const model = (s.embeddingModel || EMBEDDING_DEFAULTS[p.provider] || "").trim();
  if (!model) {
    return { ok: false, message: "该服务商需手动填写 embedding 模型名" };
  }
  return { ok: true, providerKey: p.provider, baseUrl: p.baseUrl, apiKey: p.apiKey, model };
}

// 百炼 text-embedding-v4 单次请求最多 10 条文本，OpenAI 无此限制（10 条对其无副作用）
const BATCH = 10;

/** 归一化向量（余弦相似度 = 点积） */
function normalize(vec: number[]): number[] {
  const n = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return n > 0 ? vec.map((v) => v / n) : vec;
}

/**
 * 批量嵌入并归一化。按 BATCH 分批；单批失败自动折半降批重试（服务商单批条数限制不一），
 * 折到单条仍失败则抛出。返回与入参顺序一致的向量数组。
 */
export async function embedTexts(setup: Extract<EmbeddingSetup, { ok: true }>, texts: string[]): Promise<number[][]> {
  const provider = createOpenAI({ baseURL: setup.baseUrl.replace(/\/+$/, ""), apiKey: setup.apiKey });
  const model = provider.textEmbeddingModel(setup.model);
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    let embeddings: number[][] | null = null;
    let size = BATCH;
    let lastError: unknown = null;
    while (embeddings == null) {
      try {
        const res = await embedMany({ model, values: batch });
        embeddings = res.embeddings ?? [];
      } catch (err) {
        lastError = err;
        if (size <= 1) break;
        size = Math.max(1, Math.floor(size / 2));
      }
    }
    if (embeddings == null) {
      throw new Error(`embedding 请求失败：${lastError instanceof Error ? lastError.message : String(lastError)}`);
    }
    if (embeddings.length !== batch.length) {
      throw new Error(`embedding 返回条数不符：期望 ${batch.length}，实得 ${embeddings.length}`);
    }
    out.push(...embeddings.map(normalize));
  }
  return out;
}
