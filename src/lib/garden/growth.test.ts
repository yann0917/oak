import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_MS,
  MAX_WATER_PER_STAGE,
  stageDuration,
  advance,
  water,
  remainingToRipe,
  type GrowthState,
} from "./growth";

const H = 3600_000;
const T0 = Date.UTC(2026, 8, 9, 0, 0, 0);

function state(over: Partial<GrowthState> = {}): GrowthState {
  return { stage: 0, stageStartedAt: T0, waterCount: 0, ...over };
}

test("阶段时长：幼苗 2h、成长 4h、花苞 6h、开花 6h、结果 6h", () => {
  assert.deepEqual([...STAGE_MS], [2 * H, 4 * H, 6 * H, 6 * H, 6 * H]);
});

test("stageDuration：浇水每次减免 2h，且不为负", () => {
  assert.equal(stageDuration(0, 0), 2 * H);
  assert.equal(stageDuration(0, 1), 0);
  assert.equal(stageDuration(2, 3), 0);
  assert.equal(stageDuration(2, 0), 6 * H);
});

test("advance：时间不够时原地不动", () => {
  const r = advance(state(), T0 + 1 * H);
  assert.equal(r.stage, 0);
  assert.equal(r.changed, false);
  assert.equal(r.remainingMs, 1 * H);
});

test("advance：刚好到点推进一个阶段，余数保留", () => {
  const r = advance(state(), T0 + 3 * H);
  assert.equal(r.stage, 1);
  assert.equal(r.changed, true);
  assert.equal(r.stageStartedAt, T0 + 2 * H);
  assert.equal(r.remainingMs, 3 * H);
});

test("advance：一次跨多个阶段", () => {
  const r = advance(state(), T0 + 13 * H);
  assert.equal(r.stage, 3);
  assert.equal(r.changed, true);
  assert.equal(r.remainingMs, 5 * H);
});

test("advance：封顶在结果阶段，不再推进", () => {
  const r = advance(state(), T0 + 1000 * H);
  assert.equal(r.stage, 4);
  assert.equal(r.remainingMs, 0);
  const again = advance(r, r.stageStartedAt + 100 * H);
  assert.equal(again.stage, 4);
  assert.equal(again.changed, false);
});

test("advance：stageStartedAt 在未来（时钟回拨）时 remainingMs 封顶在本阶段时长", () => {
  // 成长阶段净时长 4h，起点在未来 10h：不封顶会算出 14h
  const future = state({ stage: 1, stageStartedAt: T0 + 10 * H });
  const r = advance(future, T0);
  assert.equal(r.stage, 1);
  assert.equal(r.changed, false);
  assert.equal(r.remainingMs, stageDuration(1, 0));
  // 浇水过的阶段同样按净时长封顶
  const wateredFuture = state({ stage: 2, waterCount: 1, stageStartedAt: T0 + 5 * H });
  const w = advance(wateredFuture, T0);
  assert.equal(w.remainingMs, stageDuration(2, 1));
});

test("advance：浇水减免会提前推进", () => {
  const r = advance(state({ waterCount: 1 }), T0);
  assert.equal(r.stage, 1);
  assert.equal(r.changed, true);
});

test("advance：推进后浇水次数清零", () => {
  const r = advance(state({ waterCount: 2 }), T0 + 10 * H);
  assert.equal(r.stage, 3);
  assert.equal(r.waterCount, 0);
});

test("water：每次 +1，达到上限返回 null", () => {
  let s = state();
  for (let i = 0; i < MAX_WATER_PER_STAGE; i++) {
    const next = water(s);
    assert.ok(next);
    s = next;
  }
  assert.equal(s.waterCount, MAX_WATER_PER_STAGE);
  assert.equal(water(s), null);
});

test("water：结果阶段不能再浇", () => {
  assert.equal(water(state({ stage: 4 })), null);
});

test("remainingToRipe：当前阶段剩余 + 之后各阶段基础时长（结果阶段 0）", () => {
  assert.equal(remainingToRipe(state(), T0), 18 * H); // 2+4+6+6
  assert.equal(remainingToRipe(state(), T0 + 1 * H), 17 * H);
  assert.equal(remainingToRipe(state({ stage: 2, waterCount: 1 }), T0 + 1 * H), 9 * H); // 4-1+6
  assert.equal(remainingToRipe(state({ stage: 4 }), T0 + 100 * H), 0);
});

test("remainingToRipe：浇水后只会变小（阶段提前推进但总量减少）", () => {
  const before = state();
  const r0 = remainingToRipe(before, T0);
  // 浇一次水：幼苗阶段净时长被减到 0，服务端 advance 直接推进到成长阶段
  const watered = water(before)!;
  const advanced = advance({ ...before, ...watered }, T0);
  assert.equal(advanced.stage, 1);
  const r1 = remainingToRipe(
    { stage: advanced.stage, stageStartedAt: advanced.stageStartedAt, waterCount: advanced.waterCount },
    T0
  );
  assert.equal(r1, 16 * H);
  assert.ok(r1 < r0, `浇水后 ${r1} 应小于 ${r0}`);
});

test("remainingToRipe：now 已越过当前阶段时兜底继续往后算", () => {
  // 调用方漏了 advance：stage 0 起点 T0，现在已是 T0+3h（应推进到 stage 1 的 1h 处）
  assert.equal(remainingToRipe(state(), T0 + 3 * H), 15 * H); // 4-1+6+6
});
