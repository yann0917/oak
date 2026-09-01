import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(), // Casbin 的 sub
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull().default(""),
  isAdmin: integer("is_admin").notNull().default(0), // 超管：菜单/权限短路放行
  status: integer("status").notNull().default(1), // 1 启用 | 0 停用
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const children = sqliteTable("children", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  name: text("name").notNull(),
  nickname: text("nickname").notNull().default(""),
  gender: text("gender").notNull().default("female"), // female | male
  birthday: text("birthday").notNull().default(""), // YYYY-MM-DD
  studentId: text("student_id").notNull().default(""), // 学籍号（全国唯一）
  photo: text("photo").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const schools = sqliteTable("schools", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  name: text("name").notNull(),
  type: text("type").notNull().default("幼儿园"), // 幼儿园|小学|初中|高中|大学|培训机构
  address: text("address").notNull().default(""),
  website: text("website").notNull().default(""),
  phone: text("phone").notNull().default(""),
  intro: text("intro").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const enrollments = sqliteTable("enrollments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  schoolId: integer("school_id").notNull(),
  stage: text("stage").notNull().default("幼儿园"), // 学习阶段
  className: text("class_name").notNull().default(""),
  studentNo: text("student_no").notNull().default(""), // 该阶段的学号
  startDate: text("start_date").notNull().default(""),
  endDate: text("end_date").notNull().default(""), // 空表示在读
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const teachers = sqliteTable("teachers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  name: text("name").notNull(),
  subject: text("subject").notNull().default(""),
  schoolId: integer("school_id"),
  phone: text("phone").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const childTeachers = sqliteTable("child_teachers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  teacherId: integer("teacher_id").notNull(),
  stage: text("stage").notNull().default(""),
  startDate: text("start_date").notNull().default(""),
  endDate: text("end_date").notNull().default(""),
  notes: text("notes").notNull().default(""),
});

export const learningRecords = sqliteTable("learning_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  date: text("date").notNull().default(""),
  semesterId: integer("semester_id"), // 学期 ID，关联 semesters，可空
  subject: text("subject").notNull().default(""),
  grade: text("grade").notNull().default(""), // 成绩/评级
  evaluation: text("evaluation").notNull().default(""), // good|great|poor 等，可空
  content: text("content").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const growthRecords = sqliteTable("growth_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  date: text("date").notNull(),
  height: real("height"), // cm
  weight: real("weight"), // kg
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const healthRecords = sqliteTable("health_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  type: text("type").notNull().default("体检"), // 体检|疫苗|用药|病历
  date: text("date").notNull().default(""),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  attachments: text("attachments").notNull().default("[]"), // JSON array of file paths
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const activities = sqliteTable("activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""), // 类别：美术/音乐/体育等
  organization: text("organization").notNull().default(""),
  teacherName: text("teacher_name").notNull().default(""),
  startDate: text("start_date").notNull().default(""),
  endDate: text("end_date").notNull().default(""),
  status: text("status").notNull().default("在读"), // 在读|已结课
  progress: text("progress").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const moments = sqliteTable("moments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  date: text("date").notNull().default(""),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  photos: text("photos").notNull().default("[]"), // JSON array of file paths
  tags: text("tags").notNull().default(""), // 逗号分隔
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const timetableSlots = sqliteTable("timetable_slots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  semesterId: integer("semester_id"), // 学期 ID，关联 semesters，可空
  day: text("day").notNull().default("周一"), // 周一~周日
  period: text("period").notNull().default(""), // 节次，如 上午第一节
  subject: text("subject").notNull().default(""),
  timeRange: text("time_range").notNull().default(""), // 如 08:30-09:10
  teacherName: text("teacher_name").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 节次的手动排序（每个孩子每个学期一套行顺序）
export const timetablePeriodOrder = sqliteTable("timetable_period_order", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  term: text("term").notNull(),
  period: text("period").notNull(),
  idx: integer("idx").notNull().default(0),
});

// 学期（每个孩子独立一套），课程表/学习情况/学费记录按 semester_id 关联
export const semesters = sqliteTable("semesters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  name: text("name").notNull(),
  year: text("year").notNull().default(""), // 年份，如 2026
  startDate: text("start_date").notNull().default(""), // YYYY-MM-DD
  endDate: text("end_date").notNull().default(""), // YYYY-MM-DD
  stage: text("stage").notNull().default(""), // 学习阶段，取值同 STAGES
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ===== 家庭脉搏（DIKW 知识层）：AI 复盘洞察与指南 =====

// 周/月复盘结果：每期一条（AI 从流水/账单/健康等数据中提炼的家庭经验）
export const familyInsights = sqliteTable("family_insights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户
  period: text("period").notNull().default("monthly"), // weekly|monthly
  startDate: text("start_date").notNull(), // 复盘窗口起点（周一/月初）YYYY-MM-DD
  endDate: text("end_date").notNull(), // 复盘窗口终点（今天）YYYY-MM-DD
  status: text("status").notNull().default("generating"), // generating|done|failed
  insights: text("insights").notNull().default("[]"), // JSON：[{type, insight, actionSop}]
  error: text("error").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 用户从洞察中「一键保存至指南」的 SOP（长期家庭知识资产）
export const familySops = sqliteTable("family_sops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户
  insightId: integer("insight_id"), // 来源洞察（可空：手工添加）
  type: text("type").notNull().default(""),
  insight: text("insight").notNull().default(""),
  actionSop: text("action_sop").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 卡证档案：证件/证明/病历/检测报告等文档原件（照片+关键结构化信息），成员可空（家庭共用）
export const certArchives = sqliteTable("cert_archives", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id"), // 归属成员，可空（如全家共用的证件）
  category: text("category").notNull().default("证件"), // 证件|证明|病历|检测单|检测报告|协议|证书|其他
  title: text("title").notNull(),
  number: text("number").notNull().default(""), // 证号/编号
  issuer: text("issuer").notNull().default(""), // 签发/出具单位
  issueDate: text("issue_date").notNull().default(""), // 签发日期 YYYY-MM-DD
  expireDate: text("expire_date").notNull().default(""), // 到期日期 YYYY-MM-DD，空表示长期
  content: text("content").notNull().default(""), // 说明/图片识别原文
  notes: text("notes").notNull().default(""),
  attachments: text("attachments").notNull().default("[]"), // 原件照片 /uploads/* 路径 JSON 数组
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 账单（原学费记录）：按学期/日期记录家庭收支，支持附凭证
export const bills = sqliteTable("bills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  title: text("title").notNull(),
  type: text("type").notNull().default("学费"), // 学费|餐费|校车费|兴趣班|医疗|购物|交通|水电|生活费|收入|其他
  direction: text("direction").notNull().default("支出"), // 支出|收入
  amount: real("amount").notNull().default(0), // 元
  date: text("date").notNull().default(""), // 收支日期
  semesterId: integer("semester_id"), // 学期 ID，关联 semesters，可空
  organization: text("organization").notNull().default(""), // 收费单位
  status: text("status").notNull().default("已缴"), // 已缴|未缴
  notes: text("notes").notNull().default(""),
  attachments: text("attachments").notNull().default("[]"), // 凭证照片
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const policyNotes = sqliteTable("policy_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  title: text("title").notNull(),
  issuer: text("issuer").notNull().default(""), // 发布单位，如 XX市教育局
  category: text("category").notNull().default("招生入学"), // 招生入学|升学政策|健康疫苗|减负规定|其他
  date: text("date").notNull().default(""), // 发布日期
  content: text("content").notNull().default(""),
  link: text("link").notNull().default(""), // 原文链接
  attachments: text("attachments").notNull().default("[]"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ===== 学习园地 =====

// 练习会话记录：每完成一轮练习写入一条
export const gardenRecords = sqliteTable("garden_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  activity: text("activity").notNull().default(""), // 活动 key，同 GARDEN_ACTIVITIES
  difficulty: text("difficulty").notNull().default("简单"), // 简单|中等|困难
  total: integer("total").notNull().default(0), // 本轮题数
  correct: integer("correct").notNull().default(0), // 答对数
  durationSec: integer("duration_sec").notNull().default(0), // 用时（秒）
  wrongItems: text("wrong_items").notNull().default("[]"), // 答错知识点 label，JSON 数组
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 难度与个性化配置（每孩子每活动一条）：difficulty + config JSON（roundSize、数学参数、字库开关等）
export const gardenSettings = sqliteTable("garden_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  activity: text("activity").notNull(),
  difficulty: text("difficulty").notNull().default("简单"),
  config: text("config").notNull().default(""), // JSON 字符串，空表示未自定义
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 知识点掌握度（每孩子每活动每知识点一条）：选题时薄弱项加权
export const gardenMastery = sqliteTable("garden_mastery", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  activity: text("activity").notNull(),
  itemKey: text("item_key").notNull(), // 知识点唯一键
  label: text("label").notNull().default(""), // 展示名，如 "天 tiān"
  correctCount: integer("correct_count").notNull().default(0),
  wrongCount: integer("wrong_count").notNull().default(0),
  lastCorrect: integer("last_correct").notNull().default(0), // 最近一次是否答对 0|1
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 识字卡自定义字库（每孩子独立，内置字库之外的补充）
export const gardenCharacters = sqliteTable("garden_characters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（多账号隔离）
  childId: integer("child_id").notNull(),
  char: text("char").notNull(), // 单个汉字
  pinyin: text("pinyin").notNull().default(""), // 带声调，服务端 pinyin-pro 自动注音
  word: text("word").notNull().default(""), // 组词示例，可空
  tier: integer("tier").notNull().default(1), // 难度档 1|2|3
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ===== 提醒中心 =====

// 提醒主表：调度只认 next_run_at，预计算落库，进程重启零丢失
export const reminders = sqliteTable("reminders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（为多账号预留）
  childId: integer("child_id"), // 关联孩子（可空，模板渲染 {{member}} 用）
  title: text("title").notNull(),  content: text("content").notNull().default(""), // 支持 {{member}} {{days_left}} {{target_date}}
  attachments: text("attachments").notNull().default("[]"), // 原始文档照片 /uploads/* 路径 JSON 数组
  scheduleType: text("schedule_type").notNull().default("once"), // once|daily|weekly|monthly|cron
  cronExpr: text("cron_expr").notNull().default(""),
  timeOfDay: text("time_of_day").notNull().default("09:00"), // daily/weekly/monthly 的触发时刻 HH:mm
  weekdays: text("weekdays").notNull().default(""), // weekly: '1,3,5'（1=周一）
  monthDays: text("month_days").notNull().default(""), // monthly: '1,15'
  targetDate: text("target_date").notNull().default(""), // YYYY-MM-DD 事件/截止日（once 提醒与提前预告用）
  advanceDays: text("advance_days").notNull().default(""), // '7,3,1' 提前 N 天预告，逗号分隔（已按序展开进 next_run_at）
  nextRunAt: text("next_run_at").notNull(),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  enabled: integer("enabled").notNull().default(1),
  retryCount: integer("retry_count").notNull().default(0), // 连续失败重试次数（退避 30s/2m/10m）
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 推送规则（一对一，避免过度设计成多对多）
export const reminderRules = sqliteTable("reminder_rules", {
  reminderId: integer("reminder_id").primaryKey().references(() => reminders.id, { onDelete: "cascade" }),
  channels: text("channels").notNull().default("wxpusher"), // 'wxpusher,inapp' 逗号分隔
  quietHours: text("quiet_hours").notNull().default(""), // '22:00-07:00' 静默期顺延
  minIntervalMinutes: integer("min_interval_minutes").notNull().default(60),
  maxRetries: integer("max_retries").notNull().default(3),
  fallbackChannel: text("fallback_channel").notNull().default(""), // 主渠道全挂后的兜底渠道
});

// 渠道绑定（每用户每种渠道一行配置）
export const pushChannels = sqliteTable(
  "push_channels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().default(1), // 归属用户
    type: text("type").notNull(), // wxpusher|serverchan|email|inapp
    config: text("config").notNull().default("{}"), // JSON: {appToken,uid} / {sendKey} / {apiKey,from,to}
    enabled: integer("enabled").notNull().default(1),
    createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex("idx_push_channels_user_type").on(t.userId, t.type)]
);

// 发送流水：送达状态可查、节流判断、排障全靠它
export const pushLogs = sqliteTable("push_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户（站内通知按用户读取）
  reminderId: integer("reminder_id"), // 测试推送/渠道测试可为空
  channel: text("channel").notNull().default(""),
  status: text("status").notNull(), // sent|failed|muted
  content: text("content").notNull().default(""), // 发送的消息正文（站内通知栏展示）
  error: text("error").notNull().default(""),
  read: integer("read").notNull().default(0), // 站内通知已读标记
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ===== 错题本/笔记（FSRS 间隔复习）=====

// 笔记本分组：如「数学错题」「英语笔记」
export const notebooks = sqliteTable("notebooks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户
  name: text("name").notNull(),
  icon: text("icon").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 笔记/错题：content 为 novel(TipTap) JSON 字符串；question/answer 是复习卡正反面（Markdown + $公式）
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户
  notebookId: integer("notebook_id").references(() => notebooks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  question: text("question").notNull().default(""),
  answer: text("answer").notNull().default(""),
  tags: text("tags").notNull().default("[]"), // JSON 字符串数组
  source: text("source").notNull().default(""),
  enabled: integer("enabled").notNull().default(1), // 是否参与复习
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// FSRS 卡状态（与 notes 1:1），调度字段平铺
export const reviewCards = sqliteTable("review_cards", {
  noteId: integer("note_id").primaryKey().references(() => notes.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().default(1), // 归属用户
  due: text("due").notNull(), // ISO 时间
  stability: real("stability").notNull().default(0),
  difficulty: real("difficulty").notNull().default(0),
  elapsedDays: integer("elapsed_days").notNull().default(0),
  scheduledDays: integer("scheduled_days").notNull().default(0),
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  state: integer("state").notNull().default(0), // 0 New 1 Learning 2 Review 3 Relearning
  learningSteps: integer("learning_steps").notNull().default(0),
  lastReview: text("last_review"), // ISO 时间，可空
});

// 复习流水：评分/状态留痕，统计与未来画像用
export const reviewLogs = sqliteTable("review_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户
  noteId: integer("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(), // 1 Again 2 Hard 3 Good 4 Easy
  state: integer("state").notNull(),
  due: text("due").notNull(),
  stability: real("stability").notNull().default(0),
  difficulty: real("difficulty").notNull().default(0),
  elapsedDays: integer("elapsed_days").notNull().default(0),
  scheduledDays: integer("scheduled_days").notNull().default(0),
  reviewedAt: text("reviewed_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 待办清单（Microsoft To Do 风格：自定义清单，智能列表为自动视图不落表）
export const todoLists = sqliteTable("todo_lists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户
  name: text("name").notNull(),
  color: text("color").notNull().default("app-blue"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 待办（Microsoft To Do 风格）：智能列表（我的一天/重要/计划/任务）+ 清单 + 到期/提醒/重复/星标/备注
export const todos = sqliteTable("todos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户
  title: text("title").notNull(),
  listId: integer("list_id"), // 所属清单；null = 智能列表「任务」
  note: text("note").notNull().default(""),
  dueDate: text("due_date").notNull().default(""), // 到期日 YYYY-MM-DD
  remindAt: text("remind_at").notNull().default(""), // 提醒时间 YYYY-MM-DDTHH:mm（转提醒中心 once 提醒）
  repeatRule: text("repeat_rule").notNull().default(""), // daily|weekly|monthly|yearly|Nd（每 N 天）
  priority: integer("priority").notNull().default(0), // 1 = 重要（星标）
  myDayDate: text("my_day_date").notNull().default(""), // 加入「我的一天」的日期 YYYY-MM-DD
  reminderId: integer("reminder_id"), // 关联的提醒中心提醒（完成/删除时停用）
  done: integer("done").notNull().default(0),
  completedAt: text("completed_at").notNull().default(""), // 完成时间 ISO
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 子任务步骤（不单独设期/提醒，勾选式）
export const todoSteps = sqliteTable("todo_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户
  todoId: integer("todo_id").notNull(),
  title: text("title").notNull(),
  done: integer("done").notNull().default(0),
  sort: integer("sort").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ===== DIKW 快记（数据层原始流水）=====

// 一句话快记：AI 未启用或归类失败时也保留原始流水，作为 Data 层资产
export const quickNotes = sqliteTable("quick_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // 归属用户
  childId: integer("child_id"), // AI 识别或手动归类出的归属成员，可空
  content: text("content").notNull(), // 原始一句话
  photos: text("photos").notNull().default("[]"), // 随记照片 /uploads/* 路径 JSON 数组
  status: text("status").notNull().default("pending"), // pending|processed|failed
  aiType: text("ai_type"), // health|fee|growth|moment|learning|reminder|todo|policy|other
  result: text("result").notNull().default("{}"), // JSON：{summary, module, label, path, targetId, error}
  processedAt: text("processed_at"), // 归类完成时间，未归类为空
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// AI 大模型配置（每用户一行）：OpenAI 兼容接口，apiKey 与 push_channels 同样存库
export const aiSettings = sqliteTable(
  "ai_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().default(1),
    provider: text("provider").notNull().default("deepseek"), // deepseek|openai|qwen|zhipu|moonshot|ollama|custom
    baseUrl: text("base_url").notNull().default(""),
    apiKey: text("api_key").notNull().default(""),
    model: text("model").notNull().default(""),
    enabled: integer("enabled").notNull().default(0),
    updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex("idx_ai_settings_user").on(t.userId)]
);

// ===== 权限（RBAC）：业务表即策略源，Casbin 不建自己的表 =====

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(), // 如 "editor"，即 Casbin 的角色名
  name: text("name").notNull(),
  remark: text("remark").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 菜单树：dir 目录 | menu 菜单 | button 按钮（button 不进侧边栏，只作为 perms 权限点）
export const menus = sqliteTable("menus", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  parentId: integer("parent_id"), // 树形，null = 顶级
  type: text("type").notNull(), // dir | menu | button
  name: text("name").notNull(),
  path: text("path").notNull().default(""), // 路由，button 为空
  icon: text("icon").notNull().default(""),
  perms: text("perms").notNull().default(""), // 权限标识，如 system:user:list，dir/menu 可为空
  sort: integer("sort").notNull().default(0),
  visible: integer("visible").notNull().default(1),
});

export const usersRoles = sqliteTable(
  "users_roles",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })]
);

export const rolesMenus = sqliteTable(
  "roles_menus",
  {
    roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    menuId: integer("menu_id").notNull().references(() => menus.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.menuId] })]
);
