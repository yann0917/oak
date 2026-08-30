import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { todos } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:todos:list");
  if (denied) return denied;
  const rows = db
    .select()
    .from(todos)
    .where(eq(todos.userId, auth.user.id))
    .orderBy(asc(todos.id))
    .all();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:todos:create");
  if (denied) return denied;

  const body = await req.json();
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "待办内容不能为空" }, { status: 400 });
  const row = db
    .insert(todos)
    .values({ userId: auth.user.id, title, done: 0 })
    .returning()
    .get();
  return NextResponse.json(row, { status: 201 });
}
