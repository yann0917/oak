# 可交互 3D 小花园 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在学习园地新增第一个 Tab「我的花园」——用 three.js 渲染一座低多边形 3D 花园，孩子在练习中获得种子与水滴，种植、浇水、等待生长、收获果实、重新栽种。

**Architecture:** 植物模型由 Blender 脚本参数化生成为 GLB 构件（stem/foliage/flower/fruit），生长阶段由 three.js 用缩放与显隐组合，不为每个阶段单独导模型。生长按服务端时间**惰性推进**（不引入后台调度），数据分派生层（`garden_records` 只读）与覆盖层（新增 `garden_plots` / `garden_items` 两表）。three.js 与 GLB 只在切到花园 Tab 时懒加载。

**Tech Stack:** Next.js 16（App Router）/ React 19 / TypeScript / Drizzle + better-sqlite3 / three.js 0.186 / Blender 5.2 + glTF 导出器 / Node 内置 test runner（`node --import tsx --test`，零新增测试依赖）

**Spec:** `docs/superpowers/specs/2026-09-09-interactive-3d-garden-design.md`

## Global Constraints

- 所有新表都带 `user_id` + `child_id` 双条件隔离，沿用现有写法。
- 时间判定一律用**服务端时间**，客户端时间不参与任何判定。
- 数据库迁移写在 `src/db/index.ts` 的内嵌 DDL 里（`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`），部署自动执行；不要引入 drizzle-kit 迁移文件。
- 权限点由 `scripts/gen-api-perms.mjs` 自动生成：集合路由只映射 `GET→list` / `POST→create`，`[id]` 子路由映射 `GET→detail` / `PUT→update` / `DELETE→delete`。**集合路由上的 PATCH/PUT 不会生成权限点**，所以操作类接口必须走 `[id]` 的 PUT。
- 事务内不要调用接受 `typeof db` 的辅助函数——drizzle 的 `tx` 缺 `$client`，类型不兼容（已实测）。事务逻辑像 `src/app/api/garden-records/route.ts` 那样内联。
- 测试文件命名 `*.test.ts`，与源码同目录；测试命令 `npm test`。
- 测试内 import 用**无扩展名**（`./growth`），与 tsconfig `moduleResolution: "bundler"` 一致。
- 孩子侧文案不依赖识字（守住「幼儿园功能须不依赖识字」）：状态反馈用图形 + TTS。
- 提交信息用中文，遵循仓库现有 `feat(scope): ...` 风格。

---

## 文件结构

**新建**

| 路径 | 职责 |
|---|---|
| `src/lib/garden/growth.ts` | 阶段推进、浇水加速、剩余时间（纯函数） |
| `src/lib/garden/growth.test.ts` | 上述纯函数单测 |
| `src/lib/garden/species.ts` | 物种表 + 活动→物种映射（单一来源） |
| `src/lib/garden/species.test.ts` | 映射完整性单测 |
| `src/lib/garden/plotLayout.ts` | 格号 ↔ 3D 坐标、空格查找（纯函数） |
| `src/lib/garden/plotLayout.test.ts` | 布局单测 |
| `src/lib/garden/plantVisual.ts` | 阶段 → 构件外观变换（纯函数） |
| `src/lib/garden/plantVisual.test.ts` | 外观变换单测 |
| `src/lib/garden/inventory.ts` | 库存键与常量、只读查询、引导库存初始化 |
| `scripts/blender/gen-garden-plants.py` | 参数化生成植物构件并导出 GLB |
| `public/models/garden/*.glb` | 8 个物种的构件资产（脚本产物，入库） |
| `src/app/api/garden-plots/route.ts` | GET 花园状态（惰性推进）+ POST 种植 |
| `src/app/api/garden-plots/[id]/route.ts` | PUT 浇水 / 收获 / 改名 / 挪位 |
| `src/components/garden/GardenScene3D.tsx` | three.js 场景（懒加载） |
| `src/components/garden/GardenTab.tsx` | 花园 Tab 外壳（库存栏 + 场景 + 降级） |

**修改**

| 路径 | 改动 |
|---|---|
| `package.json` | 加 `test` 脚本；加 three 依赖 |
| `src/db/index.ts` | 内嵌 DDL 增加两表与索引 |
| `src/db/schema.ts` | 增加 `gardenPlots` / `gardenItems` drizzle 定义 |
| `src/app/api/garden-records/route.ts` | 提交练习时在同一事务里产出种子与水滴 |
| `src/components/garden/GardenHome.tsx` | 新增第一个 Tab「我的花园」 |

---

## Task 1: 测试基建 + `growth.ts` 纯函数

**Files:**
- Modify: `package.json`（scripts）
- Create: `src/lib/garden/growth.ts`
- Test: `src/lib/garden/growth.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `type Stage = 0 | 1 | 2 | 3 | 4`
  - `STAGE_MS: readonly number[]`、`WATER_BONUS_MS: number`、`MAX_WATER_PER_STAGE: number`
  - `interface GrowthState { stage: Stage; stageStartedAt: number; waterCount: number }`
  - `interface GrowthResult extends GrowthState { changed: boolean; remainingMs: number }`
  - `stageDuration(stage: Stage, waterCount: number): number`
  - `advance(state: GrowthState, now: number): GrowthResult`
  - `water(state: GrowthState): GrowthState | null`

- [ ] **Step 1: 加测试脚本**

`package.json` 的 `scripts` 里，在 `"lint"` 之后加一行：

```json
    "test": "node --import tsx --test \"src/**/*.test.ts\"",
```

- [ ] **Step 2: 写失败的测试**

创建 `src/lib/garden/growth.test.ts`：

```ts
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
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm test`
Expected: FAIL —— `Cannot find module './growth'`

- [ ] **Step 4: 实现 `growth.ts`**

创建 `src/lib/garden/growth.ts`：

```ts
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
    stage >= 4 ? 0 : Math.max(0, stageDuration(stage, waterCount) - (now - stageStartedAt));
  return { stage, stageStartedAt, waterCount, changed, remainingMs };
}

