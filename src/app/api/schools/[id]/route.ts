import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, schools } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { makeItemHandlers } from "@/lib/crud";

const factory = makeItemHandlers(schools, { api: "schools" });
export const GET = factory.GET;
export const PUT = factory.PUT;

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { user, denied } = await requirePerm("schools", "delete", req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const schoolId = Number(id);
  // 本用户被入学/阶段记录关联的学校不允许删除，避免记录失去学校信息
  const used = db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.schoolId, schoolId), eq(enrollments.userId, user!.id)))
    .get();
  if (used) {
    return NextResponse.json(
      { error: "该学校正在被入学/阶段记录使用，无法删除" },
      { status: 400 }
    );
  }
  db.delete(schools).where(and(eq(schools.id, schoolId), eq(schools.userId, user!.id))).run();
  return NextResponse.json({ ok: true });
}
