import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notebooks } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:notebooks:update");
  if (denied) return denied;

  const { id } = await ctx.params;
  const existing = db
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.id, Number(id)), eq(notebooks.userId, auth.user.id)))
    .get();
  if (!existing) return NextResponse.json({ error: "笔记本不存在" }, { status: 404 });

  const body = await req.json();
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "笔记本名称不能为空" }, { status: 400 });
  const row = db
    .update(notebooks)
    .set({ name, icon: String(body.icon ?? "").slice(0, 8) })
    .where(eq(notebooks.id, existing.id))
    .returning()
    .get();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:notebooks:delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  // 笔记本删除会级联清掉其下笔记与复习卡
  const row = db
    .delete(notebooks)
    .where(and(eq(notebooks.id, Number(id)), eq(notebooks.userId, auth.user.id)))
    .returning()
    .get();
  if (!row) return NextResponse.json({ error: "笔记本不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