/** 浇水：返回新状态；阶段已结果或次数用尽时返回 null */
export function water(state: GrowthState): GrowthState | null {
  if (state.stage >= 4) return null;
  if (state.waterCount >= MAX_WATER_PER_STAGE) return null;
  return { ...state, waterCount: state.waterCount + 1 };
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test`
Expected: PASS，10 个测试全绿

- [ ] **Step 6: 提交**

```bash
git add package.json src/lib/garden/growth.ts src/lib/garden/growth.test.ts
git commit -m "feat(garden): 花园生长阶段推进与浇水加速纯函数 + 零依赖测试基建"
```

---

## Task 2: 物种表、地块布局、阶段外观（纯函数）

**Files:**
- Create: `src/lib/garden/species.ts`
- Create: `src/lib/garden/plotLayout.ts`
- Create: `src/lib/garden/plantVisual.ts`
- Test: `src/lib/garden/species.test.ts`
- Test: `src/lib/garden/plotLayout.test.ts`
- Test: `src/lib/garden/plantVisual.test.ts`

**Interfaces:**
- Consumes: `ActivityKey` / `GameKey` / `ACTIVITY_KEYS` / `GAME_KEYS`（来自 `./types`）
- Produces:
  - `SPECIES: Record<string, SpeciesMeta>`、`DEFAULT_SPECIES = "daisy"`
  - `interface SpeciesMeta { key: string; name: string; emoji: string; file: string; height: number }`
  - `ACTIVITY_SPECIES: Record<ActivityKey | GameKey, string>`
  - `speciesForActivity(activity: string): string`、`speciesMeta(key: string): SpeciesMeta`
  - `PLOT_COLS = 6`、`PLOT_ROWS = 6`、`PLOT_CAPACITY = 36`、`TILE = 1.2`
  - `slotToPosition(slot: number): { x: number; z: number }`
  - `positionToSlot(x: number, z: number): number | null`
  - `nextFreeSlot(taken: number[]): number | null`
  - `interface PartTransform { visible: boolean; scale: number; yScale: number; opacity: number }`
  - `interface PlantVisual { stem: PartTransform; foliage: PartTransform; flower: PartTransform; fruit: PartTransform }`
  - `partTransforms(stage: number): PlantVisual`

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/garden/species.test.ts`：

```ts
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
```

创建 `src/lib/garden/plotLayout.test.ts`：

```ts
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
```

创建 `src/lib/garden/plantVisual.test.ts`：

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL —— `Cannot find module './species'` 等

- [ ] **Step 3: 实现三个模块**

创建 `src/lib/garden/species.ts`：

```ts
// 花园物种表：活动 → 物种的唯一映射来源
import type { ActivityKey, GameKey } from "./types";

export interface SpeciesMeta {
  key: string;
  /** 中文名（气泡与 TTS 用） */
  name: string;
  emoji: string;
  /** 构件 GLB 文件名（不含扩展名），对应 public/models/garden/<file>.glb */
  file: string;
  /** 成株高度（米），three.js 里按格子缩放用 */
  height: number;
}

export const SPECIES: Record<string, SpeciesMeta> = {
  bamboo: { key: "bamboo", name: "竹子", emoji: "🎋", file: "bamboo", height: 1.2 },
  sunflower: { key: "sunflower", name: "向日葵", emoji: "🌻", file: "sunflower", height: 1.0 },
  bluebell: { key: "bluebell", name: "风铃草", emoji: "🪻", file: "bluebell", height: 0.6 },
  tulip: { key: "tulip", name: "郁金香", emoji: "🌷", file: "tulip", height: 0.6 },
  plum: { key: "plum", name: "梅树", emoji: "🌸", file: "plum", height: 1.2 },
  hydrangea: { key: "hydrangea", name: "绣球", emoji: "💠", file: "hydrangea", height: 0.7 },
  osmanthus: { key: "osmanthus", name: "桂花树", emoji: "🌼", file: "osmanthus", height: 1.1 },
  daisy: { key: "daisy", name: "雏菊", emoji: "🌼", file: "daisy", height: 0.5 },
};

export const DEFAULT_SPECIES = "daisy";

/** 活动 → 物种（多对一）；未知活动回退到雏菊 */
export const ACTIVITY_SPECIES: Record<ActivityKey | GameKey, string> = {
  characters: "bamboo",
  words: "bamboo",
  math: "sunflower",
  pinyin: "bluebell",
  letters: "tulip",
  poems: "plum",
  colors: "hydrangea",
  idioms: "osmanthus",
  "fruit-slice": "daisy",
  "gesture-magic": "daisy",
  "gesture-dance": "daisy",
  "rock-paper-scissors": "daisy",
  "bubble-pop": "daisy",
  "jump-score": "daisy",
  "magic-wand": "daisy",
  "traffic-commander": "daisy",
};

export function speciesForActivity(activity: string): string {
  return ACTIVITY_SPECIES[activity as ActivityKey | GameKey] ?? DEFAULT_SPECIES;
}

export function speciesMeta(key: string): SpeciesMeta {
  return SPECIES[key] ?? SPECIES[DEFAULT_SPECIES];
}
```

创建 `src/lib/garden/plotLayout.ts`：

```ts
// 花园地块布局：格号 ↔ 3D 坐标（纯函数）
export const PLOT_COLS = 6;
export const PLOT_ROWS = 6;
export const PLOT_CAPACITY = PLOT_COLS * PLOT_ROWS;
/** 每格边长（米） */
export const TILE = 1.2;

/** 格号 → 以地块中心为原点的平面坐标 */
export function slotToPosition(slot: number): { x: number; z: number } {
  const col = slot % PLOT_COLS;
  const row = Math.floor(slot / PLOT_COLS);
  return {
    x: (col - (PLOT_COLS - 1) / 2) * TILE,
    z: (row - (PLOT_ROWS - 1) / 2) * TILE,
  };
}

/** 平面坐标 → 最近的格号；超出地块范围返回 null */
export function positionToSlot(x: number, z: number): number | null {
  const col = Math.round(x / TILE + (PLOT_COLS - 1) / 2);
  const row = Math.round(z / TILE + (PLOT_ROWS - 1) / 2);
  if (col < 0 || col >= PLOT_COLS || row < 0 || row >= PLOT_ROWS) return null;
  return row * PLOT_COLS + col;
}

/** 取最小的空格号；已满返回 null */
export function nextFreeSlot(taken: number[]): number | null {
  const used = new Set(taken);
  for (let i = 0; i < PLOT_CAPACITY; i++) if (!used.has(i)) return i;
  return null;
}
```

创建 `src/lib/garden/plantVisual.ts`：

```ts
// 阶段 → 构件外观（纯函数，调参集中在这里）
export interface PartTransform {
  visible: boolean;
  scale: number;
  yScale: number;
  opacity: number;
}

export interface PlantVisual {
  stem: PartTransform;
  foliage: PartTransform;
  flower: PartTransform;
  fruit: PartTransform;
}

const HIDDEN: PartTransform = { visible: false, scale: 0, yScale: 1, opacity: 0 };
const shown = (scale: number, yScale = 1, opacity = 1): PartTransform => ({
  visible: true,
  scale,
  yScale,
  opacity,
});

/** stage 0 幼苗 1 成长 2 花苞 3 开花 4 结果 */
export function partTransforms(stage: number): PlantVisual {
  switch (stage) {
    case 0:
      return { stem: shown(0.35), foliage: shown(0.45), flower: HIDDEN, fruit: HIDDEN };
    case 1:
      return { stem: shown(0.75), foliage: shown(0.85), flower: HIDDEN, fruit: HIDDEN };
    case 2:
      return { stem: shown(1), foliage: shown(1), flower: shown(0.45), fruit: HIDDEN };
    case 3:
      return { stem: shown(1), foliage: shown(1), flower: shown(1), fruit: HIDDEN };
    default:
      return { stem: shown(1), foliage: shown(1), flower: shown(0.6, 1, 0.35), fruit: shown(1) };
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: PASS，全部测试绿

- [ ] **Step 5: 提交**

```bash
git add src/lib/garden/species.ts src/lib/garden/species.test.ts \
        src/lib/garden/plotLayout.ts src/lib/garden/plotLayout.test.ts \
        src/lib/garden/plantVisual.ts src/lib/garden/plantVisual.test.ts
git commit -m "feat(garden): 物种表、地块布局与阶段外观纯函数"
```

---

## Task 3: 数据库迁移 + drizzle schema

**Files:**
- Modify: `src/db/index.ts`（内嵌 DDL）
- Modify: `src/db/schema.ts`（追加定义）

**Interfaces:**
- Consumes: 无
- Produces: `gardenPlots`、`gardenItems` 两张表的 drizzle 定义，供后续所有 API 任务使用

- [ ] **Step 1: 加 DDL**

在 `src/db/index.ts` 的大 DDL 块中，紧接 `garden_idiom_stories` 建表语句之后（约第 346 行 `);` 之后）插入：

```sql
-- 可交互 3D 小花园：格子状态（收获即删除本行）
CREATE TABLE IF NOT EXISTS garden_plots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  child_id INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  species TEXT NOT NULL,
  stage INTEGER NOT NULL DEFAULT 0,
  planted_at TEXT NOT NULL,
  stage_started_at TEXT NOT NULL,
  water_count INTEGER NOT NULL DEFAULT 0,
  nickname TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 可交互 3D 小花园：库存（水滴 / 种子 / 果实）
CREATE TABLE IF NOT EXISTS garden_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  child_id INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

