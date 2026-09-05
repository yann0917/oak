import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { chatCompletion } from "@/lib/ai/client";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { getEmbeddingSetup, embedTexts } from "@/lib/rag/embeddings";
import { anysearchSearch } from "@/lib/ai-agent/anysearch";
import { sendChannel } from "@/lib/reminders/channels";
import { CHANNEL_TYPES } from "@/lib/reminders/meta";
import { RERANK_DEFAULT_MODEL } from "@/lib/ai/presets";

/** 系统诊断 · 真实探针：点击才运行（避免页面加载即烧 token/流量） */

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; detail: string; data?: T }> {
  const start = Date.now();
  try {
    const data = await fn();
    return { ok: true, ms: Date.now() - start, detail: "正常", data };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - start, detail: e?.message ?? String(e) };
  }
}

export async function POST(req: NextRequest) {
  const { user, denied } = await requirePerm("diagnostics", "probe-post", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const uid = user.id;
  const body = await req.json().catch(() => ({}));
  const target = typeof body.target === "string" ? body.target : "";

  let result: { ok: boolean; ms: number; detail: string };

  if (target === "db") {
    result = await timed(async () => {
      const check = db.$client.prepare("PRAGMA quick_check").get() as Record<string, string>;
      if (!Object.values(check).every((v) => v === "ok")) throw new Error(`quick_check 异常：${JSON.stringify(check)}`);
    });
  } else if (target === "uploads") {
    result = await timed(async () => {
      const dir = path.join(process.cwd(), "uploads");
      fs.accessSync(dir, fs.constants.W_OK);
      const tmp = path.join(dir, `.diag_${Date.now()}.tmp`);
      fs.writeFileSync(tmp, "ok");
      fs.unlinkSync(tmp);
    });
  } else if (target === "ai") {
    const cfg = getAiRuntimeConfig(uid);
    const provider = cfg.provider;
    if (!cfg.enabled || !provider) {
      result = { ok: false, ms: 0, detail: "未配置或未启用 AI 主模型（设置 → AI 大模型）" };
    } else {
      result = await timed(async () => {
        const reply = await chatCompletion(
          {
            provider: provider.provider,
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            model: provider.model,
          },
          {
            messages: [
              { role: "system", content: "你是连通性测试助手，必须只回复两个字：正常" },
              { role: "user", content: "你好" },
            ],
            temperature: 0,
            maxTokens: 4096,
            timeoutMs: 15_000,
          }
        );
        if (!reply.includes("正常")) throw new Error(`回复异常：${reply.slice(0, 30)}`);
      });
    }
  } else if (target === "embedding") {
    const setup = getEmbeddingSetup(uid);
    if (!setup.ok) {
      result = { ok: false, ms: 0, detail: setup.message };
    } else {
      result = await timed(async () => {
        const vectors = await embedTexts(setup, ["诊断测试"]);
        if (!vectors.length) throw new Error("返回为空");
      });
    }
  } else if (target === "rerank") {
    // 与 RAG 检索一致：复用 embedding 服务商 + /reranks 端点
    const s = db
      .select({ rerankEnabled: aiSettings.rerankEnabled, rerankModel: aiSettings.rerankModel })
      .from(aiSettings)
      .where(eq(aiSettings.userId, uid))
      .get();
    const setup = getEmbeddingSetup(uid);
    if (!s?.rerankEnabled) result = { ok: false, ms: 0, detail: "未启用（设置 → 记忆检索 → 重排开关）" };
    else if (!setup.ok) result = { ok: false, ms: 0, detail: setup.message };
    else {
      const model = (s.rerankModel || RERANK_DEFAULT_MODEL).trim();
      const url = setup.baseUrl.replace(/\/+$/, "") + "/reranks";
      result = await timed(async () => {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${setup.apiKey}` },
          body: JSON.stringify({ model, query: "诊断测试", documents: ["测试文档"], top_n: 1 }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`rerank HTTP ${res.status}`);
      });
    }
  } else if (target === "search") {
    const cfg = getAiRuntimeConfig(uid);
    if (!cfg.searchApiKey) {
      result = { ok: false, ms: 0, detail: "未配置 AnySearch key（设置 → AI 大模型 → 联网搜索）" };
    } else {
      result = await timed(async () => {
        const { results } = await anysearchSearch(cfg.searchApiKey, "测试", { maxResults: 1 });
        if (!results.length) throw new Error("搜索无结果（key 可能无效或额度用尽）");
      });
    }
  } else if (target.startsWith("push:")) {
    const type = target.slice("push:".length);
    if (!CHANNEL_TYPES.includes(type as any)) {
      result = { ok: false, ms: 0, detail: `未知渠道 ${type}` };
    } else {
      result = await timed(async () => {
        const res = await sendChannel(uid, type as any, "Oak 系统诊断", "这是一条诊断测试消息，收到即配置正常。");
        if (!res.ok) throw new Error(res.error || "发送失败");
      });
    }
  } else {
    result = { ok: false, ms: 0, detail: `未知探测目标：${target || "(空)"}` };
  }

  return NextResponse.json({ ok: result.ok, ms: result.ms, detail: result.detail, target, at: new Date().toISOString() });
}
