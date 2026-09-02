import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiProviders, aiSettings } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { getRagStatus, syncRag } from "@/lib/rag/store";
import { EMBEDDING_DEFAULTS, EMBEDDING_SUPPORTED } from "@/lib/ai/presets";

/** 记忆检索（RAG）设置：GET 状态 / POST 保存 embedding 服务商配置并触发后台同步 */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:ai-settings:list");
  if (denied) return denied;

  return NextResponse.json(getRagStatus(auth.user.id));
}

export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:ai-settings:create");
  if (denied) return denied;

  const body = await req.json();
  const providerId = Number(body.embeddingProviderId) || null;
  const model = typeof body.embeddingModel === "string" ? body.embeddingModel.trim() : "";
  const rerankEnabled = body.rerankEnabled ? 1 : 0;
  const rerankModel = typeof body.rerankModel === "string" ? body.rerankModel.trim() : "";

  if (providerId == null) {
    // 清空配置：关闭 RAG
    const now = new Date().toISOString();
    const existing = db.select({ id: aiSettings.id }).from(aiSettings).where(eq(aiSettings.userId, uid)).get();
    if (existing) db.update(aiSettings).set({ embeddingProviderId: null, embeddingModel: "", rerankEnabled: 0, updatedAt: now }).where(eq(aiSettings.userId, uid)).run();
    else db.insert(aiSettings).values({ userId: uid, embeddingProviderId: null, embeddingModel: "", updatedAt: now }).run();
    return NextResponse.json({ ok: true, reset: true });
  }

  const p = db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.id, providerId), eq(aiProviders.userId, uid)))
    .get();
  if (!p) return NextResponse.json({ error: "embedding 服务商不存在" }, { status: 400 });
  if (!EMBEDDING_SUPPORTED[p.provider]) {
    return NextResponse.json({ error: `「${p.name || p.provider}」不支持 embeddings 接口，请选择 OpenAI / 通义 / 自定义` }, { status: 400 });
  }
  const finalModel = model || EMBEDDING_DEFAULTS[p.provider] || "";
  if (!finalModel) {
    return NextResponse.json({ error: "该服务商需手动填写 embedding 模型名" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const existing = db.select({ id: aiSettings.id }).from(aiSettings).where(eq(aiSettings.userId, uid)).get();
  if (existing) {
    db.update(aiSettings)
      .set({ embeddingProviderId: providerId, embeddingModel: model, rerankEnabled, rerankModel, updatedAt: now })
      .where(eq(aiSettings.userId, uid))
      .run();
  } else {
    db.insert(aiSettings).values({ userId: uid, embeddingProviderId: providerId, embeddingModel: model, rerankEnabled, rerankModel, updatedAt: now }).run();
  }

  // 后台重建索引（不阻塞响应）
  void syncRag(uid);
  return NextResponse.json({ ok: true, embeddingModel: finalModel });
}
