# 学期管理与 ID 关联 · 设计文档

日期：2026-08-29
状态：已确认（用户批准方案 A）

## 背景与问题

- 课程表的「学期」是 `timetable_slots.term` 自由文本；「新学期」按钮只在页面本地临时创建学期名，不落库、不能重命名和删除，学期列表从已有课程反推（课程清空后学期消失）。
- 学习情况（`learning_records.term`）、学费记录（`fee_records.term`）同样是手填文本。
- 数据库没有学期实体，无法统一维护，改名后各处文本对不上。

## 目标

1. 提供「学期管理」页，对学期做增删改查（按孩子独立一套）。
2. 课程表、学习情况、学费记录的学期改为下拉选择、按学期 ID 关联。
3. 课程表页提供「学期管理」入口按钮，点击跳转管理页。
4. 旧数据（学期文本）自动迁移，无缝过渡。

## 方案对比

- **方案 A（采纳）：独立学期实体 + ID 关联**。新增 `semesters` 表与 `/semesters` 管理页，三处业务改为 `semester_id` 关联。重命名全站自动生效，删除有引用保护。与教育经历页「学校管理 + schoolId 关联」模式同构。
- 方案 B（否决）：保留文本字段、仅加管理页。改动小，但改名后旧记录学期名对不上，未解决根本问题。

## 数据模型

### 新表 `semesters`（每个孩子独立）

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | INTEGER PK AUTOINCREMENT | |
| child_id | INTEGER NOT NULL | 所属孩子 |
| name | TEXT NOT NULL | 学期名称，如「一年级上学期」「2026 秋季」 |
| year | TEXT NOT NULL DEFAULT '' | 年份，如 2026 |
| start_date | TEXT NOT NULL DEFAULT '' | 开始日期 YYYY-MM-DD |
| end_date | TEXT NOT NULL DEFAULT '' | 结束日期 YYYY-MM-DD |
| stage | TEXT NOT NULL DEFAULT '' | 学习阶段，复用 `@/lib/api` 的 STAGES（幼儿园|小学|初中|高中|大学|培训机构） |
| notes | TEXT NOT NULL DEFAULT '' | 备注 |
| created_at | TEXT NOT NULL | ISO 时间 |

约束：`UNIQUE(child_id, name)`（同孩子下学期不重名）；索引 `idx_semesters_child ON semesters(child_id)`。

### 关联列

`timetable_slots`、`learning_records`、`fee_records` 各新增 `semester_id INTEGER`（可空）。`src/db/schema.ts` 与 `src/db/index.ts` 的建表 SQL 同步更新；列补充用现有 `ensureColumn` 机制（`INTEGER` 可空）。

## 旧数据自动迁移（一次性）

- 启动时先探测 `sqlite_master` 中 `semesters` 表是否存在；仅当**本次启动首次创建**该表时执行迁移。
- 对三张表分别取 `DISTINCT child_id, term`（`term != ''`）：按孩子+名称写入 `semesters`（stage 留空），随后 `UPDATE ... SET semester_id = (SELECT id FROM semesters WHERE child_id = t.child_id AND name = t.term) WHERE term != '' AND semester_id IS NULL`。
- `timetable_slots.term`、`learning_records.term`、`fee_records.term` 文本列保留不删（旧数据展示兜底），新记录不再写入文本。

## API

- `GET/POST /api/semesters?childId=`：复用 `makeCollectionHandlers(semesters, { childScoped: true })`，但 POST 用自定义实现（校验重名，返回友好错误而非 500）。
- `GET/PUT/DELETE /api/semesters/[id]`：自定义实现（复用 `requireAuth`）：
  - PUT：重名校验（排除自身）；改名后执行 `UPDATE timetable_period_order SET term = 新名 WHERE child_id = 该孩子 AND term = 旧名`，保证已拖拽的节次顺序不丢失。
  - DELETE：被 `timetable_slots` / `learning_records` / `fee_records` 任一引用（按 `semester_id`）时返回 400「该学期正在被课程表/学习情况/学费记录使用，无法删除」；允许删除时顺带清理该孩子 + 该学期当前名称对应的 `timetable_period_order` 行。

## 页面

### 1. 新页面 `/semesters`（学期管理）

- `CrudSection` 实现（与「学校管理」同款交互），`title="学期管理"`，`endpoint=/api/semesters?childId=X`，`childId` 传入。
- 字段：名称（必填）、年份、开始日期（date）、结束日期（date）、学习阶段（select STAGES）、备注（textarea）。
- 列表项：名称加粗 + 阶段/年份 Chip + 起止日期 + 备注。

### 2. 导航

`AppShell` 的 NAV 在「课程表」后插入 `{ href: "/semesters", label: "学期管理", icon: "icon-critterpedia" }`（图标库仅 10 个图标，复用教育域图标）。

### 3. 课程表页 `/timetable`

- 学期下拉数据源改为 `/api/semesters?childId=`（Select 的 key 为学期 ID），排序：年份升序 → 开始日期升序 → id 升序。
- 选中态由学期名改为 `semesterId`；课程按 `semester_id` 过滤；节次顺序仍按学期名存取（取当前学期的 `name` 作为 term）。
- 「新学期」按钮及弹窗移除，改为「学期管理」按钮（`router.push("/semesters")`）。
- 无学期时引导文案：「还没有学期，点击『学期管理』去创建」。
- 排课保存 payload：`semesterId`（数字）；`slotForm` 去掉 `term`。

### 4. 学习情况页 `/learning` 与学费记录页 `/fees`

- 学期文本字段替换为 `{ name: "semesterId", label: "学期/所属学期", type: "select", refList: "semesters" }`，可留空。
- `CrudSection.loadRefs` 扩展：`refList: "semesters"` 时按 `childId` 拉取 `/api/semesters?childId=`。
- 列表显示按 ID 解析学期名（`semesters.find(...)?.name`，兜底旧字段 `item.term`），与教育经历页解析学校名同一模式。

## 错误处理

- 学期重名：API 返回友好错误信息，CrudSection 表单内展示。
- 删除被引用学期：API 拒绝并提示，前端 Notification 展示。
- 课程表/学习情况/学费记录在无学期时的空态文案。

## 非目标（YAGNI）

- 不做学期复制/按学年批量生成。
- 不做按日期自动推断所属学期。
- 不把 `timetable_period_order` 迁移为按 `semester_id` 存储（保留按学期名 + 重命名同步机制）。
- 不删除三张表的遗留 `term` 文本列。

## 验证方式

1. `npm run build` 通过、无 TypeScript 错误。
2. 浏览器手动验证：创建学期 → 课程表下拉可选/排课 → 学习情况、学费记录选学期 → 重命名学期后各处显示同步、节次顺序保留 → 删除被引用学期被拒绝、删除未引用学期成功 → 旧数据（已有学期文本）自动出现在学期管理中。
