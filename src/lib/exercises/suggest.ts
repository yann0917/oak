import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { exercises } from "@/db/schema";

/**
 * 「今天练什么」：纯随机（不烧 AI）。
 * - mode=single：抽 1 个动作
 * - mode=plan：抽 4-6 个动作组成小课表；未指定部位时优先跨部位去重
 */

export interface TrainPick {
  id: number;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  image: string;
  gif: string;
}

export interface TrainResult {
  mode: "single" | "plan";
  picks: TrainPick[];
  note?: string;
}

const SELECT_COLS = {
  id: exercises.id,
  name: exercises.name,
  bodyPart: exercises.bodyPart,
  equipment: exercises.equipment,
  target: exercises.target,
  image: exercises.image,
  gif: exercises.gif,
};

function filters(bodyPart?: string, equipment?: string) {
  const conds = [];
  if (bodyPart) conds.push(eq(exercises.bodyPart, bodyPart));
  if (equipment) conds.push(eq(exercises.equipment, equipment));
  return conds.length ? and(...conds) : undefined;
}

export function suggestWorkout(opts: { bodyPart?: string; equipment?: string; mode?: string }): TrainResult {
  const mode: "single" | "plan" = opts.mode === "single" ? "single" : "plan";
  const where = filters(opts.bodyPart, opts.equipment);

  const pool = db.select(SELECT_COLS).from(exercises).where(where).orderBy(sql`RANDOM()`).limit(80).all();
  if (!pool.length) {
    return { mode, picks: [], note: "健身馆还是空的，请先同步动作库" };
  }

  if (mode === "single") {
    return { mode, picks: [pool[0]] };
  }

  // 课表：4-6 个；无部位筛选时尽量覆盖不同 bodyPart
  const want = 4 + Math.floor(Math.random() * 3); // 4~6
  const picks: TrainPick[] = [];
  const usedParts = new Set<string>();

  if (!opts.bodyPart) {
    for (const row of pool) {
      if (picks.length >= want) break;
      if (usedParts.has(row.bodyPart) && picks.length < Math.min(4, pool.length)) continue;
      picks.push(row);
      usedParts.add(row.bodyPart);
    }
  }
  for (const row of pool) {
    if (picks.length >= want) break;
    if (picks.some((p) => p.id === row.id)) continue;
    picks.push(row);
  }

  return { mode, picks };
}