再在索引区（约第 532 行 `idx_garden_idiom_stories_user_word_age` 之后）插入：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_garden_plots_slot ON garden_plots(child_id, slot);
CREATE INDEX IF NOT EXISTS idx_garden_plots_child ON garden_plots(child_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_garden_items_key ON garden_items(child_id, item_key);
```

- [ ] **Step 2: 加 drizzle 定义**

在 `src/db/schema.ts` 的 `gardenIdiomStories` 定义之后追加：

```ts
// 可交互 3D 小花园：格子状态（收获即删除本行）
export const gardenPlots = sqliteTable("garden_plots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  childId: integer("child_id").notNull(),
  slot: integer("slot").notNull(), // 全局格号 0..35
  species: text("species").notNull(),
  stage: integer("stage").notNull().default(0), // 0 幼苗 1 成长 2 花苞 3 开花 4 结果
  plantedAt: text("planted_at").notNull(),
  stageStartedAt: text("stage_started_at").notNull(), // 当前阶段起点（惰性推进依赖）
  waterCount: integer("water_count").notNull().default(0),
  nickname: text("nickname").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 可交互 3D 小花园：库存（item_key = "water" | "seed:<species>" | "fruit:<species>"）
export const gardenItems = sqliteTable("garden_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  childId: integer("child_id").notNull(),
  itemKey: text("item_key").notNull(),
  count: integer("count").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});
```

- [ ] **Step 3: 验证迁移真的执行了**

Run:
```bash
npx tsx -e "import './src/db/index'; import Database from 'better-sqlite3'; const d = new Database('data/oak.db', { readonly: true }); console.log(d.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'garden_%' ORDER BY name\").all());"
```

Expected 输出包含 `garden_items` 与 `garden_plots`：
```
[
  { name: 'garden_characters' },
  { name: 'garden_idiom_stories' },
  { name: 'garden_items' },
  { name: 'garden_mastery' },
  { name: 'garden_plots' },
  { name: 'garden_records' },
  { name: 'garden_settings' }
]
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add src/db/index.ts src/db/schema.ts
git commit -m "feat(garden): 新增 garden_plots / garden_items 两表与索引"
```

---

## Task 4: Blender 生成脚本 + 向日葵单物种

**Files:**
- Create: `scripts/blender/gen-garden-plants.py`
- Create（脚本产物）: `public/models/garden/sunflower.glb`

**Interfaces:**
- Consumes: 无
- Produces: GLB 文件约定——每个物种一个 GLB，内含 4 个命名网格 `stem` / `foliage` / `flower` / `fruit`，根部原点 `(0,0,0)`，Y-up，成株高 0.4–1.2m

- [ ] **Step 1: 写生成脚本（先只放向日葵）**

创建 `scripts/blender/gen-garden-plants.py`：

```python
"""参数化生成花园植物构件并导出 GLB。

用法（headless）：
  blender --background --python scripts/blender/gen-garden-plants.py
也可在 Blender MCP 里用 execute_blender_code 执行本文件内容。

产物：public/models/garden/<species>.glb
约定：每个 GLB 含 4 个命名网格 stem / foliage / flower / fruit，
      根部原点 (0,0,0)，Y-up，成株高 0.4~1.2m。
"""
import bpy
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "models", "garden")
MAX_TRIS_PER_SPECIES = 1000


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def mat(name, rgba, rough=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (rgba[0], rgba[1], rgba[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    return m


def take(name, material):
    o = bpy.context.active_object
    o.name = name
    o.data.materials.clear()
    o.data.materials.append(material)
    return o


def add_cylinder(name, r, h, color, verts=8):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=(0, 0, h / 2))
    return take(name, mat(name + "_m", color))


def add_sphere(name, r, color, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), segs=10, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=r, location=loc)
    o = take(name, mat(name + "_m", color))
    o.scale = scale
    o.rotation_euler = rot
    return o


def join_group(name, objs):
    """把一组对象合并成一个网格，并命名为构件名"""
    objs = [o for o in objs if o]
    if not objs:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.shade_flat()
    return obj


def build_stem(cfg):
    return [add_cylinder("stem", cfg["r"], cfg["h"], cfg["color"], verts=cfg.get("verts", 8))]


def build_foliage(cfg):
    objs = []
    for i in range(cfg["count"]):
        a = i * (2 * math.pi / cfg["count"]) + cfg.get("phase", 0.0)
        r = cfg["radius"]
        objs.append(add_sphere(
            "foliage_%d" % i, cfg["size"], cfg["color"],
            loc=(math.cos(a) * r, math.sin(a) * r, cfg["z"]),
            scale=(1.0, cfg.get("flat", 0.45), cfg.get("thin", 0.3)),
            rot=(0, 0, a),
        ))
    if cfg.get("top"):
        objs.append(add_sphere("foliage_top", cfg["top"]["size"], cfg["color"],
                               loc=(0, 0, cfg["top"]["z"])))
    return objs


def build_flower(cfg):
    objs = [add_sphere("flower_core", cfg["core"], cfg["core_color"], loc=(0, 0, cfg["z"]))]
    for i in range(cfg["petals"]):
        a = i * (2 * math.pi / cfg["petals"])
        objs.append(add_sphere(
            "flower_petal_%d" % i, cfg["petal"], cfg["petal_color"],
            loc=(math.cos(a) * cfg["spread"], math.sin(a) * cfg["spread"], cfg["z"]),
            scale=(1.0, 0.55, cfg.get("petal_thin", 0.3)), rot=(0, 0, a),
        ))
    return objs


def build_fruit(cfg):
    return [add_sphere("fruit", cfg["r"], cfg["color"], loc=(0, 0, cfg["z"]))]


SPECIES = {
    "sunflower": {
        "stem": dict(r=0.035, h=0.95, color=(0.36, 0.55, 0.30)),
        "foliage": dict(count=3, radius=0.10, size=0.16, z=0.42, color=(0.53, 0.76, 0.44),
                        top=dict(size=0.13, z=0.62)),
        "flower": dict(z=1.02, core=0.085, core_color=(0.42, 0.30, 0.18),
                       petal=0.075, petal_color=(0.97, 0.81, 0.40),
                       petals=12, spread=0.11, petal_thin=0.28),
        "fruit": dict(r=0.075, z=0.98, color=(0.45, 0.32, 0.20)),
    },
}


def tri_count(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def build_species(key, cfg):
    reset_scene()
    parts = [
        join_group("stem", build_stem(cfg["stem"])),
        join_group("foliage", build_foliage(cfg["foliage"])),
        join_group("flower", build_flower(cfg["flower"])),
        join_group("fruit", build_fruit(cfg["fruit"])),
    ]
    parts = [p for p in parts if p]
    tris = sum(tri_count(p) for p in parts)
    if tris > MAX_TRIS_PER_SPECIES:
        raise RuntimeError("%s 三角面 %d 超预算 %d" % (key, tris, MAX_TRIS_PER_SPECIES))
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, key + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_apply=True, export_meshopt_compression_enable=True,
    )
    return path, tris


if __name__ == "__main__":
    for key, cfg in SPECIES.items():
        path, tris = build_species(key, cfg)
        print("EXPORTED %s tris=%d bytes=%d" % (path, tris, os.path.getsize(path)))
```

- [ ] **Step 2: 跑脚本导出向日葵**

通过 Blender MCP 执行（`execute_blender_code`，代码内容为 `exec(open("<仓库绝对路径>/scripts/blender/gen-garden-plants.py").read())`），或直接命令行：

```bash
blender --background --python scripts/blender/gen-garden-plants.py
```

Expected: 打印 `EXPORTED .../public/models/garden/sunflower.glb tris=<n> bytes=<n>`，且 `tris <= 1000`

- [ ] **Step 3: 视口确认观感**

在 Blender 里摆好相机与灯光，用 MCP 的 `get_viewport_screenshot` 截图查看这株向日葵。
Expected: 一株可辨认的向日葵（绿茎、绿叶、黄色花瓣、深色花心、棕色果实），扁平低多边形风格。

**这是本任务的人工检查点**：观感不满意就调 `SPECIES["sunflower"]` 里的参数重跑，直到认可为止。

- [ ] **Step 4: 校验产物结构**

Run:
```bash
node -e "const fs=require('fs');const b=fs.readFileSync('public/models/garden/sunflower.glb');const len=b.readUInt32LE(12);const json=JSON.parse(b.subarray(20,20+len).toString());console.log('meshes:',json.meshes.map(m=>m.name));console.log('nodes:',json.nodes.map(n=>n.name));"
```

Expected: `meshes` 与 `nodes` 都包含 `stem`、`foliage`、`flower`、`fruit`

- [ ] **Step 5: 提交**

```bash
git add scripts/blender/gen-garden-plants.py public/models/garden/sunflower.glb
git commit -m "feat(garden): Blender 参数化生成植物构件脚本 + 向日葵资产"
```

---

## Task 5: 批量导出其余 7 个物种

**Files:**
- Modify: `scripts/blender/gen-garden-plants.py`（扩充 `SPECIES`）
- Create（脚本产物）: `public/models/garden/{bamboo,bluebell,tulip,plum,hydrangea,osmanthus,daisy}.glb`

**Interfaces:**
- Consumes: Task 4 的脚本结构
- Produces: 8 个物种的 GLB，文件名与 `species.ts` 的 `file` 字段一一对应

- [ ] **Step 1: 扩充物种参数表**

把 `gen-garden-plants.py` 里的 `SPECIES` 整体替换为：

```python
SPECIES = {
    "sunflower": {
        "stem": dict(r=0.035, h=0.95, color=(0.36, 0.55, 0.30)),
        "foliage": dict(count=3, radius=0.10, size=0.16, z=0.42, color=(0.53, 0.76, 0.44),
                        top=dict(size=0.13, z=0.62)),
        "flower": dict(z=1.02, core=0.085, core_color=(0.42, 0.30, 0.18),
                       petal=0.075, petal_color=(0.97, 0.81, 0.40),
                       petals=12, spread=0.11, petal_thin=0.28),
        "fruit": dict(r=0.075, z=0.98, color=(0.45, 0.32, 0.20)),
    },
    "bamboo": {
        "stem": dict(r=0.045, h=1.15, color=(0.55, 0.72, 0.38), verts=6),
        "foliage": dict(count=5, radius=0.09, size=0.20, z=0.72, color=(0.44, 0.70, 0.38),
                        flat=0.30, thin=0.18),
        "flower": dict(z=1.18, core=0.045, core_color=(0.92, 0.94, 0.72),
                       petal=0.035, petal_color=(0.96, 0.97, 0.82),
                       petals=6, spread=0.055, petal_thin=0.35),
        "fruit": dict(r=0.05, z=1.10, color=(0.62, 0.78, 0.42)),
    },
    "bluebell": {
        "stem": dict(r=0.022, h=0.52, color=(0.42, 0.62, 0.36)),
        "foliage": dict(count=4, radius=0.07, size=0.11, z=0.22, color=(0.52, 0.75, 0.46),
                        flat=0.40, thin=0.22),
        "flower": dict(z=0.56, core=0.035, core_color=(0.72, 0.78, 0.96),
                       petal=0.05, petal_color=(0.66, 0.72, 0.95),
                       petals=5, spread=0.06, petal_thin=0.45),
        "fruit": dict(r=0.035, z=0.50, color=(0.55, 0.60, 0.82)),
    },
    "tulip": {
        "stem": dict(r=0.025, h=0.48, color=(0.40, 0.60, 0.36)),
        "foliage": dict(count=2, radius=0.08, size=0.17, z=0.18, color=(0.50, 0.74, 0.44),
                        flat=0.30, thin=0.20),
        "flower": dict(z=0.56, core=0.05, core_color=(0.90, 0.45, 0.55),
                       petal=0.075, petal_color=(0.94, 0.55, 0.66),
                       petals=4, spread=0.045, petal_thin=0.55),
        "fruit": dict(r=0.04, z=0.50, color=(0.78, 0.42, 0.50)),
    },
    "plum": {
        "stem": dict(r=0.06, h=0.85, color=(0.48, 0.36, 0.28), verts=8),
        "foliage": dict(count=6, radius=0.20, size=0.22, z=0.88, color=(0.62, 0.78, 0.52),
                        flat=0.55, thin=0.45, top=dict(size=0.26, z=1.05)),
        "flower": dict(z=1.02, core=0.05, core_color=(0.86, 0.40, 0.52),
                       petal=0.06, petal_color=(0.97, 0.78, 0.84),
                       petals=8, spread=0.09, petal_thin=0.30),
        "fruit": dict(r=0.06, z=0.98, color=(0.86, 0.42, 0.44)),
    },
    "hydrangea": {
        "stem": dict(r=0.03, h=0.55, color=(0.42, 0.60, 0.38)),
        "foliage": dict(count=4, radius=0.11, size=0.16, z=0.26, color=(0.50, 0.74, 0.48),
                        flat=0.42, thin=0.26),
        "flower": dict(z=0.66, core=0.06, core_color=(0.70, 0.78, 0.94),
                       petal=0.075, petal_color=(0.72, 0.80, 0.96),
                       petals=9, spread=0.10, petal_thin=0.40),
        "fruit": dict(r=0.045, z=0.60, color=(0.60, 0.68, 0.88)),
    },
    "osmanthus": {
        "stem": dict(r=0.055, h=0.80, color=(0.46, 0.35, 0.27), verts=8),
        "foliage": dict(count=6, radius=0.18, size=0.20, z=0.84, color=(0.48, 0.70, 0.44),
                        flat=0.55, thin=0.45, top=dict(size=0.24, z=1.00)),
        "flower": dict(z=0.96, core=0.035, core_color=(0.98, 0.78, 0.32),
                       petal=0.03, petal_color=(0.99, 0.85, 0.46),
                       petals=10, spread=0.06, petal_thin=0.35),
        "fruit": dict(r=0.045, z=0.92, color=(0.72, 0.52, 0.30)),
    },
    "daisy": {
        "stem": dict(r=0.018, h=0.34, color=(0.44, 0.62, 0.38)),
        "foliage": dict(count=3, radius=0.06, size=0.10, z=0.12, color=(0.54, 0.76, 0.46),
                        flat=0.45, thin=0.25),
        "flower": dict(z=0.40, core=0.045, core_color=(0.97, 0.82, 0.36),
                       petal=0.05, petal_color=(0.99, 0.98, 0.94),
                       petals=10, spread=0.065, petal_thin=0.28),
        "fruit": dict(r=0.03, z=0.36, color=(0.82, 0.72, 0.40)),
    },
}
```

- [ ] **Step 2: 批量导出**

Run:
```bash
blender --background --python scripts/blender/gen-garden-plants.py
```

Expected: 打印 8 行 `EXPORTED ... tris=<n> bytes=<n>`，每个 `tris <= 1000`

- [ ] **Step 3: 校验 8 个文件都存在且构件齐全**

Run:
```bash
node -e "
const fs=require('fs');
const want=['bamboo','bluebell','daisy','hydrangea','osmanthus','plum','sunflower','tulip'];
for(const k of want){
  const p='public/models/garden/'+k+'.glb';
  if(!fs.existsSync(p)){console.log('MISSING',p);process.exit(1);}
  const b=fs.readFileSync(p);const len=b.readUInt32LE(12);
  const j=JSON.parse(b.subarray(20,20+len).toString());
  const names=j.nodes.map(n=>n.name).sort().join(',');
  console.log(k.padEnd(10), (b.length/1024).toFixed(1)+'KB', names);
}
"
```

Expected: 8 行，每行构件名为 `foliage,flower,fruit,stem`

- [ ] **Step 4: 提交**

```bash
git add scripts/blender/gen-garden-plants.py public/models/garden
git commit -m "feat(garden): 批量导出 8 个物种的植物构件 GLB"
```

---

## Task 6: 库存模块 + `GET /api/garden-plots`

**Files:**
- Create: `src/lib/garden/inventory.ts`
- Create: `src/app/api/garden-plots/route.ts`

**Interfaces:**
- Consumes: `advance` / `Stage`（Task 1）、`PLOT_CAPACITY`（Task 2）、`gardenPlots` / `gardenItems`（Task 3）
- Produces:
  - `WATER = "water"`、`seedKey(species)`、`fruitKey(species)`
  - `STARTER_SEED_SPECIES`、`STARTER_SEED_COUNT`、`STARTER_WATER_COUNT`、`SEED_PER_SESSION`、`WATER_PER_SESSION`
  - `readItems(userId: number, childId: number): { itemKey: string; count: number }[]`
  - `ensureStarterItems(userId: number, childId: number): void`
  - HTTP：`GET /api/garden-plots?childId=` → `{ plots: PlotDTO[]; items: {itemKey,count}[]; now: number; capacity: number }`
  - `PlotDTO = { id, slot, species, stage, stageStartedAt, waterCount, nickname, plantedAt, remainingMs }`

- [ ] **Step 1: 写库存模块**

创建 `src/lib/garden/inventory.ts`：

```ts
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
```

- [ ] **Step 2: 写 GET 路由**

创建 `src/app/api/garden-plots/route.ts`：

```ts
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gardenPlots } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { advance, type Stage } from "@/lib/garden/growth";
import { PLOT_CAPACITY } from "@/lib/garden/plotLayout";
import { ensureStarterItems, readItems } from "@/lib/garden/inventory";

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
```

- [ ] **Step 3: 手动验证接口**

先登录拿 cookie，再请求：

```bash
curl -s -c /tmp/oak.jar -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' > /dev/null
curl -s -b /tmp/oak.jar "http://127.0.0.1:3000/api/garden-plots?childId=1"
```

Expected: `{"plots":[],"items":[{"itemKey":"seed:daisy","count":1},{"itemKey":"water","count":3}],"now":<毫秒>,"capacity":36}`

再次请求，`items` 不变（引导库存不重复赠送）。

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add src/lib/garden/inventory.ts src/app/api/garden-plots/route.ts
git commit -m "feat(garden): 库存模块与花园状态接口（惰性推进 + 引导库存）"
```

