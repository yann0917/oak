import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { gardenRecords, gardenMastery } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { ACTIVITY_KEYS, GAME_KEYS, type ActivityKey, type GameKey } from "@/lib/garden/types";

// GET 练习记录列表：?childId= 必填，?activity= 可选
export async function GET(req: NextRequest) {
  const { user, denied } = await requirePerm("garden-records", "list", req);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const childId = Number(searchParams.get("childId"));
  if (!childId) {
    return NextResponse.json({ error: "缺少 childId 参数" }, { status: 400 });
  }
  const activity = searchParams.get("activity");
  const conditions = [eq(gardenRecords.childId, childId), eq(gardenRecords.userId, user!.id)];
  if (activity) conditions.push(eq(gardenRecords.activity, activity));
  const rows = db
    .select()
    .from(gardenRecords)
    .where(and(...conditions))
    .orderBy(desc(gardenRecords.id))
    .limit(200)
    .all();
  return NextResponse.json(rows);
}

interface ResultItem {
  itemKey: string;
  label?: string;
  correct: boolean;
}

// POST 提交一轮成绩：插入会话记录 + 按知识点更新掌握度（事务）
export async function POST(req: NextRequest) {
  const { user, denied } = await requirePerm("garden-records", "create", req);
  if (denied) return denied;
  const body = await req.json();
  const childId = Number(body.childId);
  const activity = String(body.activity || "");
  const difficulty = String(body.difficulty || "简单");
  const durationSec = Math.max(0, Math.round(Number(body.durationSec) || 0));
  const results: ResultItem[] = Array.isArray(body.results) ? body.results : [];

  const isActivity = ACTIVITY_KEYS.includes(activity as ActivityKey);
  const isGame = GAME_KEYS.includes(activity as GameKey);
  if (!childId || (!isActivity && !isGame)) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }
  if (results.length === 0 || results.some((r) => !r || typeof r.itemKey !== "string" || !r.itemKey)) {
    return NextResponse.json({ error: "练习结果数据无效" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const correctCount = results.filter((r) => r.correct).length;
  const wrongLabels = results.filter((r) => !r.correct).map((r) => r.label || r.itemKey);

  const record = db.transaction((tx) => {
    const inserted = tx
      .insert(gardenRecords)
      .values({
        userId: user!.id,
        childId,
        activity,
        difficulty,
        total: results.length,
        correct: correctCount,
        durationSec,
        wrongItems: JSON.stringify(wrongLabels),
        createdAt: now,
      })
      .returning()
      .get();

    for (const r of results) {
      const existing = tx
        .select()
        .from(gardenMastery)
        .where(
          and(
            eq(gardenMastery.childId, childId),
            eq(gardenMastery.activity, activity),
            eq(gardenMastery.itemKey, r.itemKey)
          )
        )
        .get();
      if (existing) {
        tx.update(gardenMastery)
          .set({
            label: r.label || existing.label,
            correctCount: existing.correctCount + (r.correct ? 1 : 0),
            wrongCount: existing.wrongCount + (r.correct ? 0 : 1),
            lastCorrect: r.correct ? 1 : 0,
            updatedAt: now,
          })
          .where(eq(gardenMastery.id, existing.id))
          .run();
      } else {
        tx.insert(gardenMastery)
          .values({
            userId: user!.id,
            childId,
            activity,
            itemKey: r.itemKey,
            label: r.label || "",
            correctCount: r.correct ? 1 : 0,
            wrongCount: r.correct ? 0 : 1,
            lastCorrect: r.correct ? 1 : 0,
            updatedAt: now,
          })
          .run();
      }
    }
    return inserted;
  });

  return NextResponse.json(record, { status: 201 });
}
