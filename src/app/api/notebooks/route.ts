import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notebooks } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:notebooks:list");
  if (denied) return denied;
  const rows = db
    .select()
    .from(notebooks)
    .where(eq(notebooks.userId, auth.user.id))
    .orderBy(asc(notebooks.id))
    .all();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:notebooks:create");
  if (denied) return denied;

  const body = await req.json();
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "笔记本名称不能为空" }, { status: 400 });
  const row = db
    .insert(notebooks)
    .values({ userId: auth.user.id, name, icon: String(body.icon ?? "").slice(0, 8) })
    .returning()
    .get();
  return NextResponse.json(row, { status: 201 });
}
