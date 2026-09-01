import { NextRequest, NextResponse } from "next/server";
import { authorize, requireUser } from "@/lib/auth";
import { generateInsight } from "@/lib/insights/generate";
import type { InsightPeriod } from "@/lib/insights/aggregate";

/** 立即生成一期周/月复盘（首页「立即复盘」按钮；定时器同用此逻辑） */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:insights:create");
  if (denied) return denied;
  const body = await req.json();
  const period = (body.period === "weekly" ? "weekly" : "monthly") as InsightPeriod;

  try {
    const row = await generateInsight(auth.user.id, period);
    if (row.status === "failed") {
      return NextResponse.json({ error: row.error || "复盘失败" }, { status: 400 });
    }
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "复盘失败" }, { status: 400 });
  }
}
