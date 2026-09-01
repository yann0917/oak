import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiProviders, aiSettings } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

/** 读取 AI 设置：全局项（启用/搜索 key/当前模型 id）+ 模型配置列表 */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:ai-settings:list");
  if (denied) return denied;

  const s = db.select().from(aiSettings).where(eq(aiSettings.userId, auth.user.id)).get();
  const providers = db
    .select({
      id: aiProviders.id,
      provider: aiProviders.provider,
      name: aiProviders.name,
      baseUrl: aiProviders.baseUrl,
      apiKey: aiProviders.apiKey,
      model: aiProviders.model,
      apiMode: aiProviders.apiMode,
      updatedAt: aiProviders.updatedAt,
    })
    .from(aiProviders)
    .where(eq(aiProviders.userId, auth.user.id))
    .orderBy(desc(aiProviders.id))
    .all();

  return NextResponse.json({
    enabled: !!s?.enabled,
    searchApiKey: s?.searchApiKey || "",
    activeProviderId: s?.activeProviderId ?? null,
    providers,
  });
}

/** 保存全局设置：启用开关 + AnySearch key + 当前生效模型 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:ai-settings:create");
  if (denied) return denied;

  const body = await req.json();
  const enabled = body.enabled ? 1 : 0;
  const searchApiKey = typeof body.searchApiKey === "string" ? body.searchApiKey.trim() : "";
  let activeProviderId = Number(body.activeProviderId) || null;
  if (activeProviderId != null) {
    const owned = db
      .select({ id: aiProviders.id })
      .from(aiProviders)
      .where(eq(aiProviders.id, activeProviderId))
      .get();
    if (!owned) {
      return NextResponse.json({ error: "当前模型不存在" }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const existing = db.select().from(aiSettings).where(eq(aiSettings.userId, uid)).get();
  if (existing) {
    db.update(aiSettings)
      .set({ enabled, searchApiKey, activeProviderId, updatedAt: now })
      .where(eq(aiSettings.userId, uid))
      .run();
  } else {
    db.insert(aiSettings).values({ userId: uid, enabled, searchApiKey, activeProviderId, updatedAt: now }).run();
  }
  return NextResponse.json({ ok: true });
}
