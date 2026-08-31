import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { AI_PROVIDER_KEYS } from "@/lib/ai/presets";

/** 读取当前用户的大模型配置（未配置返回 null） */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:ai-settings:list");
  if (denied) return denied;
  const row = db.select().from(aiSettings).where(eq(aiSettings.userId, auth.user.id)).get();
  return NextResponse.json(row ?? null);
}

/** 保存当前用户的大模型配置（每用户一行，存在即覆盖） */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:ai-settings:create");
  if (denied) return denied;

  const body = await req.json();
  const provider = typeof body.provider === "string" && AI_PROVIDER_KEYS.includes(body.provider) ? body.provider : "custom";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!baseUrl || !model) return NextResponse.json({ error: "接口地址与模型名称不能为空" }, { status: 400 });
  const enabled = body.enabled ? 1 : 0;

  const now = new Date().toISOString();
  const existing = db.select().from(aiSettings).where(eq(aiSettings.userId, uid)).get();
  let row;
  if (existing) {
    row = db
      .update(aiSettings)
      .set({ provider, baseUrl, apiKey, model, enabled, updatedAt: now })
      .where(eq(aiSettings.id, existing.id))
      .returning()
      .get();
  } else {
    row = db
      .insert(aiSettings)
      .values({ userId: uid, provider, baseUrl, apiKey, model, enabled, updatedAt: now })
      .returning()
      .get();
  }
  return NextResponse.json(row, { status: existing ? 200 : 201 });
}