---

## Task 7: `POST /api/garden-plots` 种植

**Files:**
- Modify: `src/app/api/garden-plots/route.ts`（追加 POST）

**Interfaces:**
- Consumes: Task 6 的文件与模块、`speciesMeta` / `SPECIES`（Task 2）、`PLOT_CAPACITY`（Task 2）
- Produces: `POST /api/garden-plots` body `{ childId, slot, species }` → 201 + `PlotDTO`；格号被占或种子不足返回 400

- [ ] **Step 1: 追加 POST**

在 `src/app/api/garden-plots/route.ts` 的 `GET` 之后追加：

```ts
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
      .where(and(eq(gardenPlots.childId, childId), eq(gardenPlots.slot, slot)))
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
```

同时在文件顶部补上 import：

```ts
import { gardenItems, gardenPlots } from "@/db/schema";
import { PLOT_CAPACITY } from "@/lib/garden/plotLayout";
import { ensureStarterItems, readItems, seedKey } from "@/lib/garden/inventory";
import { SPECIES } from "@/lib/garden/species";
```

（`gardenItems` 若已在 Task 6 中引入则不重复；以实际文件为准，确保每个标识符都有 import。）

- [ ] **Step 2: 手动验证**

```bash
# 用引导库存里的雏菊种子种到 0 号格
curl -s -b /tmp/oak.jar -X POST http://127.0.0.1:3000/api/garden-plots \
  -H 'Content-Type: application/json' \
  -d '{"childId":1,"slot":0,"species":"daisy"}'
```

Expected: 201，返回含 `"slot":0,"species":"daisy","stage":0` 的记录

```bash
# 再种一次同一格 → 应被拒
curl -s -b /tmp/oak.jar -X POST http://127.0.0.1:3000/api/garden-plots \
  -H 'Content-Type: application/json' -d '{"childId":1,"slot":0,"species":"daisy"}'
```

Expected: `{"error":"种子不够啦，先去练一轮吧"}`（种子已被上一步扣光）

- [ ] **Step 3: 类型检查 + 测试**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 无类型错误，测试全绿

- [ ] **Step 4: 提交**

```bash
git add src/app/api/garden-plots/route.ts
git commit -m "feat(garden): 种植接口（事务内扣种子并占格）"
```

---

## Task 8: `PUT /api/garden-plots/[id]` 浇水 / 收获 / 改名 / 挪位

**Files:**
- Create: `src/app/api/garden-plots/[id]/route.ts`

