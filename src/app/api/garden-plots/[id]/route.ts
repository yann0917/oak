import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gardenItems, gardenPlots } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { advance, water, type Stage } from "@/lib/garden/growth";
import { PLOT_CAPACITY } from "@/lib/garden/plotLayout";
import { WATER, bumpItem, fruitKey } from "@/lib/garden/inventory";

const MAX_NICKNAME = 12;

// PUT 花园操作：water / harvest / rename / move
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requirePerm("garden-plots", "update", req);
  if (denied) return denied;

  const { id } = await ctx.params;
  const plotId = Number(id);
  if (!Number.isInteger(plotId)) {
    return NextResponse.json({ error: "无效的地块 id" }, { status: 400 });
  }

  const body = await req.json();
  const action = String(body.action || "");
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const result = db.transaction((tx) => {
    const row = tx
      .select()
      .from(gardenPlots)
      .where(and(eq(gardenPlots.id, plotId), eq(gardenPlots.userId, user!.id)))
      .get();
    if (!row) return { error: "地块不存在", status: 404 };

    const grown = advance(
      {
        stage: row.stage as Stage,
        stageStartedAt: Date.parse(row.stageStartedAt),
        waterCount: row.waterCount,
      },
      now
    );

    if (action === "harvest") {
      if (grown.stage < 4) return { error: "还没结果呢，再等等吧", status: 400 };
      tx.delete(gardenPlots).where(eq(gardenPlots.id, row.id)).run();
      bumpItem(tx, user!.id, row.childId, fruitKey(row.species), 1, nowIso);
      bumpItem(tx, user!.id, row.childId, WATER, 1, nowIso);
      return { ok: true, harvested: row.species };
    }

    if (action === "water") {
      const watered = water({
        stage: grown.stage,
        stageStartedAt: grown.stageStartedAt,
        waterCount: grown.waterCount,
      });
      if (!watered) return { error: "这株现在不用浇水啦", status: 400 };

      const drop = tx
        .select()
        .from(gardenItems)
        .where(
          and(
            eq(gardenItems.userId, user!.id),
            eq(gardenItems.childId, row.childId),
            eq(gardenItems.itemKey, WATER)
          )
        )
        .get();
      if (!drop || drop.count < 1) return { error: "水滴不够啦，先去练一轮吧", status: 400 };

      tx.update(gardenItems)
        .set({ count: drop.count - 1, updatedAt: nowIso })
        .where(eq(gardenItems.id, drop.id))
        .run();
      tx.update(gardenPlots)
        .set({
          stage: watered.stage,
          stageStartedAt: new Date(watered.stageStartedAt).toISOString(),
          waterCount: watered.waterCount,
          updatedAt: nowIso,
        })
        .where(eq(gardenPlots.id, row.id))
        .run();
      return { ok: true };
    }

    if (action === "rename") {
      const nickname = String(body.nickname ?? "").trim().slice(0, MAX_NICKNAME);
      tx.update(gardenPlots)
        .set({ nickname, updatedAt: nowIso })
        .where(eq(gardenPlots.id, row.id))
        .run();
      return { ok: true };
    }

    if (action === "move") {
      const slot = Number(body.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= PLOT_CAPACITY) {
        return { error: "无效的格子", status: 400 };
      }
      if (slot === row.slot) return { ok: true };
      const occupied = tx
        .select({ id: gardenPlots.id })
        .from(gardenPlots)
        .where(
          and(
            eq(gardenPlots.userId, user!.id),
            eq(gardenPlots.childId, row.childId),
            eq(gardenPlots.slot, slot)
          )
        )
        .get();
      if (occupied) return { error: "这个格子已经种了东西", status: 400 };
      tx.update(gardenPlots)
        .set({ slot, updatedAt: nowIso })
        .where(eq(gardenPlots.id, row.id))
        .run();
      return { ok: true };
    }

    return { error: "未知操作", status: 400 };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }
  return NextResponse.json(result);
}
