import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { gardenMastery } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

// GET 知识点掌握度：?childId=&activity= 必填，出题加权用
export async function GET(req: NextRequest) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) return unauthorized;
  const { searchParams } = new URL(req.url);
  const childId = Number(searchParams.get("childId"));
  const activity = searchParams.get("activity");
  if (!childId || !activity) {
    return NextResponse.json({ error: "缺少 childId 或 activity 参数" }, { status: 400 });
  }
  const rows = db
    .select()
    .from(gardenMastery)
    .where(and(eq(gardenMastery.childId, childId), eq(gardenMastery.activity, activity)))
    .orderBy(desc(gardenMastery.updatedAt))
    .all();
  return NextResponse.json(rows);
}
