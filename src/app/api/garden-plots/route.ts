import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gardenItems, gardenPlots } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { advance, type Stage } from "@/lib/garden/growth";
import { PLOT_CAPACITY } from "@/lib/garden/plotLayout";
import { ensureStarterItems, readItems, seedKey } from "@/lib/garden/inventory";
import { SPECIES } from "@/lib/garden/species";

// GET 花园状态：读取时按服务端时间惰性推进生长阶段 + 首次访问初始化库存
export async function GET(req: NextRequest) {
  const { user, denied } = await requirePerm("garden-plots", "list", req);
  if (denied) return denied;

  const childId = Number(new URL(req.url).searchParams.get("childId"));
  if (!childId) {
    return NextResponse.json({ error: "缺少 childId 参数" }, { status: 400 });
  }

  const now = Date.now();
  const rows = db
    .select()
    .from(gardenPlots)
    .where(and(eq(gardenPlots.childId, childId), eq(gardenPlots.userId, user!.id)))
    .all();

  const plots = rows.map((r) => {
    const g = advance(
      {
        stage: r.stage as Stage,
        stageStartedAt: Date.parse(r.stageStartedAt),
        waterCount: r.waterCount,
      },
      now
    );
    if (g.changed) {
      const nextStartedAt = new Date(g.stageStartedAt).toISOString();
      // 条件更新：并发请求同时读到旧值时只有一次能写入
      db.update(gardenPlots)
        .set({
          stage: g.stage,
          stageStartedAt: nextStartedAt,
          waterCount: g.waterCount,
          updatedAt: new Date(now).toISOString(),
        })
        .where(
          and(
            eq(gardenPlots.id, r.id),
            eq(gardenPlots.stage, r.stage),
            eq(gardenPlots.stageStartedAt, r.stageStartedAt)
          )
        )
        .run();
      r.stage = g.stage;
      r.stageStartedAt = nextStartedAt;
      r.waterCount = g.waterCount;
    }
    return {
      id: r.id,
      slot: r.slot,
      species: r.species,
      stage: g.stage,
      stageStartedAt: new Date(g.stageStartedAt).toISOString(),
      waterCount: g.waterCount,
      nickname: r.nickname,
      plantedAt: r.plantedAt,
      remainingMs: g.remainingMs,
    };
  });

  ensureStarterItems(user!.id, childId);

  return NextResponse.json({
    plots,
    items: readItems(user!.id, childId),
    now,
    capacity: PLOT_CAPACITY,
  });
}

// POST 种植：消耗一颗种子，占一个空格
export async function POST(req: NextRequest) {
  const { user, denied } = await requirePerm("garden-plots", "create", req);
  if (denied) return denied;

  const body = await req.json();
  const childId = Number(body.childId);
  const slot = Number(body.slot);
  const species = String(body.species || "");
  if (!childId || !Number.isInteger(slot) || slot < 0 || slot >= PLOT_CAPACITY || !SPECIES[species]) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const key = seedKey(species);

  const result = db.transaction((tx) => {
    const seed = tx
      .select()
      .from(gardenItems)
      .where(
        and(
          eq(gardenItems.userId, user!.id),
          eq(gardenItems.childId, childId),
          eq(gardenItems.itemKey, key)
        )
      )
      .get();
    if (!seed || seed.count < 1) return { error: "种子不够啦，先去练一轮吧" };

    const occupied = tx
      .select({ id: gardenPlots.id })
      .from(gardenPlots)
      .where(
        and(
          eq(gardenPlots.userId, user!.id),
          eq(gardenPlots.childId, childId),
          eq(gardenPlots.slot, slot)
        )
      )
      .get();
    if (occupied) return { error: "这个格子已经种了东西" };

    tx.update(gardenItems)
      .set({ count: seed.count - 1, updatedAt: now })
      .where(eq(gardenItems.id, seed.id))
      .run();

    const row = tx
      .insert(gardenPlots)
      .values({
        userId: user!.id,
        childId,
        slot,
        species,
        stage: 0,
        plantedAt: now,
        stageStartedAt: now,
        waterCount: 0,
        nickname: "",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return { row };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.row, { status: 201 });
}
