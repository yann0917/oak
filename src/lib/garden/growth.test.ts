import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_MS,
  MAX_WATER_PER_STAGE,
  stageDuration,
  advance,
  water,
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
