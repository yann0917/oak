# 可交互 3D 小花园（学习园地）设计

- 日期：2026-09-09
- 状态：待评审
- 涉及模块：学习园地（`/garden`）

## 1. 背景与目标

学习园地当前是「学习卡片 / 益智游戏 / 学习记录」三个 Tab，练习结果写入 `garden_records`；页面视觉是纯 CSS/SVG 的平面场景（`SceneBackground.tsx`）加一只 SVG 猫头鹰（`OwlTeacher.tsx`）。

本次新增一个**可交互的 3D 小花园**，作为园地的第一个 Tab。孩子在练习中获得种子与水滴，在花园里种植、浇水、等待生长、收获果实、重新栽种。花园既是练习行为的可视化奖励，也是一套轻量养成玩法。

**本期不做**：好友互访、季节与天气、商店与交易、成就图鉴、无限扩张的多地块。

## 2. 已确认的决策

| # | 决策项 | 选择 |
|---|---|---|
| 1 | 渲染方案 | B. 建模 GLB 资产（Blender 脚本化生成，非手搓建模） |
| 2 | 生长驱动 | 时间推进 + 浇水加速；种子与水滴由练习产出 |
| 3 | 生命周期 | 幼苗 → 成长 → 花苞 → 开花 → 结果 → 收获 → 空地重新栽种 |
| 4 | 互动深度 | 轻互动（种植 / 浇水 / 起名 / 挪位置 / 收获） |
| 5 | 入口位置 | `/garden` 第一个 Tab「我的花园」 |

## 3. 核心循环

```
完成一轮练习  ──→  获得 1 颗种子（物种由活动决定）+ 2 滴水滴
                        │
                        ▼
                在花园空格种下（消耗种子）
                        │
                        ▼
        按真实时间推进阶段（幼苗→成长→花苞→开花→结果）
                        │
              浇水（消耗水滴，缩短当前阶段剩余时间）
                        │
                        ▼
                  结果 → 收获（得 1 果实 + 1 水滴）
                        │
                        ▼
                  空地 → 重新栽种
```

花园是「现在进行时」，收获的果实是「过去完成时」的永久积累。

## 4. 数据模型

两张新表，存量表零改动。迁移按项目既有做法写在 `src/db/index.ts` 的内嵌 DDL 里（`CREATE TABLE IF NOT EXISTS`），部署时自动执行。

### 4.1 `garden_plots` — 花园格子

```sql
CREATE TABLE IF NOT EXISTS garden_plots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL DEFAULT 1,
  child_id      INTEGER NOT NULL,
  slot          INTEGER NOT NULL,          -- 全局格号 0..35（6×6 单地块）
  species       TEXT    NOT NULL,          -- 物种 key，见 src/lib/garden/species.ts
  stage         INTEGER NOT NULL DEFAULT 0,-- 0 幼苗 1 成长 2 花苞 3 开花 4 结果
  planted_at    TEXT    NOT NULL,          -- 种下时间（ISO）
  stage_started_at TEXT NOT NULL,          -- 当前阶段的起点（时间推进算法依赖它）
  water_count   INTEGER NOT NULL DEFAULT 0,-- 当前阶段已浇水次数
  nickname      TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_garden_plots_slot ON garden_plots (child_id, slot);
CREATE INDEX IF NOT EXISTS idx_garden_plots_child ON garden_plots (child_id);
```

**收获即删除本行**，果实计数写入 `garden_items`。格子的唯一索引因此天然复用，不需要软删除标记。

### 4.2 `garden_items` — 库存（水滴 / 种子 / 果实）

用 KV 表而不是 JSON 列，因为库存是高频自增/自减，KV 便于原子 `UPDATE ... SET count = count ± 1`。

```sql
CREATE TABLE IF NOT EXISTS garden_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL DEFAULT 1,
  child_id   INTEGER NOT NULL,
  item_key   TEXT    NOT NULL,  -- "water" | "seed:<species>" | "fruit:<species>"
  count      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_garden_items_key ON garden_items (child_id, item_key);
```

**初始化时机**：GET `/api/garden-plots` 时，若该 `child_id` 在 `garden_items` 中一行都没有，则插入引导库存——1 颗雏菊种子 + 3 滴水滴（否则新孩子面对空花园无从下手）。已初始化的孩子不会重复赠送。

### 4.3 与 `garden_records` 的关系

练习提交（`POST /api/garden-records`）时，在同一事务里追加库存：种子 +1（物种由 `activity` 映射）、水滴 +2。这是唯一的存量代码改动点，且只在事务内加两行 `UPDATE/INSERT`。

## 5. 时间推进算法（核心）

**采用惰性求值，不引入后台调度器。**

植物生长只依赖 `stage` 与 `stage_started_at`，服务端在**每次读取**时按当前时间推进，不做 cron、不做常驻任务——进程重启、容器迁移、多副本都不会影响正确性。

