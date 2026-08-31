import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { quickNotes } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { buildManualIntent, dispatchQuickIntent } from "@/lib/ai/dispatch";
import { todayString } from "@/lib/ai/classify";
import { MANUAL_TYPES, QUICK_TYPE_META, type QuickType } from "@/lib/quick/meta";

/**
 * 手动归类（未配置 AI 时的降级路径）：
 * 用户指定类型（+可选成员），按最小默认字段写入对应业务表。
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:quick-notes:update");
  if (denied) return denied;
  const { id } = await ctx.params;

  const note = db
    .select()
    .from(quickNotes)
    .where(and(eq(quickNotes.id, Number(id)), eq(quickNotes.userId, auth.user.id)))
    .get();
  if (!note) return NextResponse.json({ error: "记录不存在" }, { status: 404 });

  const body = await req.json();
  const type = body.type as QuickType;
  if (!MANUAL_TYPES.includes(type)) return NextResponse.json({ error: "未知的归类类型" }, { status: 400 });
  if (type === "other") {
    const updated = db
      .update(quickNotes)
      .set({
        status: "processed",
        aiType: "other",
        childId: null,
        result: JSON.stringify({ summary: "已保留为原始记录", module: "other", label: "原始记录", path: "", targetId: null, error: "" }),
        processedAt: new Date().toISOString(),
      })
      .where(eq(quickNotes.id, note.id))
      .returning()
      .get();
    return NextResponse.json(updated);
  }

  const childId = body.childId != null ? Number(body.childId) : null;
  let notePhotos: string[] = [];
  try {
    notePhotos = JSON.parse(note.photos || "[]");
  } catch {
    notePhotos = [];
  }
  const intent = buildManualIntent(type, note.content, childId, todayString());
  const target = dispatchQuickIntent(intent, auth.user.id, note.content, childId, notePhotos);
  if (!target.targetId) {
    const need = QUICK_TYPE_META[type].childScoped ? "请先选择归属成员" : "该类型暂无法自动归类";
    return NextResponse.json({ error: need }, { status: 400 });
  }

  const updated = db
    .update(quickNotes)
    .set({
      status: "processed",
      aiType: type,
      childId: target.childId,
      result: JSON.stringify({
        summary: `已记入${target.label}`,
        module: target.module,
        label: target.label,
        path: target.path,
        targetId: target.targetId,
        error: "",
      }),
      processedAt: new Date().toISOString(),
    })
    .where(eq(quickNotes.id, note.id))
    .returning()
    .get();
  return NextResponse.json(updated);
}

/** 删除原始流水（已落库的目标记录不受影响，可在目标页删除） */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:quick-notes:delete");
  if (denied) return denied;
  const { id } = await ctx.params;
  const row = db
    .delete(quickNotes)
    .where(and(eq(quickNotes.id, Number(id)), eq(quickNotes.userId, auth.user.id)))
    .returning()
    .get();
  if (!row) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
