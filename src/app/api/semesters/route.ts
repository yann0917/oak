import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { semesters } from "@/db/schema";
import { requirePerm } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { user, denied } = await requirePerm("semesters", "list", req);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const childId = searchParams.get("childId");
  // childId 可选：不传时返回全部（页面用成员筛选展示所有成员数据）
  const conditions = [eq(semesters.userId, user!.id)];
  if (childId) conditions.push(eq(semesters.childId, Number(childId)));
  const rows = db
    .select()
    .from(semesters)
    .where(and(...conditions))
    .orderBy(asc(semesters.id))
    .all();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { user, denied } = await requirePerm("semesters", "create", req);
  if (denied) return denied;
  const body = await req.json();
  const { id: _ignored, ...values } = body;
  if (!values.childId || !values.name?.trim()) {
    return NextResponse.json({ error: "请填写学期名称" }, { status: 400 });
  }
  values.name = values.name.trim();
  const dup = db
    .select()
    .from(semesters)
    .where(and(eq(semesters.childId, Number(values.childId)), eq(semesters.userId, user!.id), eq(semesters.name, values.name)))
    .get();
  if (dup) {
    return NextResponse.json({ error: "该学期名称已存在" }, { status: 400 });
  }
  const row = db.insert(semesters).values({ ...values, userId: user!.id }).returning().get();
  return NextResponse.json(row, { status: 201 });
}
