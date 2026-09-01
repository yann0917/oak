import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { familyInsights, familySops } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import type { InsightPeriod } from "@/lib/insights/aggregate";

function parseInsights(row: any) {
  let insights: any[] = [];
  try {
    insights = JSON.parse(row.insights || "[]");
  } catch {
    insights = [];
  }
  return { ...row, insights };
}

/** 某档期最近一期复盘 + 该用户的全部指南（供首页「新叶」卡片展示） */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:insights:list");
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const period = (searchParams.get("period") === "weekly" ? "weekly" : "monthly") as InsightPeriod;

  const latest = db
    .select()
    .from(familyInsights)
    .where(and(eq(familyInsights.userId, auth.user.id), eq(familyInsights.period, period)))
    .orderBy(desc(familyInsights.id))
    .limit(1)
    .get();
  const sops = db
    .select()
    .from(familySops)
    .where(eq(familySops.userId, auth.user.id))
    .orderBy(desc(familySops.id))
    .all();
  return NextResponse.json({ latest: latest ? parseInsights(latest) : null, sops });
}
