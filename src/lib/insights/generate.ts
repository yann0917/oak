import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { familyInsights } from "@/db/schema";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { chatJSON, type AiConfigInput } from "@/lib/ai/client";
import { todayString } from "@/lib/ai/classify";
import { aggregateTimeline, dataWindowStart, timelineToText, windowStart, type InsightPeriod } from "./aggregate";

export interface FamilyKnowledge {
  type: string;
  insight: string;
  actionSop: string;
}

const PERIOD_LABEL: Record<InsightPeriod, string> = { weekly: "最近 7 天（本周）", monthly: "最近一个月（本月）" };

/**
 * 提炼提示词：不做类别枚举限制，只约束输出 JSON 结构与真实性。
 * 数据进 prompt 前经聚合压缩（单条原文截断、总数 64 行内）。
 */
function buildPrompt(period: InsightPeriod, timeline: string): string {
  return `你是一位资深的家庭管理顾问。请分析这个家庭${PERIOD_LABEL[period]}的日常记录（快记流水、账单、健康、成长、学习、时光、卡证等），
找出数据之间隐藏的【因果关系】、【反复出现的模式】或【值得注意的趋势】，提炼成 2-4 条能长期指导未来行动的家庭经验（Knowledge）。这是家庭的宝贵资产，宁精勿滥。

【输入数据】（按时间排序）
${timeline}

【输出】纯 JSON 数组，不要任何 markdown 标记或解释文字：
[
  {
    "type": "这条经验的主题，2-6 个字，不做类别限制（如：季节开销、入学准备、免疫力、时间管理、证件维护…… 由你依据数据提炼）",
    "insight": "观察结论：结合具体数据说明 谁/什么/何时/为什么，50-120 字",
    "action_sop": "可执行的行动建议：何时做、做什么、怎么做，50-100 字"
  }
]

要求：
1. 只能依据给定数据，禁止编造数据中不存在的事实；依据不足时宁少勿滥（最少 1 条）。
2. 每条 insight 必须能对应到输入数据中的具体记录。
3. 类型自由提炼，不要套固定模板。
4. 每条必须同时包含 type、insight、action_sop 三个字段，三者缺一不可，都不能为空字符串。`;
}

/** 模型输出归一化：兼容 数组 / {insights:[...]} / {data:[...]} / 单对象 等形态，字段限长、去除空条目 */
function normalizeInsights(raw: any): FamilyKnowledge[] {
  let list: any[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (Array.isArray(raw?.insights)) list = raw.insights;
  else if (Array.isArray(raw?.data)) list = raw.data;
  else if (raw && typeof raw === "object") list = [raw];
  const out: FamilyKnowledge[] = [];
  for (const item of list.slice(0, 5)) {
    const type = String(item?.type ?? "").trim().slice(0, 20);
    const insight = String(item?.insight ?? "").trim().slice(0, 500);
    // 模型偶发省略 action_sop：以 insight 兜底，保证有可执行的行动建议
    const actionSop = (String(item?.actionSop ?? "").trim() || insight).slice(0, 500);
    if (!insight) continue;
    out.push({ type: type || "家庭经验", insight, actionSop });
  }
  return out;
}

/**
 * 执行一期周/月复盘：聚合时间线 → AI 提炼 → 落库。
 * 过程状态写入 family_insights（generating → done/failed），失败不抛错，由调用方按 status 展示。
 * 重入保护：同用户存在 generating 状态时直接返回该行，避免并发重复生成。
 */
export async function generateInsight(userId: number, period: InsightPeriod) {
  const runtime = getAiRuntimeConfig(userId);
  if (!runtime.enabled || !runtime.provider?.baseUrl || !runtime.provider.model) {
    throw new Error("未配置 AI 助手，请先在「设置 → AI 助手」中启用大模型");
  }
  const ai = runtime.provider;
  const inFlight = db
    .select()
    .from(familyInsights)
    .where(and(eq(familyInsights.userId, userId), eq(familyInsights.status, "generating")))
    .get();
  if (inFlight) return inFlight;

  const today = todayString();
  // 数据窗口取滚动近 30/7 天（月初/周初不至于没数据）；startDate 落库展示用
  const start = dataWindowStart(period, today);
  const row = db
    .insert(familyInsights)
    .values({ userId, period, startDate: start, endDate: today, status: "generating" })
    .returning()
    .get();

  try {
    const timelineRows = aggregateTimeline(userId, start);
    if (!timelineRows.length) throw new Error("这段时间还没有可分析的记录");
    const cfg: AiConfigInput = { baseUrl: ai.baseUrl, apiKey: ai.apiKey, model: ai.model, provider: ai.provider };
    const messages = [
      { role: "system" as const, content: buildPrompt(period, timelineToText(timelineRows)) },
      { role: "user" as const, content: "请根据以上记录输出家庭经验（Knowledge）JSON 数组。" },
    ];
    // 模型偶发输出非预期形态：最多尝试两次，错误信息附带模型输出摘要便于排查
    let insights: FamilyKnowledge[] = [];
    let lastError = "";
    for (let attempt = 0; attempt < 2 && !insights.length; attempt++) {
      try {
        const raw = await chatJSON<any>(cfg, {
          messages,
          temperature: 0.4,
          maxTokens: 4096,
          timeoutMs: 90_000,
        });
        insights = normalizeInsights(raw);
        if (!insights.length) lastError = `模型输出异常：${JSON.stringify(raw).slice(0, 120)}`;
      } catch (e: any) {
        lastError = e?.message ?? "AI 调用失败";
      }
    }
    if (!insights.length) throw new Error(lastError || "模型未提炼出有效洞察，请重试");
    const updated = db
      .update(familyInsights)
      .set({ status: "done", insights: JSON.stringify(insights), error: "" })
      .where(eq(familyInsights.id, row.id))
      .returning()
      .get();
    return updated;
  } catch (e: any) {
    return db
      .update(familyInsights)
      .set({ status: "failed", error: e?.message ?? "复盘失败" })
      .where(eq(familyInsights.id, row.id))
      .returning()
      .get();
  }
}

/** 该用户本自然周期（本周一/本月1日以来）是否已生成过 done 的复盘 */
export function hasDoneInsight(userId: number, period: InsightPeriod, today: string): boolean {
  const periodStart = `${windowStart(period, today)}T00:00:00Z`;
  return !!db
    .select()
    .from(familyInsights)
    .where(
      and(
        eq(familyInsights.userId, userId),
        eq(familyInsights.period, period),
        eq(familyInsights.status, "done"),
        gte(familyInsights.createdAt, periodStart)
      )
    )
    .get();
}
