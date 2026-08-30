import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { notes, reviewCards, reviewLogs } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

function dayKey(iso: string) {
  // 转本地时区的 YYYY-MM-DD（按创建时的服务器时区）
  return new Date(iso).toLocaleDateString("sv-SE");
}

export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:stats:list");
  if (denied) return denied;

  const uid = auth.user.id;
  const now = Date.now();
  const ms30d = 30 * 24 * 3600 * 1000;
  const iso30dAgo = new Date(now - ms30d).toISOString();

  // 近 30 天复习流水（按天聚合 + 评分分布）
  const logs = db
    .select({ rating: reviewLogs.rating, reviewedAt: reviewLogs.reviewedAt })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, uid), gte(reviewLogs.reviewedAt, iso30dAgo)))
    .all();
  const daily = new Map<string, number>();
  const ratingCounts = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const l of logs) {
    const day = dayKey(l.reviewedAt);
    daily.set(day, (daily.get(day) ?? 0) + 1);
    if (l.rating === 1) ratingCounts.again++;
    else if (l.rating === 2) ratingCounts.hard++;
    else if (l.rating === 3) ratingCounts.good++;
    else if (l.rating === 4) ratingCounts.easy++;
  }

  // 未来 30 天到期分布（含今天）
  const dueRows = db
    .select({ due: reviewCards.due })
    .from(reviewCards)
    .where(and(eq(reviewCards.userId, uid), gte(reviewCards.due, new Date(now - 86400000).toISOString()), lte(reviewCards.due, new Date(now + ms30d).toISOString())))
    .all();
  const dueDist = new Map<string, number>();
  for (const r of dueRows) {
    const day = dayKey(r.due);
    dueDist.set(day, (dueDist.get(day) ?? 0) + 1);
  }

  const cards = db
    .select({ noteId: reviewCards.noteId, due: reviewCards.due, state: reviewCards.state })
    .from(reviewCards)
    .where(eq(reviewCards.userId, uid))
    .all();
  const enabledCount = db
    .select({ count: notes.id })
    .from(notes)
    .where(and(eq(notes.userId, uid), eq(notes.enabled, 1)))
    .all().length;

  const dueToday = cards.filter((c) => new Date(c.due) <= new Date()).length;
  return NextResponse.json({
    summary: {
      cards: cards.length,
      enabled: enabledCount,
      reviews: logs.length,
      dueToday,
    },
    ratingCounts,
    daily: [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, count]) => ({ day, count })),
    dueDist: [...dueDist.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, count]) => ({ day, count })),
  });
}
