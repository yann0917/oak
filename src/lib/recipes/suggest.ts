import { sql } from "drizzle-orm";
import { db } from "@/db";
import { recipes } from "@/db/schema";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { chatJSON, type AiConfigInput } from "@/lib/ai/client";

/**
 * 「今天吃什么」：从食谱库随机抽 14 道候选，交给 AI 按 当前餐段 搭配 2-3 道并给理由。
 * AI 未配置/调用失败时降级为纯随机推荐（aiUsed=false），功能始终可用。
 */

export interface SuggestPick {
  id: number;
  name: string;
  category: string;
  image: string;
  reason: string;
}

export interface SuggestResult {
  picks: SuggestPick[];
  aiUsed: boolean;
  note?: string;
}

const CANDIDATES = 14; // 候选数量：给模型足够挑选空间又不撑爆 prompt

function mealLabel(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return "早餐";
  if (h >= 10 && h < 14) return "午餐";
  if (h >= 14 && h < 20) return "晚餐";
  return "夜宵";
}

export async function suggestMeals(userId: number): Promise<SuggestResult> {
  const candidates = db
    .select({ id: recipes.id, category: recipes.category, name: recipes.name, image: recipes.image })
    .from(recipes)
    .orderBy(sql`RANDOM()`)
    .limit(CANDIDATES)
    .all();
  if (!candidates.length) return { picks: [], aiUsed: false, note: "食谱库还是空的，请先同步菜谱" };

  try {
    const runtime = getAiRuntimeConfig(userId);
    if (!runtime.enabled || !runtime.provider?.baseUrl || !runtime.provider.model) {
      throw new Error("未配置 AI 助手");
    }
    const ai = runtime.provider;
    const cfg: AiConfigInput = { baseUrl: ai.baseUrl, apiKey: ai.apiKey, model: ai.model, provider: ai.provider };
    const menu = candidates.map((c) => `${c.id}. [${c.category}] ${c.name}`).join("\n");
    const raw = await chatJSON<any>(cfg, {
      messages: [
        {
          role: "system",
          content: `你是一位接地气的家庭菜单参谋。现在是${mealLabel()}时间点，请从候选菜谱中挑 2-3 道组成这一餐：考虑荤素/口味搭配，主食或汤有则优先带上；候选是随机抽的，只准从里面选，不要虚构别的菜。
只输出纯 JSON，不要 markdown 标记：
{"picks":[{"id":候选里的数字id,"reason":"推荐理由，口语化，20-40 字"}]}`,
        },
        { role: "user", content: `候选菜谱：\n${menu}` },
      ],
      temperature: 1,
      maxTokens: 1024,
      timeoutMs: 90_000,
    });

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const picks: SuggestPick[] = [];
    for (const p of (Array.isArray(raw?.picks) ? raw.picks : []).slice(0, 4)) {
      const c = byId.get(Number(p?.id));
      if (!c || picks.some((x) => x.id === c.id)) continue;
      picks.push({ id: c.id, name: c.name, category: c.category, image: c.image, reason: String(p?.reason ?? "").trim().slice(0, 80) });
    }
    if (!picks.length) throw new Error(`模型未返回有效推荐：${JSON.stringify(raw).slice(0, 120)}`);
    return { picks, aiUsed: true };
  } catch (e: any) {
    // 降级：不用 AI，直接随机 2-3 道（保证小工具永远有结果）
    const count = 2 + Math.floor(Math.random() * 2);
    const picks = candidates.slice(0, count).map((c) => ({ ...c, reason: "" }));
    return { picks, aiUsed: false, note: `AI 推荐暂不可用（${String(e?.message ?? e).slice(0, 80)}），这次是随机搭配` };
  }
}
