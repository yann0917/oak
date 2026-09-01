import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiProviders, aiSettings } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { AI_PROVIDER_KEYS } from "@/lib/ai/presets";

/** 保存模型配置（每用户每服务商一条，重复保存即覆盖）；若无当前生效模型则自动设为生效 */
export async function POST(req: NextRequest) {
  const { user, denied } = await requirePerm("ai-providers", "create", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json();
  const provider = typeof body.provider === "string" && AI_PROVIDER_KEYS.includes(body.provider) ? body.provider : "custom";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const apiMode =
    typeof body.apiMode === "string" && ["responses", "chat"].includes(body.apiMode) ? body.apiMode : "";
  if (!baseUrl || !model) {
    return NextResponse.json({ error: "接口地址与模型名称不能为空" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.userId, user.id), eq(aiProviders.provider, provider)))
    .get();
  const row = existing
    ? db
        .update(aiProviders)
        .set({ name, baseUrl, apiKey, model, apiMode, updatedAt: now })
        .where(eq(aiProviders.id, existing.id))
        .returning()
        .get()
    : db
        .insert(aiProviders)
        .values({ userId: user.id, provider, name, baseUrl, apiKey, model, apiMode, createdAt: now, updatedAt: now })
        .returning()
        .get();

  // 尚未设置当前生效模型时自动设为当前
  const s = db.select().from(aiSettings).where(eq(aiSettings.userId, user.id)).get();
  if (s?.activeProviderId == null) {
    if (s) {
      db.update(aiSettings).set({ activeProviderId: row.id, updatedAt: now }).where(eq(aiSettings.id, s.id)).run();
    } else {
      db.insert(aiSettings)
        .values({ userId: user.id, enabled: 0, searchApiKey: "", activeProviderId: row.id, updatedAt: now })
        .run();
    }
  }

  return NextResponse.json(row, { status: existing ? 200 : 201 });
}
