import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  bills,
  certArchives,
  growthRecords,
  healthRecords,
  learningRecords,
  moments,
  notes,
  quickNotes,
} from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

/** 按北京时间归到 YYYY-MM-DD（created_at 为 UTC ISO，与今日字符串时区一致） */
function dayKey(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date(iso));
}

/**
 * 首页活动热力图：近一年各业务模块的每日记录条数（快记/时光/成长/健康/账单/学习/卡证/错题本）。
 * 各表结构一致（user_id + created_at），分别聚合后合并。
 */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:stats:list");
  if (denied) return denied;
  const uid = auth.user.id;

  const sinceIso = new Date(Date.now() - 371 * 86400000).toISOString();
  const sources = [
    quickNotes,
    moments,
    growthRecords,
    healthRecords,
    bills,
    learningRecords,
    certArchives,
    notes,
  ];

  const days: Record<string, number> = {};
  let total = 0;
  for (const table of sources) {
    const rows = db
      .select({ createdAt: table.createdAt })
      .from(table)
      .where(and(eq(table.userId, uid), gte(table.createdAt, sinceIso)))
      .all();
    for (const r of rows) {
      const day = dayKey(r.createdAt);
      days[day] = (days[day] ?? 0) + 1;
      total++;
    }
  }

  return NextResponse.json({ days, total });
}
