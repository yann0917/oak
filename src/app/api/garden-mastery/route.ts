import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { gardenMastery } from "@/db/schema";
import { requirePerm } from "@/lib/auth";

// GET 知识点掌握度：?childId=&activity= 必填，出题加权用
export async function GET(req: NextRequest) {
  const { user, denied } = await requirePerm("garden-mastery", "list", req);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const childId = Number(searchParams.get("childId"));
  const activity = searchParams.get("activity");
  if (!childId || !activity) {
    return NextResponse.json({ error: "缺少 childId 或 activity 参数" }, { status: 400 });
  }
  const rows = db
    .select()
    .from(gardenMastery)
    .where(
      and(
        eq(gardenMastery.childId, childId),
        eq(gardenMastery.activity, activity),
        eq(gardenMastery.userId, user!.id)
      )
    )
    .orderBy(desc(gardenMastery.updatedAt))
    .all();
  return NextResponse.json(rows);
}
