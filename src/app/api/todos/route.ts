import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { todoLists, todoSteps, todos } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { createTodoReminder } from "@/lib/todos/reminder";

/** GET：用户全部待办（含子任务步骤），前端按智能列表/清单分组 */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:todos:list");
  if (denied) return denied;

  const rows = db.select().from(todos).where(eq(todos.userId, auth.user.id)).orderBy(desc(todos.id)).all();
  const todoIds = rows.map((t) => t.id);
  const steps = todoIds.length
    ? db.select().from(todoSteps).where(inArray(todoSteps.todoId, todoIds)).orderBy(todoSteps.sort).all()
    : [];
  const lists = db.select().from(todoLists).where(eq(todoLists.userId, auth.user.id)).orderBy(todoLists.id).all();
  return NextResponse.json({
    todos: rows.map((t) => ({ ...t, steps: steps.filter((s) => s.todoId === t.id) })),
    lists,
  });
}

/** 校验清单归属（listId 非空时必须是本人清单） */
function ownList(userId: number, listId: any): boolean {
  if (listId == null || listId === "") return true;
  return !!db.select().from(todoLists).where(eq(todoLists.id, Number(listId))).get();
}

/** 创建待办：可选提醒 → 自动建提醒中心 once 提醒 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:todos:create");
  if (denied) return denied;
  const body = await req.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "任务标题不能为空" }, { status: 400 });
  if (body.listId != null && body.listId !== "" && !ownList(auth.user.id, body.listId)) {
    return NextResponse.json({ error: "清单不存在" }, { status: 400 });
  }
  const remindAt = typeof body.remindAt === "string" ? body.remindAt.slice(0, 16) : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  const row = db
    .insert(todos)
    .values({
      userId: auth.user.id,
      title,
      listId: body.listId != null && body.listId !== "" ? Number(body.listId) : null,
      note,
      dueDate: typeof body.dueDate === "string" ? body.dueDate.slice(0, 10) : "",
      remindAt,
      repeatRule: typeof body.repeatRule === "string" ? body.repeatRule : "",
      priority: body.priority ? 1 : 0,
      myDayDate: typeof body.myDayDate === "string" ? body.myDayDate.slice(0, 10) : "",
      done: 0,
    })
    .returning()
    .get();

  if (remindAt) {
    const reminderId = createTodoReminder(auth.user.id, title, note, remindAt);
    if (reminderId) {
      db.update(todos).set({ reminderId }).where(eq(todos.id, row.id)).run();
    }
  }
  const full = db.select().from(todos).where(eq(todos.id, row.id)).get();
  return NextResponse.json({ ...full, steps: [] }, { status: 201 });
}
