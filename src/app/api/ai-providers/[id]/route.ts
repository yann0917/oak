import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiProviders, aiSettings } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { AI_PROVIDER_KEYS } from "@/lib/ai/presets";

/** 更新模型配置 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requirePerm("ai-providers", "update", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "配置 id 无效" }, { status: 400 });
  }

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

  const row = db
    .update(aiProviders)
    .set({ provider, name, baseUrl, apiKey, model, apiMode, updatedAt: new Date().toISOString() })
    .where(and(eq(aiProviders.id, id), eq(aiProviders.userId, user.id)))
    .returning()
    .get();
  if (!row) return NextResponse.json({ error: "配置不存在" }, { status: 404 });

  return NextResponse.json(row);
}

/** 删除模型配置：若是当前生效项，自动切换到剩余的第一条（或置空） */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requirePerm("ai-providers", "delete", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "配置 id 无效" }, { status: 400 });
  }

  const row = db.delete(aiProviders).where(and(eq(aiProviders.id, id), eq(aiProviders.userId, user.id))).run();
  if (row.changes === 0) return NextResponse.json({ error: "配置不存在" }, { status: 404 });

  const s = db.select().from(aiSettings).where(eq(aiSettings.userId, user.id)).get();
  if (s?.activeProviderId === id) {
    const next = db
      .select({ id: aiProviders.id })
      .from(aiProviders)
      .where(eq(aiProviders.userId, user.id))
      .orderBy(aiProviders.id)
      .limit(1)
      .get();
    db.update(aiSettings)
      .set({ activeProviderId: next?.id ?? null, updatedAt: new Date().toISOString() })
      .where(eq(aiSettings.id, s.id))
      .run();
  }

  return NextResponse.json({ ok: true });
}
