import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { todoSteps } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

/** 更新子任务（done = 勾选状态 / title = 改名） */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:todo-steps:update");
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await req.json();
  const updates: Record<string, any> = {};
  if (body.done !== undefined) updates.done = body.done ? 1 : 0;
  if (body.title !== undefined) updates.title = String(body.title).trim().slice(0, 200);
  if (!Object.keys(updates).length) return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  const row = db
    .update(todoSteps)
    .set(updates)
    .where(and(eq(todoSteps.id, Number(id)), eq(todoSteps.userId, auth.user.id)))
    .returning()
    .get();
  if (!row) return NextResponse.json({ error: "步骤不存在" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:todo-steps:delete");
  if (denied) return denied;
  const { id } = await ctx.params;
  const row = db
    .delete(todoSteps)
    .where(and(eq(todoSteps.id, Number(id)), eq(todoSteps.userId, auth.user.id)))
    .returning()
    .get();
  if (!row) return NextResponse.json({ error: "步骤不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