**Interfaces:**
- Consumes: Task 1 的 `water` / `advance`、Task 2 的 `positionToSlot` 无关、`PLOT_CAPACITY`、`speciesMeta`、Task 3 的表
- Produces: `PUT /api/garden-plots/[id]` body `{ action, ... }`
  - `water` → 消耗 1 水滴，`waterCount + 1`，返回更新后的 `PlotDTO`
  - `harvest` → 仅 `stage = 4` 可收获，删除地块、果实 +1、水滴 +1
  - `rename` → `{ nickname: string }`，长度 ≤ 12
  - `move` → `{ slot: number }`，目标格为空才可移动

- [ ] **Step 1: 写路由**

创建 `src/app/api/garden-plots/[id]/route.ts`：

```ts
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gardenItems, gardenPlots } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { advance, water, type Stage } from "@/lib/garden/growth";
import { PLOT_CAPACITY } from "@/lib/garden/plotLayout";
import { WATER, fruitKey } from "@/lib/garden/inventory";

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
        .where(and(eq(gardenPlots.childId, row.childId), eq(gardenPlots.slot, slot)))
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

库存自增用 Task 6 的共享助手 `bumpItem(tx, ...)`，**不要**在本文件重新定义。改 import 行：

```ts
import { WATER, bumpItem, fruitKey } from "@/lib/garden/inventory";
```

**为什么不在事务里调用 `typeof db` 的助手**：drizzle 的 `tx` 缺 `$client`，不能赋给 `typeof db`（已实测）。`bumpItem` 的参数类型是 `Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]`，已验证可编译。

- [ ] **Step 2: 手动验证四个动作**

```bash
# 改名
curl -s -b /tmp/oak.jar -X PUT http://127.0.0.1:3000/api/garden-plots/1 \
  -H 'Content-Type: application/json' -d '{"action":"rename","nickname":"小豆芽"}'
# 浇水（需要先有水滴；可用 Task 9 的练习产出，或直接种一格再浇）
curl -s -b /tmp/oak.jar -X PUT http://127.0.0.1:3000/api/garden-plots/1 \
  -H 'Content-Type: application/json' -d '{"action":"water"}'
# 未结果时收获 → 应被拒
curl -s -b /tmp/oak.jar -X PUT http://127.0.0.1:3000/api/garden-plots/1 \
  -H 'Content-Type: application/json' -d '{"action":"harvest"}'
# 挪位置
curl -s -b /tmp/oak.jar -X PUT http://127.0.0.1:3000/api/garden-plots/1 \
  -H 'Content-Type: application/json' -d '{"action":"move","slot":5}'
```

Expected: 改名/浇水/挪位返回 `{"ok":true}`；未结果收获返回 `{"error":"还没结果呢，再等等吧"}`

- [ ] **Step 3: 验证收获链路**

把某株直接改成结果阶段（测试数据操作）：

```bash
npx tsx -e "import './src/db/index'; import Database from 'better-sqlite3'; const d=new Database('data/oak.db'); d.prepare(\"UPDATE garden_plots SET stage=4, stage_started_at=? WHERE id=1\").run(new Date().toISOString()); console.log('ok');"
curl -s -b /tmp/oak.jar -X PUT http://127.0.0.1:3000/api/garden-plots/1 \
  -H 'Content-Type: application/json' -d '{"action":"harvest"}'
curl -s -b /tmp/oak.jar "http://127.0.0.1:3000/api/garden-plots?childId=1"
```

Expected: 收获返回 `{"ok":true,"harvested":"daisy"}`；随后 GET 里 `plots` 不再含该株，`items` 里出现 `fruit:daisy` 且 `water` +1

- [ ] **Step 4: 清理测试数据**

```bash
npx tsx -e "import './src/db/index'; import Database from 'better-sqlite3'; const d=new Database('data/oak.db'); d.prepare('DELETE FROM garden_plots').run(); d.prepare(\"DELETE FROM garden_items WHERE item_key LIKE 'seed:%' OR item_key LIKE 'fruit:%'\").run(); console.log('cleaned');"
```

- [ ] **Step 5: 类型检查 + 测试**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 无类型错误，测试全绿

- [ ] **Step 6: 提交**

```bash
git add src/app/api/garden-plots/\[id\]/route.ts
git commit -m "feat(garden): 浇水/收获/改名/挪位接口"
```

---

## Task 9: 练习产出种子与水滴

**Files:**
- Modify: `src/app/api/garden-records/route.ts`

**Interfaces:**
- Consumes: `speciesForActivity`（Task 2）、`seedKey` / `WATER` / `SEED_PER_SESSION` / `WATER_PER_SESSION`（Task 6）、`gardenItems`（Task 3）
- Produces: 每提交一轮练习，同一事务内产出 1 颗对应物种的种子 + 2 滴水滴

- [ ] **Step 1: 在事务里追加产出**

在 `src/app/api/garden-records/route.ts` 中，`db.transaction((tx) => { ... })` 的 `return inserted;` 之前插入：

```ts
    // 学习园地：练习产出花园库存（种子按活动决定物种 + 水滴）
    bumpItem(tx, user!.id, childId, seedKey(speciesForActivity(activity)), SEED_PER_SESSION, now);
    bumpItem(tx, user!.id, childId, WATER, WATER_PER_SESSION, now);
```

并在文件顶部补 import：

```ts
import { gardenItems, gardenRecords, gardenMastery } from "@/db/schema";
import { speciesForActivity } from "@/lib/garden/species";
import { SEED_PER_SESSION, WATER, WATER_PER_SESSION, bumpItem, seedKey } from "@/lib/garden/inventory";
```

（`gardenItems` 只为 `bumpItem` 所在的模块服务，本文件若不直接用它可以不导入；以 lint 结果为准。）

- [ ] **Step 2: 手动验证**

```bash
curl -s -b /tmp/oak.jar -X POST http://127.0.0.1:3000/api/garden-records \
  -H 'Content-Type: application/json' \
  -d '{"childId":1,"activity":"math","difficulty":"简单","durationSec":60,"results":[{"itemKey":"3+2","label":"3+2","correct":true}]}'
curl -s -b /tmp/oak.jar "http://127.0.0.1:3000/api/garden-plots?childId=1"
```

Expected: 练习提交返回 201；GET 的 `items` 中 `seed:sunflower` +1（数学→向日葵）、`water` +2

- [ ] **Step 3: 清理测试数据**

```bash
npx tsx -e "import './src/db/index'; import Database from 'better-sqlite3'; const d=new Database('data/oak.db'); d.prepare(\"DELETE FROM garden_records WHERE activity='math' AND duration_sec=60\").run(); d.prepare(\"DELETE FROM garden_mastery WHERE item_key='3+2'\").run(); d.prepare('DELETE FROM garden_plots').run(); d.prepare(\"DELETE FROM garden_items WHERE item_key LIKE 'seed:%' OR item_key LIKE 'fruit:%'\").run(); console.log('cleaned');"
```

- [ ] **Step 4: 类型检查 + 测试**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 无类型错误，测试全绿

- [ ] **Step 5: 提交**

```bash
git add src/app/api/garden-records/route.ts
git commit -m "feat(garden): 练习提交产出花园种子与水滴"
```

---

## Task 10: three.js 场景骨架

**Files:**
- Modify: `package.json`（依赖）
- Create: `src/components/garden/GardenScene3D.tsx`

**Interfaces:**
- Consumes: `slotToPosition` / `TILE` / `PLOT_COLS` / `PLOT_ROWS`（Task 2）
- Produces:
  - `interface PlotView { id: number; slot: number; species: string; stage: number; nickname: string }`
  - `interface GardenScene3DProps { plots: PlotView[]; arranging?: boolean; onSelect?: (id: number | null) => void; onMoveSlot?: (id: number, slot: number) => void }`
  - 默认导出 `GardenScene3D`（client 组件，供 `next/dynamic` 懒加载）

- [ ] **Step 1: 安装依赖**

```bash
npm i three@0.186.0
npm i -D @types/three
```

Expected: `package.json` 的 dependencies 出现 `three`，devDependencies 出现 `@types/three`

- [ ] **Step 2: 写场景骨架**

创建 `src/components/garden/GardenScene3D.tsx`：

```tsx
"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { PLOT_COLS, PLOT_ROWS, TILE, slotToPosition } from "@/lib/garden/plotLayout";
import { speciesMeta } from "@/lib/garden/species";
import { partTransforms } from "@/lib/garden/plantVisual";

export interface PlotView {
  id: number;
  slot: number;
  species: string;
  stage: number;
  nickname: string;
}

export interface GardenScene3DProps {
  plots: PlotView[];
  arranging?: boolean;
  onSelect?: (id: number | null) => void;
  onMoveSlot?: (id: number, slot: number) => void;
}

const SKY = 0xcdebf6;
const GROUND = 0xb0d491;