```
阶段时长（常量，见 src/lib/garden/growth.ts）
  幼苗 2h · 成长 4h · 花苞 6h · 开花 6h · 结果 6h   → 全程 24h
浇水效果：当前阶段剩余时间 -2h，每阶段最多 3 次（最多省 6h）
```

推进逻辑：

1. 取 `now`（**服务端时间**，不接受客户端时间）
2. `elapsed = now - stage_started_at`
3. `need = STAGE_MS[stage] - water_count * WATER_BONUS_MS`（下限 0）
4. 若 `elapsed >= need` 且 `stage < 4`：`stage += 1`，`stage_started_at += need`，`water_count = 0`，回到步骤 3（处理一次跨多个阶段）
5. 若已到 `stage = 4`：标记为可收获，不再推进

**幂等与并发**：推进写回用条件更新 `UPDATE garden_plots SET ... WHERE id = ? AND stage = ? AND stage_started_at = ?`，影响行数为 0 则说明已被并发请求推进过，重新读取即可。同一株植物被两个请求同时读到旧值也不会重复推进。

**客户端展示**：GET 返回服务端时间 `now`，前端用「服务端 now + 本地单调增量」估算剩余时间做倒计时，避免客户端时钟偏差导致进度跳变。

**收获前置条件**：仅当 `stage = 4`（结果）时允许收获，否则返回 400。浇水仅当 `stage < 4` 且当前阶段 `water_count < 3` 时允许，否则返回 400。两类消耗性操作都在事务内先校验库存与状态再扣减。

## 6. Blender 资产管线

### 6.1 为什么不逐个手搓模型

模型由**参数化脚本**生成（`scripts/blender/gen-garden-plants.py`），通过 Blender MCP 的 `execute_code` 运行，或 `blender --background --python` 直接跑。改设计就改参数重跑，产物可复现、可 diff（脚本进 git）。

已实测跑通（Blender 5.2.1 LTS + addon v1.6，glTF 导出器含 Draco / Meshopt / 动画支持）。

### 6.2 构件化导出（关键设计）

**不为每个生长阶段各导一个模型**，而是每个物种只导出 4 个构件，阶段由 three.js 组合：

| 构件 | 作用 |
|---|---|
| `stem` | 茎 / 树干，根部在原点 |
| `foliage` | 叶丛 |
| `flower` | 花（花苞阶段缩放小、开花阶段全开、结果阶段淡出） |
| `fruit` | 果实（仅结果阶段显示） |

阶段组合规则：幼苗 = 短 stem + 小 foliage；成长 = 高 stem + 大 foliage；花苞 = + 缩小的 flower；开花 = flower 全尺寸；结果 = flower 淡出 + fruit 出现。

这样 8 个物种 × 1 个 GLB（内含 4 个命名网格）= 8 个文件，总量约 300–500 KB（Meshopt 压缩后），而不是 40 个模型。

### 6.3 导出约定

- 坐标系：glTF Y-up，根部原点 `(0,0,0)`，成株高度 0.4–1.2 m
- 材质：Principled BSDF，只用 Base Color + Roughness，不导贴图；颜色取自 `ACTIVITY_PALETTE`
- 造型：低多边形 + 曲面平滑着色（轮廓清晰、表面圆润，避免硬边几何块感）
- 三角面预算：单构件 ≤ 1200 tris，单物种 ≤ 3000 tris（花园最多 36 株，18 万面量级对任何设备都轻松；早期 300/1000 的预算过紧，会把模型压成几何块）
- 压缩：Meshopt（实测 65 KB → 28 KB；Draco 更小但 decoder 体积大得多，不划算）
- 输出：`public/models/garden/<species>.glb`，与既有 `public/models/*.task` 一样入库 git

实测基线：一株 808 tris 的植物，GLB 原始 65 KB / Meshopt 28 KB / Draco 14 KB。

### 6.4 物种与活动的映射

集中在 `src/lib/garden/species.ts`（单一来源），多对一：

| 活动 | 物种 |
|---|---|
| characters 识字卡、words 词语 | 竹 bamboo |
| math 数学 | 向日葵 sunflower |
| pinyin 拼音 | 风铃草 bluebell |
| letters 字母 | 郁金香 tulip |
| poems 古诗 | 梅树 plum |
| colors 颜色 | 绣球 hydrangea |
| idioms 成语 | 桂花树 osmanthus |
| 益智游戏（8 个） | 雏菊 daisy |

## 7. 前端架构

```
src/lib/garden/species.ts     物种定义 + 活动映射 + 构件锚点（纯数据）
src/lib/garden/growth.ts      阶段推进、剩余时间、浇水效果（纯函数，可单测）
src/lib/garden/plotLayout.ts  slot ↔ 3D 坐标（纯函数）
src/components/garden/GardenScene3D.tsx   three.js 场景（client，动态导入）
src/components/garden/GardenTab.tsx       花园 Tab 外壳（库存栏 + 场景 + 降级）
```

