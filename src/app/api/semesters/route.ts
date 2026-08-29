import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { semesters } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) return unauthorized;
  const { searchParams } = new URL(req.url);
  const childId = searchParams.get("childId");
  if (!childId) {
    return NextResponse.json({ error: "缺少 childId 参数" }, { status: 400 });
  }
  const rows = db
    .select()
    .from(semesters)
    .where(eq(semesters.childId, Number(childId)))
    .orderBy(asc(semesters.id))
    .all();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) return unauthorized;
  const body = await req.json();
  const { id: _ignored, ...values } = body;
  if (!values.childId || !values.name?.trim()) {
    return NextResponse.json({ error: "请填写学期名称" }, { status: 400 });
  }
  values.name = values.name.trim();
  const dup = db
    .select()
    .from(semesters)
    .where(and(eq(semesters.childId, Number(values.childId)), eq(semesters.name, values.name)))
    .get();
  if (dup) {
    return NextResponse.json({ error: "该学期名称已存在" }, { status: 400 });
  }
  const row = db.insert(semesters).values(values).returning().get();
  return NextResponse.json(row, { status: 201 });
}
