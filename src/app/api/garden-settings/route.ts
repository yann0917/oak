import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { gardenSettings } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { DIFFICULTIES, ACTIVITY_KEYS, type ActivityKey, type Difficulty } from "@/lib/garden/types";

// GET 某孩子的全部活动设置（卡片上显示当前难度 / 题量）
export async function GET(req: NextRequest) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) return unauthorized;
  const { searchParams } = new URL(req.url);
  const childId = Number(searchParams.get("childId"));
  if (!childId) {
    return NextResponse.json({ error: "缺少 childId 参数" }, { status: 400 });
  }
  const rows = db
    .select()
    .from(gardenSettings)
    .where(eq(gardenSettings.childId, childId))
    .all();
  return NextResponse.json(rows);
}

// POST upsert 单个活动的设置：difficulty 覆盖，config 增量合并（浅合并）
export async function POST(req: NextRequest) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) return unauthorized;
  const body = await req.json();
  const childId = Number(body.childId);
  const activity = String(body.activity || "") as ActivityKey;
  if (!childId || !ACTIVITY_KEYS.includes(activity)) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }
  const difficulty = DIFFICULTIES.includes(body.difficulty)
    ? (body.difficulty as Difficulty)
    : undefined;

  let config: string | undefined;
  if (body.config !== undefined) {
    const incoming = typeof body.config === "string" ? safeParse(body.config) : body.config;
    if (incoming === null) {
      config = ""; // 显式清空
    } else if (incoming && typeof incoming === "object" && !Array.isArray(incoming)) {
      const existing = db
        .select()
        .from(gardenSettings)
        .where(and(eq(gardenSettings.childId, childId), eq(gardenSettings.activity, activity)))
        .get();
      const base = existing?.config ? safeParse(existing.config) ?? {} : {};
      config = JSON.stringify({ ...base, ...incoming });
    } else {
      return NextResponse.json({ error: "config 格式无效" }, { status: 400 });
    }
  }

  if (!difficulty && config === undefined) {
    return NextResponse.json({ error: "没有需要保存的设置" }, { status: 400 });
  }

  const existing = db
    .select()
    .from(gardenSettings)
    .where(and(eq(gardenSettings.childId, childId), eq(gardenSettings.activity, activity)))
    .get();

  const now = new Date().toISOString();
  if (!existing) {
    const row = db
      .insert(gardenSettings)
      .values({
        childId,
        activity,
        difficulty: difficulty ?? "简单",
        ...(config !== undefined ? { config } : {}),
        updatedAt: now,
      })
      .returning()
      .get();
    return NextResponse.json(row, { status: 201 });
  }

  const row = db
    .update(gardenSettings)
    .set({
      ...(difficulty ? { difficulty } : {}),
      ...(config !== undefined ? { config } : {}),
      updatedAt: now,
    })
    .where(eq(gardenSettings.id, existing.id))
    .returning()
    .get();
  return NextResponse.json(row);
}

function safeParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
