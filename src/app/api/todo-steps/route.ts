import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { todoSteps, todos } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

/** 添加子任务步骤（todoId 必须是本人的待办） */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:todo-steps:create");
  if (denied) return denied;
  const body = await req.json();
  const todoId = Number(body.todoId);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!todoId || !title) return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  const todo = db.select().from(todos).where(and(eq(todos.id, todoId), eq(todos.userId, auth.user.id))).get();
  if (!todo) return NextResponse.json({ error: "待办不存在" }, { status: 404 });
  const maxSort =
    (db.select({ s: todoSteps.sort }).from(todoSteps).where(eq(todoSteps.todoId, todoId)).orderBy(desc(todoSteps.sort)).limit(1).get()?.s ?? -1) + 1;
  const row = db
    .insert(todoSteps)
    .values({ userId: auth.user.id, todoId, title, done: 0, sort: maxSort })
    .returning()
    .get();
  return NextResponse.json(row, { status: 201 });
}
