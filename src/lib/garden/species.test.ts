import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIVITY_KEYS, GAME_KEYS } from "./types";
import { SPECIES, ACTIVITY_SPECIES, DEFAULT_SPECIES, speciesForActivity, speciesMeta } from "./species";

test("所有活动都有物种映射，且映射到的物种都存在", () => {
  for (const k of [...ACTIVITY_KEYS, ...GAME_KEYS]) {
    const s = ACTIVITY_SPECIES[k];
    assert.ok(s, `活动 ${k} 缺少物种映射`);
    assert.ok(SPECIES[s], `活动 ${k} 映射到不存在的物种 ${s}`);
  }
});

test("未知活动回退到默认物种", () => {
  assert.equal(speciesForActivity("not-a-real-activity"), DEFAULT_SPECIES);
});

test("speciesMeta：未知 key 回退，且始终返回有效元数据", () => {
  const m = speciesMeta("not-a-real-species");
  assert.equal(m.key, DEFAULT_SPECIES);
  assert.ok(m.name.length > 0);
  assert.ok(m.file.length > 0);
  assert.ok(m.height > 0);
});
