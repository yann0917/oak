// 花园生长：阶段推进与浇水加速（纯函数、无副作用，可单测）
// 全程 24h：幼苗 2h · 成长 4h · 花苞 6h · 开花 6h · 结果 6h

export type Stage = 0 | 1 | 2 | 3 | 4;

/** 各阶段基础时长（毫秒） */
export const STAGE_MS: readonly number[] = [2, 4, 6, 6, 6].map((h) => h * 3600_000);

/** 每次浇水缩短当前阶段 2 小时 */
export const WATER_BONUS_MS = 2 * 3600_000;

/** 每个阶段最多浇 3 次 */
export const MAX_WATER_PER_STAGE = 3;

export interface GrowthState {
  stage: Stage;
  /** 当前阶段的起点（epoch 毫秒） */
  stageStartedAt: number;
  /** 当前阶段已浇水次数 */
  waterCount: number;
}

export interface GrowthResult extends GrowthState {
  /** 是否发生了阶段推进（调用方据此决定是否写库） */
  changed: boolean;
  /** 距离下一阶段还差多少毫秒；已到结果阶段为 0 */
  remainingMs: number;
}

/** 当前阶段的净时长（扣掉浇水减免，下限 0） */
export function stageDuration(stage: Stage, waterCount: number): number {
  return Math.max(0, (STAGE_MS[stage] ?? 0) - waterCount * WATER_BONUS_MS);
}

/** 按服务端当前时间推进阶段，可能一次跨多个阶段 */
export function advance(state: GrowthState, now: number): GrowthResult {
  let stage = state.stage;
  let stageStartedAt = state.stageStartedAt;
  let waterCount = state.waterCount;
  let changed = false;

  while (stage < 4) {
    const need = stageDuration(stage, waterCount);
    if (now - stageStartedAt < need) break;
    stage = (stage + 1) as Stage;
    stageStartedAt += need;
    waterCount = 0;
    changed = true;
  }

  const remainingMs =
    stage >= 4
      ? 0
      : // 上限封顶在当前阶段净时长：stageStartedAt 被写成未来时间时 now - stageStartedAt 为负，
        // 不封顶会算出比阶段总时长还大的剩余时间（前端"还要 X 小时"随之虚高）
        Math.min(
          stageDuration(stage, waterCount),
          Math.max(0, stageDuration(stage, waterCount) - (now - stageStartedAt))
        );
  return { stage, stageStartedAt, waterCount, changed, remainingMs };
}

/**
 * 距离结果（可收获）还差多少毫秒：当前阶段剩余 + 之后各阶段的基础时长。
 * 与 advance().remainingMs（只算到下一阶段）不同，浇水会让阶段提前推进，
 * 但到成熟的总时长只会减少——信息卡用它显示"还要 X 小时"才不会因为浇水变大。
 * 后续阶段按未浇水计算：浇水次数在阶段推进时清零。
 */
export function remainingToRipe(state: GrowthState, now: number): number {
  let stage = state.stage;
  let stageStartedAt = state.stageStartedAt;
  let waterCount = state.waterCount;

  while (stage < 4) {
    const need = stageDuration(stage, waterCount);
    const left = need - (now - stageStartedAt);
    if (left > 0) {
      let total = left;
      for (let s = stage + 1; s < 4; s++) total += STAGE_MS[s];
      return total;
    }
    // 当前阶段已走完（调用方漏了 advance 时的兜底）：继续算下一阶段
    stageStartedAt += need;
    stage = (stage + 1) as Stage;
    waterCount = 0;
  }
  return 0;
}

/** 浇水：返回新状态；阶段已结果或次数用尽时返回 null */
export function water(state: GrowthState): GrowthState | null {
  if (state.stage >= 4) return null;
  if (state.waterCount >= MAX_WATER_PER_STAGE) return null;
  return { ...state, waterCount: state.waterCount + 1 };
}
