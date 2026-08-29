import {
  sqliteTable,
  text,
  integer,
  real,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const children = sqliteTable("children", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  name: text("name").notNull(),
  subject: text("subject").notNull().default(""),
  schoolId: integer("school_id"),
  phone: text("phone").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const childTeachers = sqliteTable("child_teachers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id").notNull(),
  teacherId: integer("teacher_id").notNull(),
  stage: text("stage").notNull().default(""),
  startDate: text("start_date").notNull().default(""),
  endDate: text("end_date").notNull().default(""),
  notes: text("notes").notNull().default(""),
});

export const learningRecords = sqliteTable("learning_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  childId: integer("child_id").notNull(),
  date: text("date").notNull(),
  height: real("height"), // cm
  weight: real("weight"), // kg
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const healthRecords = sqliteTable("health_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  childId: integer("child_id").notNull(),
  term: text("term").notNull(),
  period: text("period").notNull(),
  idx: integer("idx").notNull().default(0),
});

// 学期（每个孩子独立一套），课程表/学习情况/学费记录按 semester_id 关联
export const semesters = sqliteTable("semesters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id").notNull(),
  name: text("name").notNull(),
  year: text("year").notNull().default(""), // 年份，如 2026
  startDate: text("start_date").notNull().default(""), // YYYY-MM-DD
  endDate: text("end_date").notNull().default(""), // YYYY-MM-DD
  stage: text("stage").notNull().default(""), // 学习阶段，取值同 STAGES
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const feeRecords = sqliteTable("fee_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id").notNull(),
  title: text("title").notNull(),
  type: text("type").notNull().default("学费"), // 学费|餐费|校车费|兴趣班|杂费|其他
  amount: real("amount").notNull().default(0), // 元
  date: text("date").notNull().default(""), // 缴费日期
  semesterId: integer("semester_id"), // 学期 ID，关联 semesters，可空
  organization: text("organization").notNull().default(""), // 收费单位
  status: text("status").notNull().default("已缴"), // 已缴|未缴
  notes: text("notes").notNull().default(""),
  attachments: text("attachments").notNull().default("[]"), // 凭证照片
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const policyNotes = sqliteTable("policy_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  childId: integer("child_id").notNull(),
  activity: text("activity").notNull(),
  difficulty: text("difficulty").notNull().default("简单"),
  config: text("config").notNull().default(""), // JSON 字符串，空表示未自定义
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// 知识点掌握度（每孩子每活动每知识点一条）：选题时薄弱项加权
export const gardenMastery = sqliteTable("garden_mastery", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  childId: integer("child_id").notNull(),
  char: text("char").notNull(), // 单个汉字
  pinyin: text("pinyin").notNull().default(""), // 带声调，服务端 pinyin-pro 自动注音
  word: text("word").notNull().default(""), // 组词示例，可空
  tier: integer("tier").notNull().default(1), // 难度档 1|2|3
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});