- three.js `0.186.0`，用 `next/dynamic(() => import(...), { ssr: false })` **只在切到该 Tab 时加载**
- `GLTFLoader` + `MeshoptDecoder`
- 加载后把材质替换为 `MeshToonMaterial`（3 色调色板），保证扁平卡通风格与现有 UI 一致
- 相机：`OrbitControls`，限制俯角与距离（不能钻到地下、不能绕到背面看穿）
- 光照：`HemisphereLight` + 单个 `DirectionalLight`，阴影默认关闭
- 交互：点植物 → 弹跳 + 气泡报出「3月5日 · 识字卡 · 全对」并 TTS 朗读（守住「幼儿园功能不依赖识字」）；点底部「整理」按钮进入整理模式，拖动植物到空格（吸附格子），再点一次退出并保存；点植物打开的面板可浇水 / 起名
- 时间推进在服务端，前端只做倒计时展示

## 8. 性能与降级

| 项 | 策略 |
|---|---|
| 首屏 | three.js 与 GLB 都不进首屏，切 Tab 才加载 |
| DPR | 上限 2 |
| 阴影 | 默认关，高配设备可开 |
| 渲染循环 | 页面隐藏 / 切走 Tab → 停 rAF |
| 材质 | `MeshToonMaterial`，比 `MeshStandardMaterial` 便宜 |
| 目标 | 中端平板 ≥ 30fps |
| 降级 | WebGL2 不可用 → 静态 SVG 花园插画 + 植物列表，种植/浇水/收获仍可用 |

## 9. 权限与安全

- 新 API 资源名 `garden-plots`，权限点由 `scripts/gen-api-perms.mjs` 构建时自动扫描生成，路由内用 `requirePerm("garden-plots", ...)`
- 所有查询与写入都带 `user_id` + `child_id` 双条件（沿用现有隔离方式）
- 时间推进一律以服务端时间为准，客户端时间不参与任何判定
- 浇水 / 收获等消耗性操作在事务内校验库存，防止并发超扣

### API 草案

权限点由 `scripts/gen-api-perms.mjs` 自动扫描生成，该脚本对**集合路由**只映射 `GET→list`、`POST→create`，对 **`[id]` 子路由**映射 `GET→detail`、`PUT→update`、`DELETE→delete`；集合路由上的 PATCH/PUT 不会生成权限点。因此操作类接口走 `[id]` 子路由。

| 方法 | 路径 | 权限点 | 作用 |
|---|---|---|---|
| GET | `/api/garden-plots?childId=` | `api:garden-plots:list` | 返回地块（含推进后的 stage）+ 库存 + 服务端 `now` |
| POST | `/api/garden-plots` | `api:garden-plots:create` | 种植：`{ childId, slot, species }`，消耗种子 |
| PUT | `/api/garden-plots/[id]` | `api:garden-plots:update` | `{ action: "water" \| "rename" \| "move" \| "harvest" }` |

## 10. 分期

- **P0 可玩闭环**：物种表 + Blender 管线出 8 个物种构件 + 3D 场景（地块 / 相机 / 光照）+ 两张新表 + 时间推进 + 种植 / 浇水 / 收获 / 重栽 + 第一个 Tab 入口 + 练习产出库存
- **P1 打磨**：起名 / 挪位置、结算页「🌱 获得一颗向日葵种子」+「去花园看看」、TTS、果实展示、降级方案
- **P2 可选**：多地块扩张（相机横向平移）、季节与天气、猫头鹰进花园当向导

## 11. 验证方式

- `growth.ts` 纯函数单测：跨多阶段推进、浇水边界（超次数、剩余不足）、满阶段不推进、并发条件更新
- Blender 脚本产物校验：命名、面数、文件大小上限、根部原点
- API 集成测试：库存不足时种植/浇水被拒、`user_id` / `child_id` 隔离
- 3D 场景：Playwright 截图 + 真机帧率实测
- 降级路径：强制关闭 WebGL 后仍可完成种植与收获

## 12. 风险与未决

1. **模型观感是最大不确定性**。脚本能生成"能看"的低多边形植物，但好不好看需要几轮视口截图迭代。建议先做 1 个物种打通全流程，确认风格后再批量。
2. **Meshopt decoder 引入前端依赖**（约 25 KB），需确认与 Next 16 + Turbopack 的打包兼容性。
3. **单地块容量**：6×6 = 36 格，按 24h 生命周期一般不会满；满了提示"花园满了"，多地块留 P2。
4. **多成员切换**：切成员要销毁并重建 3D 场景，需确认 GLB 缓存复用（同一物种不重复下载）。
5. **猫头鹰是否进花园**未定，本期不做。
