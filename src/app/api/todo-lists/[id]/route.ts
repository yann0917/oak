import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { todoLists, todos } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:todo-lists:update");
  if (denied) return denied;
  const { id } = await ctx.params;
  const existing = db
    .select()
    .from(todoLists)
    .where(and(eq(todoLists.id, Number(id)), eq(todoLists.userId, auth.user.id)))
    .get();
  if (!existing) return NextResponse.json({ error: "清单不存在" }, { status: 404 });
  const body = await req.json();
  const updates: Record<string, any> = {};
  if (body.name !== undefined) {
    updates.name = String(body.name).trim().slice(0, 50);
    if (!updates.name) return NextResponse.json({ error: "清单名称不能为空" }, { status: 400 });
  }
  if (body.color !== undefined) updates.color = String(body.color).slice(0, 20);
  const row = db.update(todoLists).set(updates).where(eq(todoLists.id, existing.id)).returning().get();
  return NextResponse.json(row);
}

/** 删除清单：清单下任务移回「任务」智能列表（list_id 置空） */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:todo-lists:delete");
  if (denied) return denied;
  const { id } = await ctx.params;
  const existing = db
    .select()
    .from(todoLists)
    .where(and(eq(todoLists.id, Number(id)), eq(todoLists.userId, auth.user.id)))
    .get();
  if (!existing) return NextResponse.json({ error: "清单不存在" }, { status: 404 });
  db.update(todos).set({ listId: null }).where(and(eq(todos.listId, existing.id), eq(todos.userId, auth.user.id))).run();
  db.delete(todoLists).where(eq(todoLists.id, existing.id)).run();
  return NextResponse.json({ ok: true });
}