export default function GardenScene3D({
  plots,
  arranging = false,
  onSelect,
  onMoveSlot,
}: GardenScene3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // 场景对象保存在 ref 里，供后续任务复用
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    ground: THREE.Mesh;
    plantRoot: THREE.Group;
    loader: GLTFLoader;
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);

    const camera = new THREE.PerspectiveCamera(
      45,
      host.clientWidth / host.clientHeight,
      0.1,
      200
    );
    camera.position.set(0, 9, 10);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.4, 0);
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.25;
    controls.minDistance = 5;
    controls.maxDistance = 22;
    controls.enablePan = false;
    controls.enableDamping = true;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9ec9a0, 1.15));
    const sun = new THREE.DirectionalLight(0xfff3d0, 1.1);
    sun.position.set(6, 12, 6);
    scene.add(sun);

    // 地块：略大于网格的圆角地面
    const groundSize = Math.max(PLOT_COLS, PLOT_ROWS) * TILE + 2.4;
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(groundSize * 0.72, 48),
      new THREE.MeshToonMaterial({ color: GROUND })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    // 格子线：帮助孩子看清"能种哪里"
    const grid = new THREE.GridHelper(
      Math.max(PLOT_COLS, PLOT_ROWS) * TILE,
      Math.max(PLOT_COLS, PLOT_ROWS),
      0x8fbd72,
      0x9ecb84
    );
    grid.position.y = 0;
    scene.add(grid);

    const plantRoot = new THREE.Group();
    scene.add(plantRoot);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    sceneRef.current = { renderer, scene, camera, controls, ground, plantRoot, loader };

    let raf = 0;
    let running = true;
    const clock = new THREE.Clock();
    const tick = () => {
      if (!running) return;
      const t = clock.getElapsedTime();
      // 植物待机轻摆：统一在 rAF 里更新
      plantRoot.children.forEach((child, i) => {
        child.rotation.z = Math.sin(t * 1.1 + i * 0.7) * 0.02;
      });
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      if (!host) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        clock.getDelta();
        raf = requestAnimationFrame(tick);
      }
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // plots 变化时重建植物（Task 11 填充具体构建逻辑）
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.plantRoot.clear();
    for (const p of plots) {
      const { x, z } = slotToPosition(p.slot);
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.32, 6),
        new THREE.MeshToonMaterial({ color: 0x8ac68a })
      );
      marker.position.set(x, 0.16, z);
      marker.userData = { plotId: p.id, slot: p.slot, stage: p.stage, species: p.species };
      ctx.plantRoot.add(marker);
    }
  }, [plots]);

  return <div ref={hostRef} className="absolute inset-0" aria-label="3D 花园" role="img" />;
}
```

`arranging` / `onSelect` / `onMoveSlot` 在本任务先不用（Task 12/13 接入），保留在 props 里。

- [ ] **Step 3: 在页面里临时挂载验证**

在 `src/components/garden/GardenHome.tsx` 的 `Tabs` 里临时把第一个 Tab 换成：

```tsx
{
  key: "garden",
  label: "我的花园",
  children: (
    <div className="relative h-[60vh] rounded-3xl overflow-hidden border-2" style={{ borderColor: "#e8dcc8" }}>
      <GardenScene3D plots={[]} />
    </div>
  ),
},
```

并在文件顶部加：

```tsx
import dynamic from "next/dynamic";
const GardenScene3D = dynamic(() => import("@/components/garden/GardenScene3D"), { ssr: false });
```

打开 `http://127.0.0.1:3000/garden` 并切到「我的花园」。

Expected: 看到淡蓝天背景、圆形绿色地面与 6×6 格子线，可以拖动旋转、滚轮缩放，角度被限制住

- [ ] **Step 4: 帧率与内存自查**

在浏览器 devtools 的 Performance 面板录 10 秒。
Expected: 帧率稳定 ≥ 50fps（桌面），无持续增长的内存

- [ ] **Step 5: 提交**

```bash
git add package.json package-lock.json src/components/garden/GardenScene3D.tsx src/components/garden/GardenHome.tsx
git commit -m "feat(garden): three.js 场景骨架（地面/格子/相机/光照）"
```

---

## Task 11: 加载 GLB 并组合生长阶段

**Files:**
- Modify: `src/components/garden/GardenScene3D.tsx`

**Interfaces:**
- Consumes: Task 5 的 GLB 资产、Task 2 的 `speciesMeta` / `partTransforms`
- Produces: 植物按 `slot` 摆位，按 `stage` 组合构件；同一物种的 GLB 只加载一次

- [ ] **Step 1: 加构件缓存与装配函数**

在 `src/components/garden/GardenScene3D.tsx` 中，组件外部新增：

```tsx
type PartName = "stem" | "foliage" | "flower" | "fruit";

const glbCache = new Map<string, Promise<THREE.Group>>();

/** 加载物种 GLB（同一物种只请求一次），返回构件网格的模板 */
function loadSpeciesParts(loader: GLTFLoader, file: string): Promise<Record<PartName, THREE.Object3D>> {
  const cached = glbCache.get(file);
  if (cached) return cached.then(extractParts);
  const p = loader.loadAsync(`/models/garden/${file}.glb`).then((gltf) => gltf.scene);
  glbCache.set(file, p);
  return p.then(extractParts);
}

function extractParts(root: THREE.Object3D): Record<PartName, THREE.Object3D> {
  const out: Partial<Record<PartName, THREE.Object3D>> = {};
  root.traverse((o) => {
    const name = o.name.toLowerCase();
    if (name === "stem" || name === "foliage" || name === "flower" || name === "fruit") {
      out[name as PartName] = o;
    }
  });
  return out as Record<PartName, THREE.Object3D>;
}

/** 用构件模板装配一株植物：阶段决定缩放与显隐 */
function buildPlant(
  parts: Record<PartName, THREE.Object3D>,
  stage: number,
  scale: number
): THREE.Group {
  const visual = partTransforms(stage);
  const group = new THREE.Group();
  (Object.keys(visual) as PartName[]).forEach((name) => {
    const template = parts[name];
    if (!template) return;
    const t = visual[name];
    if (!t.visible) return;
    const inst = template.clone(true);
    inst.visible = true;
    inst.scale.multiply(new THREE.Vector3(t.scale * scale, t.scale * t.yScale * scale, t.scale * scale));
    inst.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      mesh.material = new THREE.MeshToonMaterial({
        color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
        transparent: t.opacity < 1,
        opacity: t.opacity,
      });
    });
    group.add(inst);
  });
  return group;
}
```

- [ ] **Step 2: 替换植物构建 effect**

把 Task 10 里 `// plots 变化时重建植物` 那个 `useEffect` 整体替换为：

```tsx
  // plots 变化时重建植物
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    let cancelled = false;

    const rebuild = async () => {
      ctx.plantRoot.clear();
      const uniqueSpecies = Array.from(new Set(plots.map((p) => p.species)));
      const loaded = await Promise.all(
        uniqueSpecies.map(async (key) => {
          const meta = speciesMeta(key);
          const parts = await loadSpeciesParts(ctx.loader, meta.file);
          return [key, { parts, height: meta.height }] as const;
        })
      );
      if (cancelled) return;
      const bySpecies = new Map(loaded);

      for (const p of plots) {
        const entry = bySpecies.get(p.species);
        if (!entry) continue;
        const { x, z } = slotToPosition(p.slot);
        // 成株高度归一化到格子的 0.6 倍，避免大树盖住邻居
        const scale = (TILE * 0.6) / entry.height;
        const plant = buildPlant(entry.parts, p.stage, scale);
        plant.position.set(x, 0, z);
        plant.userData = { plotId: p.id, slot: p.slot, stage: p.stage, species: p.species };
        ctx.plantRoot.add(plant);
      }
    };

    void rebuild();
    return () => {
      cancelled = true;
    };
  }, [plots]);
```

- [ ] **Step 3: 造两株测试数据看效果**

```bash
curl -s -b /tmp/oak.jar -X POST http://127.0.0.1:3000/api/garden-records \
  -H 'Content-Type: application/json' \
  -d '{"childId":1,"activity":"math","difficulty":"简单","durationSec":60,"results":[{"itemKey":"3+2","label":"3+2","correct":true}]}'
curl -s -b /tmp/oak.jar -X POST http://127.0.0.1:3000/api/garden-records \
  -H 'Content-Type: application/json' \
  -d '{"childId":1,"activity":"characters","difficulty":"简单","durationSec":60,"results":[{"itemKey":"天","label":"天","correct":true}]}'
curl -s -b /tmp/oak.jar -X POST http://127.0.0.1:3000/api/garden-plots \
  -H 'Content-Type: application/json' -d '{"childId":1,"slot":14,"species":"sunflower"}'
curl -s -b /tmp/oak.jar -X POST http://127.0.0.1:3000/api/garden-plots \
  -H 'Content-Type: application/json' -d '{"childId":1,"slot":15,"species":"bamboo"}'
npx tsx -e "import './src/db/index'; import Database from 'better-sqlite3'; const d=new Database('data/oak.db'); d.prepare('UPDATE garden_plots SET stage=3').run(); console.log('set stage 3');"
```

刷新 `/garden` 的「我的花园」。
Expected: 14 号格出现开花的向日葵、15 号格出现开花的竹子，可以转视角从不同角度看

- [ ] **Step 4: 观察不同阶段**

