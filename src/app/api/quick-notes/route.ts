import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { children, quickNotes } from "@/db/schema";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { authorize, requireUser } from "@/lib/auth";
import { buildChildBriefs, classifyQuickNote, todayString } from "@/lib/ai/classify";
import { dispatchQuickIntent } from "@/lib/ai/dispatch";

function parseResult(row: any) {
  let result: any = {};
  try {
    result = JSON.parse(row.result || "{}");
  } catch {
    result = {};
  }
  let photos: string[] = [];
  try {
    photos = JSON.parse(row.photos || "[]");
  } catch {
    photos = [];
  }
  return { ...row, result, photos };
}

/** 首页最近的记录（20 条内，新→旧） */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:quick-notes:list");
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? 20) || 20), 100);
  const rows = db
    .select()
    .from(quickNotes)
    .where(eq(quickNotes.userId, auth.user.id))
    .orderBy(desc(quickNotes.id))
    .limit(limit)
    .all();
  return NextResponse.json(rows.map(parseResult));
}

/**
 * 一句话快记：先落原始流水（Data 层，AI 失败也不丢），
 * AI 已启用时自动归类并写入对应业务表（Information 层）。
 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:quick-notes:create");
  if (denied) return denied;

  const body = await req.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "内容不能为空" }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: "内容过长（最多 2000 字）" }, { status: 400 });
  const photos = Array.isArray(body.photos)
    ? body.photos.filter((p: any) => typeof p === "string" && p.startsWith("/uploads/") && p.length < 300).slice(0, 3)
    : [];

  // 默认成员：前端传的当前成员（校验归属）；未传且只有一个成员时自动取该成员
  const userChildren = db.select().from(children).where(eq(children.userId, uid)).all();
  const requested = body.childId != null ? Number(body.childId) : null;
  const defaultChildId =
    requested && userChildren.some((c) => c.id === requested)
      ? requested
      : userChildren.length === 1
        ? userChildren[0].id
        : null;

  const note = db
    .insert(quickNotes)
    .values({ userId: uid, childId: defaultChildId, content, photos: JSON.stringify(photos), status: "pending", result: "{}" })
    .returning()
    .get();

  const runtime = getAiRuntimeConfig(uid); // 全局设置 + 当前生效模型（多模型列表中的 active）
  if (!runtime.enabled || !runtime.provider?.baseUrl || !runtime.provider.model) {
    return NextResponse.json(parseResult(note), { status: 201 });
  }
  const ai = runtime.provider;

  try {
    // DeepSeek 视觉为实验模型：带图时自动切换（用户已显式配置视觉模型则不覆盖）
    const model =
      photos.length > 0 && ai.provider === "deepseek" && !ai.model.includes("vision")
        ? "deepseek-v4-flash-vision-exp"
        : ai.model;
    const classified = await classifyQuickNote(
      { baseUrl: ai.baseUrl, apiKey: ai.apiKey, model, provider: ai.provider },
      {
        content,
        today: todayString(),
        children: buildChildBriefs(userChildren),
        defaultChildId,
        photos,
      }
    );

    // 多实体分流：一条输入可能拆出多条记录（如 疫苗 + 花费）
    const entries: any[] = [];
    const summaries: string[] = [];
    for (const intent of classified.intents) {
      const target = dispatchQuickIntent(intent, uid, content, defaultChildId, photos);
      entries.push({
        module: target.module,
        label: target.label,
        path: target.path,
        targetId: target.targetId,
        childId: target.childId,
      });
      if (intent.summary) summaries.push(intent.summary);
    }
    const landed = entries.filter((e) => e.targetId != null).length;
    const summary =
      summaries.join("；") ||
      (landed
        ? `已记入${[...new Set(entries.filter((e) => e.targetId != null).map((e) => e.label))].join("、")}`
        : "未匹配到归档模块，已保存为原始记录");

    const updated = db
      .update(quickNotes)
      .set({
        status: "processed",
        aiType: entries[0]?.module ?? "other",
        childId: entries[0]?.childId ?? defaultChildId,
        result: JSON.stringify({
          summary,
          ocrText: classified.ocrText,
          entries,
          error: "",
        }),
        processedAt: new Date().toISOString(),
      })
      .where(eq(quickNotes.id, note.id))
      .returning()
      .get();
    return NextResponse.json(parseResult(updated), { status: 201 });
  } catch (e: any) {
    const updated = db
      .update(quickNotes)
      .set({
        status: "failed",
        result: JSON.stringify({ summary: "", module: "other", label: "原始记录", path: "", targetId: null, error: e?.message ?? "AI 归类失败" }),
        processedAt: new Date().toISOString(),
      })
      .where(eq(quickNotes.id, note.id))
      .returning()
      .get();
    // 识别失败不报错：原始流水已保存，前端提示即可
    return NextResponse.json(parseResult(updated), { status: 201 });
  }
}
