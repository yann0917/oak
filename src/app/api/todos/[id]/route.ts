import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { todoSteps, todos } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { createTodoReminder, disableReminder } from "@/lib/todos/reminder";
import { nextDate, nextRemindAt } from "@/lib/todos/repeat";

function own(userId: number, id: number) {
  return db.select().from(todos).where(and(eq(todos.id, id), eq(todos.userId, userId))).get();
}

/** 更新待办：字段级覆盖（title/note/dueDate/remindAt/repeatRule/priority/listId/myDayDate）；提醒变更时重建提醒中心提醒 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:todos:update");
  if (denied) return denied;
  const { id } = await ctx.params;
  const existing = own(auth.user.id, Number(id));
  if (!existing) return NextResponse.json({ error: "待办不存在" }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, any> = {};
  if (body.title !== undefined) updates.title = String(body.title).trim().slice(0, 200);
  if (body.note !== undefined) updates.note = String(body.note).trim().slice(0, 2000);
  if (body.dueDate !== undefined) updates.dueDate = String(body.dueDate).slice(0, 10);
  if (body.repeatRule !== undefined) updates.repeatRule = String(body.repeatRule);
  if (body.priority !== undefined) updates.priority = body.priority ? 1 : 0;
  if (body.myDayDate !== undefined) updates.myDayDate = body.myDayDate ? String(body.myDayDate).slice(0, 10) : "";
  if (body.listId !== undefined) {
    const lid = body.listId == null || body.listId === "" ? null : Number(body.listId);
    if (lid) {
      const ownsList = !!db.select().from(todos).where(and(eq(todos.id, existing.id), eq(todos.userId, auth.user.id))).get();
      void ownsList;
    }
    updates.listId = lid;
  }
  // 提醒时间变更：停用旧提醒并重建（remindAt 为空则只停用）
  if (body.remindAt !== undefined) {
    const remindAt = String(body.remindAt).slice(0, 16);
    updates.remindAt = remindAt;
    disableReminder(existing.reminderId);
    updates.reminderId = remindAt ? createTodoReminder(auth.user.id, updates.title || existing.title, updates.note || existing.note, remindAt) : null;
  }

  const row = db
    .update(todos)
    .set(updates)
    .where(and(eq(todos.id, existing.id), eq(todos.userId, auth.user.id)))
    .returning()
    .get();
  const steps = db.select().from(todoSteps).where(eq(todoSteps.todoId, row.id)).orderBy(todoSteps.sort).all();
  return NextResponse.json({ ...row, steps });
}

/** 删除待办：级联删步骤、停用提醒 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:todos:delete");
  if (denied) return denied;
  const { id } = await ctx.params;
  const existing = own(auth.user.id, Number(id));
  if (!existing) return NextResponse.json({ error: "待办不存在" }, { status: 404 });

  disableReminder(existing.reminderId);
  db.delete(todoSteps).where(eq(todoSteps.todoId, existing.id)).run();
  db.delete(todos).where(eq(todos.id, existing.id)).run();
  return NextResponse.json({ ok: true });
}