```bash
npx tsx -e "import './src/db/index'; import Database from 'better-sqlite3'; const d=new Database('data/oak.db'); d.prepare('UPDATE garden_plots SET stage=0 WHERE slot=14').run(); d.prepare('UPDATE garden_plots SET stage=4 WHERE slot=15').run(); console.log('ok');"
```

刷新页面。
Expected: 14 号是幼苗（矮小、无花），15 号花淡出并出现果实

- [ ] **Step 5: Playwright 截图留证**

用 Playwright 打开 `/garden`（已登录态），切到「我的花园」，等 3D 场景渲染完成后截图：

```
browser_navigate  http://127.0.0.1:3000/garden
browser_click     第一个 Tab「我的花园」
browser_take_screenshot  filename=garden-3d.png
```

Expected: 截图里能看到地块、格子线与至少两株植物；把截图贴进 PR 描述。

**注意**：主内容区是内部滚动容器，须用视口截图（不要 `fullPage`），并先移除 `nextjs-portal` 浮层（项目既有截图规范）。

- [ ] **Step 6: 提交**

```bash
git add src/components/garden/GardenScene3D.tsx
git commit -m "feat(garden): 加载 GLB 构件并按生长阶段装配植物"
```

---

## Task 12: 交互——点植物、浇水、收获

**Files:**
- Modify: `src/components/garden/GardenScene3D.tsx`
- Create: `src/components/garden/GardenTab.tsx`（先只做交互所需的最小外壳）

**Interfaces:**
- Consumes: Task 6/7/8 的接口、`PlotDTO`
- Produces:
  - `GardenScene3D` 的 `onSelect(plotId | null)` 通过射线拾取触发
  - `GardenTab` 负责数据拉取与操作调用，暴露给 `GardenHome` 使用

- [ ] **Step 1: 加射线拾取**

在 `GardenScene3D.tsx` 的场景初始化 `useEffect` 里，`const tick = () => {...}` 之前插入：

```tsx
    // 射线拾取：点击植物选中，点空地取消选中
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onClick = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(plantRoot.children, true);
      const hit = hits.find((h) => findPlotId(h.object) != null);
      onSelectRef.current?.(hit ? findPlotId(hit.object) : null);
    };
    renderer.domElement.addEventListener("pointerdown", onClick);
```

再在组件顶部加 ref（避免闭包捕获旧回调）：

```tsx
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
```

组件外部加工具函数：

```tsx
function findPlotId(obj: THREE.Object3D): number | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    const id = cur.userData?.plotId;
    if (typeof id === "number") return id;
    cur = cur.parent;
  }
  return null;
}
```

并在清理函数里加 `renderer.domElement.removeEventListener("pointerdown", onClick);`。

- [ ] **Step 2: 加选中高亮**

在 plots 重建的 `useEffect` 里，给被选中的植物加一个光圈：

```tsx
        if (p.id === selectedId) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(TILE * 0.32, TILE * 0.4, 24),
            new THREE.MeshBasicMaterial({ color: 0xffd85e, transparent: true, opacity: 0.85 })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.02;
          plant.add(ring);
        }
```

props 增加 `selectedId?: number | null`，并把它加入该 effect 的依赖数组。

- [ ] **Step 3: 写 `GardenTab`**

**与 spec 的一处有意差异**：spec 第 7 节写的是「气泡报出活动/日期/分数」，这里改用底部信息卡（图标 + 名字 + 剩余时间）——花园里没有活动记录可展示（本轮只存 `plantedAt`，没存来源活动），信息卡比气泡更好放操作按钮，且同样不依赖识字（配 TTS）。若后续要把来源活动也带进花园，在 `garden_plots` 加一列 `source_activity` 即可。

创建 `src/components/garden/GardenTab.tsx`：

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Tag, Button } from "animal-island-ui";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { speciesMeta } from "@/lib/garden/species";
import { nextFreeSlot } from "@/lib/garden/plotLayout";
import { WATER } from "@/lib/garden/inventory";
import { speak } from "@/lib/garden/speech";
import type { PlotView } from "@/components/garden/GardenScene3D";

const GardenScene3D = dynamic(() => import("@/components/garden/GardenScene3D"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm">花园正在生长…</div>,
});

interface ItemRow {
  itemKey: string;
  count: number;
}

interface PlotsResponse {
  plots: (PlotView & { remainingMs: number; waterCount: number; plantedAt: string })[];
  items: ItemRow[];
  now: number;
  capacity: number;
}

