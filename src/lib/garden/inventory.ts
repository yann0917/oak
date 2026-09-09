// 花园库存：水滴 / 种子 / 果实。键与常量集中在这里。
// 注意：事务内的增删必须内联（drizzle 的 tx 不能传给接受 typeof db 的函数），
// 本文件只放非事务的只读查询与引导初始化。
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gardenItems } from "@/db/schema";

export const WATER = "water";
export const seedKey = (species: string) => `seed:${species}`;
export const fruitKey = (species: string) => `fruit:${species}`;

/** 首次进入花园的引导库存 */
export const STARTER_SEED_SPECIES = "daisy";
export const STARTER_SEED_COUNT = 1;
export const STARTER_WATER_COUNT = 3;

/** 每完成一轮练习的产出 */
export const SEED_PER_SESSION = 1;
export const WATER_PER_SESSION = 2;

export function readItems(userId: number, childId: number) {
  return db
    .select({ itemKey: gardenItems.itemKey, count: gardenItems.count })
    .from(gardenItems)
    .where(and(eq(gardenItems.userId, userId), eq(gardenItems.childId, childId)))
    .all();
}

/** 首次进入花园时赠送引导库存；已初始化过的不再赠送 */
export function ensureStarterItems(userId: number, childId: number) {
  const any = db
    .select({ id: gardenItems.id })
    .from(gardenItems)
    .where(and(eq(gardenItems.userId, userId), eq(gardenItems.childId, childId)))
    .get();
  if (any) return;

  const now = new Date().toISOString();
  db.insert(gardenItems)
    .values([
      { userId, childId, itemKey: seedKey(STARTER_SEED_SPECIES), count: STARTER_SEED_COUNT, createdAt: now, updatedAt: now },
      { userId, childId, itemKey: WATER, count: STARTER_WATER_COUNT, createdAt: now, updatedAt: now },
    ])
    .run();
}

/** 事务类型：drizzle 的 tx 不能赋给 typeof db（缺 $client），单独提取 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 事务内自增库存（可为负）。
 * 种植扣种子、浇水扣水滴、收获加果实、练习产出都用它，必须在调用方的事务里执行。
 */
export function bumpItem(
  tx: Tx,
  userId: number,
  childId: number,
  key: string,
  delta: number,
  nowIso: string
) {
  const existing = tx
    .select()
    .from(gardenItems)
    .where(
      and(
        eq(gardenItems.userId, userId),
        eq(gardenItems.childId, childId),
        eq(gardenItems.itemKey, key)
      )
    )
    .get();
  if (existing) {
    tx.update(gardenItems)
      .set({ count: Math.max(0, existing.count + delta), updatedAt: nowIso })
      .where(eq(gardenItems.id, existing.id))
      .run();
  } else {
    tx.insert(gardenItems)
      .values({
        userId,
        childId,
        itemKey: key,
        count: Math.max(0, delta),
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();
  }
}
