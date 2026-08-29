import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, schools } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { makeItemHandlers } from "@/lib/crud";

const factory = makeItemHandlers(schools);
export const GET = factory.GET;
export const PUT = factory.PUT;

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) return unauthorized;
  const { id } = await ctx.params;
  const schoolId = Number(id);
  // 被入学/阶段记录关联的学校不允许删除，避免记录失去学校信息
  const used = db
    .select()
    .from(enrollments)
    .where(eq(enrollments.schoolId, schoolId))
    .get();
  if (used) {
    return NextResponse.json(
      { error: "该学校正在被入学/阶段记录使用，无法删除" },
      { status: 400 }
    );
  }
  db.delete(schools).where(eq(schools.id, schoolId)).run();
  return NextResponse.json({ ok: true });
}