export default function GardenTab({ childId }: { childId: number }) {
  const [data, setData] = useState<PlotsResponse | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await api<PlotsResponse>(`/api/garden-plots?childId=${childId}`));
    } catch (e: any) {
      toast(e.message || "花园加载失败", "error");
    }
  }, [childId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const items = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of data?.items ?? []) map.set(it.itemKey, it.count);
    return map;
  }, [data]);

  const selected = data?.plots.find((p) => p.id === selectedId) ?? null;
  const seeds = [...items.entries()].filter(([k, n]) => k.startsWith("seed:") && n > 0);

  // 选中植物时朗读它的信息（孩子不识字，靠 TTS 听懂）
  useEffect(() => {
    if (!selected) return;
    const meta = speciesMeta(selected.species);
    const label = selected.nickname || meta.name;
    const stageText =
      selected.stage >= 4
        ? "成熟啦，可以收获"
        : `还要 ${Math.ceil(selected.remainingMs / 3600000)} 小时`;
    void speak(`${label}，${stageText}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const act = async (body: Record<string, unknown>, id?: number) => {
    if (busy) return;
    setBusy(true);
    try {
      if (id == null) {
        await api("/api/garden-plots", { method: "POST", body: JSON.stringify(body) });
      } else {
        await api(`/api/garden-plots/${id}`, { method: "PUT", body: JSON.stringify(body) });
      }
      await reload();
    } catch (e: any) {
      toast(e.message || "操作失败", "error");
    } finally {
      setBusy(false);
    }
  };

  const plant = () => {
    if (!data || seeds.length === 0) {
      toast("还没有种子，先去练一轮吧", "warning");
      return;
    }
    const slot = nextFreeSlot(data.plots.map((p) => p.slot));
    if (slot == null) {
      toast("花园满啦", "warning");
      return;
    }
    const [key] = seeds[0];
    void act({ childId, slot, species: key.slice("seed:".length) });
  };

  return (
    <div className="relative h-[70vh] rounded-3xl overflow-hidden border-2" style={{ borderColor: "#e8dcc8" }}>
      <GardenScene3D
        plots={data?.plots ?? []}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {/* 库存栏 */}
      <div className="absolute top-3 left-3 flex gap-2 flex-wrap">
        <Tag color="app-teal" variant="solid">💧 水滴 {items.get(WATER) ?? 0}</Tag>
        {seeds.map(([k, n]) => {
          const meta = speciesMeta(k.slice("seed:".length));
          return (
            <Tag key={k} color="app-green" variant="solid">
              {meta.emoji} {meta.name}种子 ×{n}
            </Tag>
          );
        })}
      </div>

      {/* 底部操作 */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
        <Button onClick={plant} disabled={busy}>种下一颗</Button>
        {selected && (
          <>
            <Button
              onClick={() => void act({ action: "water" }, selected.id)}
              disabled={busy || selected.stage >= 4}
            >
              浇水
            </Button>
            <Button
              onClick={() => void act({ action: "harvest" }, selected.id)}
              disabled={busy || selected.stage < 4}
            >
              收获
            </Button>
          </>
        )}
      </div>

      {/* 选中信息（不依赖识字：图标 + 大字） */}
      {selected && (
        <Card className="absolute bottom-16 left-1/2 -translate-x-1/2 w-64">
          <div className="text-center py-1">
            <div className="text-3xl">{speciesMeta(selected.species).emoji}</div>
            <div className="font-bold mt-1">
              {selected.nickname || speciesMeta(selected.species).name}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
              {selected.stage >= 4
                ? "成熟啦，可以收获"
                : `还要 ${Math.ceil(selected.remainingMs / 3600000)} 小时`}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 手动验证交互**

刷新 `/garden`，「我的花园」Tab 里：
- 点一株植物 → 出现黄色光圈和底部信息卡
- 点「浇水」→ 水滴 -1、信息卡的剩余时间变少
- 种下的植物到结果阶段后点「收获」→ 植物消失、果实与水滴增加

Expected: 全流程可用；水滴或种子不足时 toast 提示且不崩溃

- [ ] **Step 5: 提交**

```bash
git add src/components/garden/GardenScene3D.tsx src/components/garden/GardenTab.tsx
git commit -m "feat(garden): 点选/浇水/收获交互与花园 Tab 外壳"
```

---

## Task 13: 整理模式（挪位置）与起名

**Files:**
- Modify: `src/components/garden/GardenScene3D.tsx`
- Modify: `src/components/garden/GardenTab.tsx`

**Interfaces:**
- Consumes: Task 8 的 `move` / `rename`
- Produces: 整理模式下拖动植物吸附到空格；信息卡里可起名

- [ ] **Step 1: 加拖动落点计算**

在 `GardenScene3D.tsx` 的场景初始化 effect 里加一个与地面求交的辅助：

```tsx
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ndc = new THREE.Vector2();
    const intersectGround = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const point = new THREE.Vector3();
      return raycaster.ray.intersectPlane(dragPlane, point) ? point : null;
    };
```

再在 `pointerdown` 处理里，当 `arrangingRef.current` 为真且命中了植物时，进入拖动：

```tsx
      const hitId = hit ? findPlotId(hit.object) : null;
      if (arrangingRef.current && hitId != null) {
        draggingRef.current = hitId;
        controls.enabled = false;
        return;
      }
      onSelectRef.current?.(hitId);
```

加 `pointermove` 与 `pointerup`：

```tsx
    const onPointerMove = (e: PointerEvent) => {
      if (draggingRef.current == null) return;
      const p = intersectGround(e.clientX, e.clientY);
      if (!p) return;
      const dragged = plantRoot.children.find((c) => c.userData.plotId === draggingRef.current);
      if (dragged) dragged.position.set(p.x, 0, p.z);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (draggingRef.current == null) return;
      const id = draggingRef.current;
      draggingRef.current = null;
      controls.enabled = true;
      const p = intersectGround(e.clientX, e.clientY);
      if (!p) return;
      const slot = positionToSlot(p.x, p.z);
      if (slot != null) onMoveSlotRef.current?.(id, slot);
      else void rebuildRef.current?.(); // 落在地块外：回到原位
    };
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
```

补 import：`import { positionToSlot, slotToPosition } from "@/lib/garden/plotLayout";`

补 refs 与 props：

```tsx
  const arrangingRef = useRef(arranging);
  const onMoveSlotRef = useRef(onMoveSlot);
  const draggingRef = useRef<number | null>(null);
  useEffect(() => {
    arrangingRef.current = arranging;
    onMoveSlotRef.current = onMoveSlot;
  }, [arranging, onMoveSlot]);
```

清理函数里对应移除两个监听。

**注意**：拖动结束落点无效时，用重新触发 plots effect 的方式复位——把重建函数存到 `rebuildRef`（在 plots effect 里赋值 `rebuildRef.current = rebuild`）。

- [ ] **Step 2: 加整理模式开关与起名**

在 `GardenTab.tsx` 里加：

```tsx
  const [arranging, setArranging] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
```

底部操作区加按钮：

```tsx
        <Button onClick={() => setArranging((v) => !v)} disabled={busy}>
          {arranging ? "完成整理" : "整理花园"}
        </Button>
```

`GardenScene3D` 传入 `arranging` 与 `onMoveSlot`：

```tsx
        arranging={arranging}
        onMoveSlot={(id, slot) => void act({ action: "move", slot }, id)}
```

信息卡里加起名：

```tsx
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={12}
              placeholder="给它起个名字"
              className="mt-2 w-full text-center text-sm rounded-full border px-3 py-1"
              style={{ borderColor: "#e8dcc8" }}
            />
            <Button
              className="mt-2"
              disabled={busy}
              onClick={() => void act({ action: "rename", nickname: nameDraft }, selected.id)}
            >
              起名
            </Button>
```

并在 `selectedId` 变化时同步草稿：

```tsx
  useEffect(() => {
    setNameDraft(selected?.nickname ?? "");
  }, [selectedId]);
```

- [ ] **Step 3: 手动验证**

- 点「整理花园」→ 拖动一株植物到空格 → 松手后落到新格，刷新页面位置保持
- 拖到地块外 → 植物回到原位
- 给一株植物起名 → 信息卡与卡片标题显示新名字，刷新后保留

Expected: 三项都通过；整理模式下相机不会跟着转

- [ ] **Step 4: 提交**

```bash
git add src/components/garden/GardenScene3D.tsx src/components/garden/GardenTab.tsx
git commit -m "feat(garden): 整理模式拖动挪位与植物起名"
```

---

## Task 14: 接入园地第一个 Tab + 降级 + 结算奖励

**Files:**
- Modify: `src/components/garden/GardenHome.tsx`
- Modify: `src/components/garden/GardenTab.tsx`
- Modify: `src/components/garden/GardenActivity.tsx`（结算页奖励提示）

**Interfaces:**
- Consumes: 全部前序任务
- Produces: `/garden` 第一个 Tab「我的花园」；WebGL 不可用时降级为列表；练习结算页提示获得的种子

- [ ] **Step 1: 加 WebGL 降级**

在 `GardenTab.tsx` 里加：

```tsx
function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
```

组件里：

```tsx
  const [canRender3D, setCanRender3D] = useState(true);
  useEffect(() => {
    setCanRender3D(webglAvailable());
  }, []);
```

渲染处：

```tsx
      {canRender3D ? (
        <GardenScene3D ... />
      ) : (
        <div className="absolute inset-0 overflow-y-auto p-4 grid gap-2 content-start">
          <p className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            这台设备看不了 3D 花园，但种植和收获照样能用 🌱
          </p>
          {(data?.plots ?? []).map((p) => (
            <Card key={p.id} onClick={() => setSelectedId(p.id)}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{speciesMeta(p.species).emoji}</span>
                <span className="font-bold">{p.nickname || speciesMeta(p.species).name}</span>
                <Tag size="small" variant="soft">
                  {p.stage >= 4 ? "可收获" : `${Math.ceil(p.remainingMs / 3600000)} 小时`}
                </Tag>
              </div>
            </Card>
          ))}
        </div>
      )}
```

- [ ] **Step 2: 正式接入第一个 Tab**

把 `GardenHome.tsx` 里 Task 10 的临时 Tab 换成真实数据接线（`GardenHome` 已有 `memberId`）：

```tsx
          {
            key: "garden",
            label: "我的花园",
            children:
              memberId == null ? (
                <p className="text-sm py-10 text-center" style={{ color: "var(--animal-text-color-secondary)" }}>
                  先在上面选一个成员，再来看他的花园
                </p>
              ) : (
                <GardenTab childId={memberId} />
              ),
          },
```

并加 import：

```tsx
import GardenTab from "@/components/garden/GardenTab";
```

删掉临时的 `dynamic` import 与 `GardenScene3D` import（不再直接使用）。

- [ ] **Step 3: 结算页奖励提示**

在 `GardenActivity.tsx` 结算区域（提交成绩成功之后）加一行提示，用 `speciesForActivity` 得到物种：

```tsx
          <p className="text-sm mt-2" style={{ color: "var(--animal-text-color-secondary)" }}>
            🌱 获得一颗{speciesMeta(speciesForActivity(type)).name}种子 + 2 滴水滴，去「我的花园」种下吧
          </p>
```

补 import：

```tsx
import { speciesForActivity, speciesMeta } from "@/lib/garden/species";
```

- [ ] **Step 4: 全流程手动验收**

1. 打开 `/garden`，确认第一个 Tab 是「我的花园」
2. 切成员 → 花园跟着切换
3. 去做一轮数学练习 → 结算页提示获得向日葵种子
4. 回花园 → 种下 → 浇水 → 整理模式挪位 → 起名
5. 把该株改成结果阶段后收获 → 植物消失、果实出现
6. 用 devtools 禁用 WebGL（`chrome://flags` 或覆盖 `HTMLCanvasElement.prototype.getContext`）后刷新 → 列表降级可用

Expected: 六步全通过

- [ ] **Step 5: 构建 + 测试 + 提交**

Run: `npm run build && npm test`
Expected: 构建成功（无类型错误），测试全绿

```bash
git add src/components/garden/GardenHome.tsx src/components/garden/GardenTab.tsx src/components/garden/GardenActivity.tsx
git commit -m "feat(garden): 我的花园接入园地首个 Tab，含 WebGL 降级与结算奖励提示"
```

---

## 完成标准

- [ ] `npm test` 全绿（growth / species / plotLayout / plantVisual）
- [ ] `npx tsc --noEmit -p tsconfig.json` 无错误
- [ ] `npm run build` 成功
- [ ] `/garden` 第一个 Tab 是「我的花园」，可种植 / 浇水 / 收获 / 挪位 / 起名
- [ ] 练习结算后种子与水滴入账
- [ ] 8 个物种 GLB 均存在且构件命名正确
- [ ] WebGL 不可用时降级列表可用
- [ ] 切走 Tab 或隐藏页面时 rAF 停止

## 已知风险与后续

- **模型观感**：Task 4 的人工检查点是关键闸门。若 8 个物种里有观感不达标的，回到 `SPECIES` 参数重跑，不要进入 Task 10。
- **Meshopt 与 Turbopack**：若 `three/examples/jsm/libs/meshopt_decoder.module.js` 打包报错，改用不压缩导出（去掉 `export_meshopt_compression_enable`）并把脚本重跑一次，前端 `setMeshoptDecoder` 一并去掉。
- **多地块**：本期只有 6×6 一块地，满了提示「花园满啦」。多地块扩张留后续。
- **TTS 朗读植物信息**：本期只在选中卡片里显示文字，TTS 留后续（`GardenActivity` 已有 TTS 基建可复用）。
