import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { todoSteps, todos } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { createTodoReminder, disableReminder } from "@/lib/todos/reminder";
import { nextDate, nextRemindAt, parseRepeatRule } from "@/lib/todos/repeat";

/**
 * 完成/取消完成：
 * - 完成：记录 completedAt、停用提醒；重复任务生成下一个实例（自动重排到期/提醒）。
 * - 取消完成：恢复未完成状态（提醒保持停用，改时间后经 PUT 重建）。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  const body = (await req.json().catch(() => ({}))) as { done?: boolean };
  const done = body.done == null ? !existing.done : !!body.done;

  if (done) {
    disableReminder(existing.reminderId);
    const updated = db
      .update(todos)
      .set({ done: 1, completedAt: new Date().toISOString() })
      .where(eq(todos.id, existing.id))
      .returning()
      .get();

    // 重复规则：生成下一个实例（从今天起算下一个周期；提醒同步平移）
    let next: any = null;
    if (existing.repeatRule && parseRepeatRule(existing.repeatRule)) {
      const base = existing.dueDate || new Date().toISOString().slice(0, 10);
      const nextDue = nextDate(base, existing.repeatRule);
      const nextRemind = nextRemindAt(existing.remindAt, existing.repeatRule);
      const reminderId = nextRemind ? createTodoReminder(auth.user.id, existing.title, existing.note, nextRemind) : null;
      next = db
        .insert(todos)
        .values({
          userId: auth.user.id,
          title: existing.title,
          listId: existing.listId,
          note: existing.note,
          dueDate: nextDue,
          remindAt: nextRemind,
          repeatRule: existing.repeatRule,
          priority: existing.priority,
          myDayDate: "",
          reminderId,
          done: 0,
        })
        .returning()
        .get();
    }
    return NextResponse.json({ done: updated, next });
  }

  const row = db
    .update(todos)
    .set({ done: 0, completedAt: "" })
    .where(eq(todos.id, existing.id))
    .returning()
    .get();
  const steps = db.select().from(todoSteps).where(eq(todoSteps.todoId, row.id)).orderBy(todoSteps.sort).all();
  return NextResponse.json({ done: { ...row, steps } });
}
