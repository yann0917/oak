import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { timetablePeriodOrder } from "@/db/schema";
import { requirePerm } from "@/lib/auth";

// GET：孩子某学期（或不限学期）的节次顺序；childId 可选，不传返回全部成员
export async function GET(req: NextRequest) {
  const { user, denied } = await requirePerm("timetable-period-order", "list", req);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const childId = searchParams.get("childId");
  const term = searchParams.get("term");
  const where = and(
    childId ? eq(timetablePeriodOrder.childId, Number(childId)) : undefined,
    eq(timetablePeriodOrder.userId, user!.id),
    term ? eq(timetablePeriodOrder.term, term) : undefined
  );
  const rows = db.select().from(timetablePeriodOrder).where(where).all();
  return NextResponse.json(rows);
}

// PUT：整体保存某孩子某学期的节次顺序
export async function PUT(req: NextRequest) {
  const { user, denied } = await requirePerm("timetable-period-order", "update", req);
  if (denied) return denied;
  const { childId, term, periods } = await req.json();
  if (!childId || !term || !Array.isArray(periods)) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }
  db.delete(timetablePeriodOrder)
    .where(
      and(
        eq(timetablePeriodOrder.childId, Number(childId)),
        eq(timetablePeriodOrder.term, String(term)),
        eq(timetablePeriodOrder.userId, user!.id)
      )
    )
    .run();
  periods.forEach((p: string, idx: number) => {
    db.insert(timetablePeriodOrder)
      .values({ userId: user!.id, childId: Number(childId), term: String(term), period: String(p), idx })
      .run();
  });
  return NextResponse.json({ ok: true });
}
