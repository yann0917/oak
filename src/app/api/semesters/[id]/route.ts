import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  feeRecords,
  learningRecords,
  semesters,
  timetablePeriodOrder,
  timetableSlots,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) return unauthorized;
  const { id } = await ctx.params;
  const row = db.select().from(semesters).where(eq(semesters.id, Number(id))).get();
  if (!row) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) return unauthorized;
  const { id } = await ctx.params;
  const body = await req.json();
  const { id: _ignored, ...values } = body;
  const current = db.select().from(semesters).where(eq(semesters.id, Number(id))).get();
  if (!current) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  if (values.name != null) {
    values.name = String(values.name).trim();
    if (!values.name) {
      return NextResponse.json({ error: "请填写学期名称" }, { status: 400 });
    }
    const dup = db
      .select()
      .from(semesters)
      .where(
        and(
          eq(semesters.childId, current.childId),
          eq(semesters.name, values.name),
          ne(semesters.id, current.id)
        )
      )
      .get();
    if (dup) {
      return NextResponse.json({ error: "该学期名称已存在" }, { status: 400 });
    }
  }
  const row = db
    .update(semesters)
    .set(values)
    .where(eq(semesters.id, Number(id)))
    .returning()
    .get();
  // 学期改名后同步节次顺序表（按学期名存储），保留已拖拽的顺序
  if (row.name !== current.name) {
    db.update(timetablePeriodOrder)
      .set({ term: row.name })
      .where(
        and(
          eq(timetablePeriodOrder.childId, current.childId),
          eq(timetablePeriodOrder.term, current.name)
        )
      )
      .run();
  }
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) return unauthorized;
  const { id } = await ctx.params;
  const current = db.select().from(semesters).where(eq(semesters.id, Number(id))).get();
  if (!current) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  const used =
    db.select().from(timetableSlots).where(eq(timetableSlots.semesterId, current.id)).get() ||
    db.select().from(learningRecords).where(eq(learningRecords.semesterId, current.id)).get() ||
    db.select().from(feeRecords).where(eq(feeRecords.semesterId, current.id)).get();
  if (used) {
    return NextResponse.json(
      { error: "该学期正在被课程表、学习情况或学费记录使用，无法删除" },
      { status: 400 }
    );
  }
  db.delete(semesters).where(eq(semesters.id, current.id)).run();
  db.delete(timetablePeriodOrder)
    .where(
      and(
        eq(timetablePeriodOrder.childId, current.childId),
        eq(timetablePeriodOrder.term, current.name)
      )
    )
    .run();
  return NextResponse.json({ ok: true });
}
