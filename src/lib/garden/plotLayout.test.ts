import { test } from "node:test";
import assert from "node:assert/strict";
import { PLOT_CAPACITY, TILE, slotToPosition, positionToSlot, nextFreeSlot } from "./plotLayout";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("slotToPosition / positionToSlot 互为逆运算", () => {
  for (let s = 0; s < PLOT_CAPACITY; s++) {
    const { x, z } = slotToPosition(s);
    assert.equal(positionToSlot(x, z), s);
  }
});

test("地块四角对称分布", () => {
  const a = slotToPosition(0);
  const b = slotToPosition(PLOT_CAPACITY - 1);
  assert.ok(near(a.x, -3) && near(a.z, -3));
  assert.ok(near(b.x, 3) && near(b.z, 3));
  assert.ok(near(TILE, 1.2));
});

test("positionToSlot：地块外返回 null", () => {
  assert.equal(positionToSlot(100, 0), null);
  assert.equal(positionToSlot(0, -100), null);
});

test("nextFreeSlot：取最小空格", () => {
  assert.equal(nextFreeSlot([]), 0);
  assert.equal(nextFreeSlot([0, 1, 3]), 2);
});

test("nextFreeSlot：满了返回 null", () => {
  const all = Array.from({ length: PLOT_CAPACITY }, (_, i) => i);
  assert.equal(nextFreeSlot(all), null);
});
