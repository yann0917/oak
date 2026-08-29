import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { timetablePeriodOrder } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

// GET：孩子某学期（或不限学期）的节次顺序
export async function GET(req: NextRequest) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) return unauthorized;
  const { searchParams } = new URL(req.url);
  const childId = searchParams.get("childId");
  if (!childId) return NextResponse.json({ error: "缺少 childId" }, { status: 400 });
  const term = searchParams.get("term");
  const where = term
    ? and(eq(timetablePeriodOrder.childId, Number(childId)), eq(timetablePeriodOrder.term, term))
    : eq(timetablePeriodOrder.childId, Number(childId));
  const rows = db.select().from(timetablePeriodOrder).where(where).all();
  return NextResponse.json(rows);
}

// PUT：整体保存某孩子某学期的节次顺序
export async function PUT(req: NextRequest) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) return unauthorized;
  const { childId, term, periods } = await req.json();
  if (!childId || !term || !Array.isArray(periods)) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }
  db.delete(timetablePeriodOrder)
    .where(
      and(
        eq(timetablePeriodOrder.childId, Number(childId)),
        eq(timetablePeriodOrder.term, String(term))
      )
    )
    .run();
  periods.forEach((p: string, idx: number) => {
    db.insert(timetablePeriodOrder)
      .values({ childId: Number(childId), term: String(term), period: String(p), idx })
      .run();
  });
  return NextResponse.json({ ok: true });
}
