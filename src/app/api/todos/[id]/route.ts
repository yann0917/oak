import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { todos } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:todos:update");
  if (denied) return denied;

  const { id } = await ctx.params;
  const existing = db
    .select()
    .from(todos)
    .where(and(eq(todos.id, Number(id)), eq(todos.userId, auth.user.id)))
    .get();
  if (!existing) return NextResponse.json({ error: "待办不存在" }, { status: 404 });

  const body = await req.json();
  const row = db
    .update(todos)
    .set({
      title: body.title !== undefined ? String(body.title).trim().slice(0, 200) : existing.title,
      done: body.done !== undefined ? (body.done ? 1 : 0) : existing.done,
    })
    .where(eq(todos.id, existing.id))
    .returning()
    .get();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:todos:delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const row = db
    .delete(todos)
    .where(and(eq(todos.id, Number(id)), eq(todos.userId, auth.user.id)))
    .returning()
    .get();
  if (!row) return NextResponse.json({ error: "待办不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
