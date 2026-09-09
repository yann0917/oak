import { test } from "node:test";
import assert from "node:assert/strict";
import { partTransforms } from "./plantVisual";

test("幼苗与成长阶段没有花和果", () => {
  for (const stage of [0, 1]) {
    const v = partTransforms(stage);
    assert.equal(v.flower.visible, false);
    assert.equal(v.fruit.visible, false);
    assert.equal(v.stem.visible, true);
  }
});

test("开花阶段：花全开、无果", () => {
  const v = partTransforms(3);
  assert.equal(v.flower.visible, true);
  assert.equal(v.flower.scale, 1);
  assert.equal(v.flower.opacity, 1);
  assert.equal(v.fruit.visible, false);
});

test("结果阶段：花淡出、果出现", () => {
  const v = partTransforms(4);
  assert.equal(v.flower.opacity < 1, true);
  assert.equal(v.fruit.visible, true);
  assert.equal(v.fruit.scale, 1);
});

test("所有缩放非负", () => {
  for (let stage = 0; stage <= 4; stage++) {
    const v = partTransforms(stage);
    for (const part of [v.stem, v.foliage, v.flower, v.fruit]) {
      assert.ok(part.scale >= 0);
      assert.ok(part.yScale > 0);
    }
  }
});
