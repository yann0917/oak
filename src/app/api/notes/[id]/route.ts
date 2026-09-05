import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notebooks, notes, reviewCards } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { createCardIfAbsent } from "@/lib/fsrs";

function withTags(row: typeof notes.$inferSelect) {
  return { ...row, tags: JSON.parse(row.tags || "[]") as string[] };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:notes:detail");
  if (denied) return denied;

  const { id } = await ctx.params;
  const row = db
    .select()
    .from(notes)
    .where(and(eq(notes.id, Number(id)), eq(notes.userId, auth.user.id)))
    .get();
  if (!row) return NextResponse.json({ error: "笔记不存在" }, { status: 404 });

  const card = db.select().from(reviewCards).where(eq(reviewCards.noteId, row.id)).get();
  let notebookName = "";
  if (row.notebookId) {
    notebookName = db
      .select({ name: notebooks.name })
      .from(notebooks)
      .where(eq(notebooks.id, row.notebookId))
      .get()?.name ?? "";
  }
  return NextResponse.json({
    ...withTags(row),
    due: card?.due ?? null,
    state: card?.state ?? null,
    reps: card?.reps ?? 0,
    notebookName,
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:notes:update");
  if (denied) return denied;

  const { id } = await ctx.params;
  const existing = db
    .select()
    .from(notes)
    .where(and(eq(notes.id, Number(id)), eq(notes.userId, auth.user.id)))
    .get();
  if (!existing) return NextResponse.json({ error: "笔记不存在" }, { status: 404 });

  const body = await req.json();
  // 支持部分更新：只传 enabled/notebookId 等也可
  const title = body.title !== undefined ? (body.title ?? "").trim() : existing.title;
  if (!title) return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  const notebookId = body.notebookId !== undefined ? (body.notebookId ? Number(body.notebookId) : null) : existing.notebookId;
  if (notebookId) {
    const nb = db.select().from(notebooks).where(eq(notebooks.id, notebookId)).get();
    if (!nb || nb.userId !== auth.user.id) return NextResponse.json({ error: "笔记本不存在" }, { status: 400 });
  }

  const row = db
    .update(notes)
    .set({
      notebookId,
      title,
      // kind/content_format 创建时固定（错题=TipTap JSON，文章=markdown），编辑只更新正文
      content: typeof body.content === "string" ? body.content : existing.content,
      question: body.question !== undefined ? String(body.question) : existing.question,
      answer: body.answer !== undefined ? String(body.answer) : existing.answer,
      tags:
        body.tags !== undefined
          ? JSON.stringify(Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string").slice(0, 12) : [])
          : existing.tags,
      source: body.source !== undefined ? String(body.source).slice(0, 200) : existing.source,
      enabled: body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(notes.id, existing.id))
    .returning()
    .get();
  // 首次保存补卡（文章随笔不进复习队列）；启用状态变化不影响已有卡（调度只在队列过滤时看 enabled）
  if (row.kind !== "article") createCardIfAbsent(row.id, auth.user.id);
  return NextResponse.json(withTags(row));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:notes:delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  // 级联删除复习卡与流水
  const row = db
    .delete(notes)
    .where(and(eq(notes.id, Number(id)), eq(notes.userId, auth.user.id)))
    .returning()
    .get();
  if (!row) return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
