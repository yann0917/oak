import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, like, lte } from "drizzle-orm";
import { db } from "@/db";
import { notebooks, notes, reviewCards } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { createCardIfAbsent } from "@/lib/fsrs";

function withTags(row: typeof notes.$inferSelect) {
  return { ...row, tags: JSON.parse(row.tags || "[]") as string[] };
}

export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:notes:list");
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const notebookId = sp.get("notebookId");
  const enabled = sp.get("enabled"); // '1' | '0' | null
  const dueOnly = sp.get("due") === "1"; // 只看已到期（含未复习的新卡）

  const conds = [eq(notes.userId, auth.user.id)];
  if (q) conds.push(like(notes.title, `%${q}%`));
  if (notebookId && notebookId !== "all") conds.push(eq(notes.notebookId, Number(notebookId)));
  if (enabled === "1") conds.push(eq(notes.enabled, 1));
  if (enabled === "0") conds.push(eq(notes.enabled, 0));
  if (dueOnly) conds.push(lte(reviewCards.due, new Date().toISOString()));

  const rows = db
    .select({ note: notes, due: reviewCards.due, state: reviewCards.state })
    .from(notes)
    .leftJoin(reviewCards, eq(reviewCards.noteId, notes.id))
    .where(and(...conds))
    .orderBy(desc(notes.id))
    .all();

  const nbIds = [...new Set(rows.map((r) => r.note.notebookId).filter(Boolean))] as number[];
  const nbs = nbIds.length
    ? db.select().from(notebooks).where(inArray(notebooks.id, nbIds)).all()
    : [];
  const nbName = new Map(nbs.map((n) => [n.id, n.name]));

  return NextResponse.json(
    rows.map((r) => ({
      ...withTags(r.note),
      due: r.due,
      state: r.state,
      notebookName: r.note.notebookId ? nbName.get(r.note.notebookId) ?? "" : "",
    }))
  );
}

/** 新建笔记：正文 content 为 novel JSON 字符串；同时发一张复习卡 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:notes:create");
  if (denied) return denied;

  const body = await req.json();
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  const notebookId = body.notebookId ? Number(body.notebookId) : null;
  if (notebookId) {
    const nb = db.select().from(notebooks).where(eq(notebooks.id, notebookId)).get();
    if (!nb || nb.userId !== auth.user.id) return NextResponse.json({ error: "笔记本不存在" }, { status: 400 });
  }

  const row = db
    .insert(notes)
    .values({
      userId: auth.user.id,
      notebookId,
      title,
      content: typeof body.content === "string" ? body.content : JSON.stringify({ type: "doc", content: [] }),
      question: String(body.question ?? ""),
      answer: String(body.answer ?? ""),
      tags: JSON.stringify(Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string").slice(0, 12) : []),
      source: String(body.source ?? "").slice(0, 200),
      enabled: body.enabled === false ? 0 : 1,
    })
    .returning()
    .get();
  createCardIfAbsent(row.id, auth.user.id);
  return NextResponse.json(withTags(row), { status: 201 });
}
