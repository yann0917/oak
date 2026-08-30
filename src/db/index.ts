import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(path.join(dataDir, "oak.db"));
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("journal_mode = WAL");

sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS children (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'female',
  birthday TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '幼儿园',
  address TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT '幼儿园',
  class_name TEXT NOT NULL DEFAULT '',
  student_no TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  school_id INTEGER,
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS child_teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS learning_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  date TEXT NOT NULL DEFAULT '',
  semester_id INTEGER,
  subject TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  evaluation TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS growth_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  height REAL,
  weight REAL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS health_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT '体检',
  date TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  organization TEXT NOT NULL DEFAULT '',
  teacher_name TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '在读',
  progress TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS moments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  date TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  photos TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS timetable_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  semester_id INTEGER,
  day TEXT NOT NULL DEFAULT '周一',
  period TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  time_range TEXT NOT NULL DEFAULT '',
  teacher_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS timetable_period_order (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  term TEXT NOT NULL,
  period TEXT NOT NULL,
  idx INTEGER NOT NULL DEFAULT 0,
  UNIQUE(child_id, term, period)
);
CREATE TABLE IF NOT EXISTS semesters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  year TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fee_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '学费',
  amount REAL NOT NULL DEFAULT 0,
  date TEXT NOT NULL DEFAULT '',
  semester_id INTEGER,
  organization TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '已缴',
  notes TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS policy_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  issuer TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '招生入学',
  date TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

-- 学习园地
CREATE TABLE IF NOT EXISTS garden_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  activity TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT '简单',
  total INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  wrong_items TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS garden_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  activity TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT '简单',
  config TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS garden_mastery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  activity TEXT NOT NULL,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  last_correct INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS garden_characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  char TEXT NOT NULL,
  pinyin TEXT NOT NULL DEFAULT '',
  word TEXT NOT NULL DEFAULT '',
  tier INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- 提醒中心
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  child_id INTEGER,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  schedule_type TEXT NOT NULL DEFAULT 'once',
  cron_expr TEXT NOT NULL DEFAULT '',
  time_of_day TEXT NOT NULL DEFAULT '09:00',
  weekdays TEXT NOT NULL DEFAULT '',
  month_days TEXT NOT NULL DEFAULT '',
  target_date TEXT NOT NULL DEFAULT '',
  advance_days TEXT NOT NULL DEFAULT '',
  next_run_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  enabled INTEGER NOT NULL DEFAULT 1,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminder_rules (
  reminder_id INTEGER PRIMARY KEY REFERENCES reminders(id) ON DELETE CASCADE,
  channels TEXT NOT NULL DEFAULT 'wxpusher',
  quiet_hours TEXT NOT NULL DEFAULT '',
  min_interval_minutes INTEGER NOT NULL DEFAULT 60,
  max_retries INTEGER NOT NULL DEFAULT 3,
  fallback_channel TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS push_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  type TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  reminder_id INTEGER,
  channel TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 按 child_id 查询是所有业务路由的主路径，补索引避免大表全扫描
CREATE INDEX IF NOT EXISTS idx_enrollments_child ON enrollments(child_id);
CREATE INDEX IF NOT EXISTS idx_child_teachers_child ON child_teachers(child_id);
CREATE INDEX IF NOT EXISTS idx_learning_records_child ON learning_records(child_id);
CREATE INDEX IF NOT EXISTS idx_growth_records_child ON growth_records(child_id);
CREATE INDEX IF NOT EXISTS idx_health_records_child ON health_records(child_id);
CREATE INDEX IF NOT EXISTS idx_activities_child ON activities(child_id);
CREATE INDEX IF NOT EXISTS idx_moments_child ON moments(child_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_child ON timetable_slots(child_id);
CREATE INDEX IF NOT EXISTS idx_fee_records_child ON fee_records(child_id);
CREATE INDEX IF NOT EXISTS idx_semesters_child ON semesters(child_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_semesters_child_name ON semesters(child_id, name);
CREATE INDEX IF NOT EXISTS idx_garden_records_child ON garden_records(child_id);
CREATE INDEX IF NOT EXISTS idx_garden_settings_child ON garden_settings(child_id);
CREATE INDEX IF NOT EXISTS idx_garden_mastery_child ON garden_mastery(child_id);
CREATE INDEX IF NOT EXISTS idx_garden_characters_child ON garden_characters(child_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_garden_settings_child_activity ON garden_settings(child_id, activity);
CREATE UNIQUE INDEX IF NOT EXISTS idx_garden_mastery_child_activity_item ON garden_mastery(child_id, activity, item_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_garden_characters_child_char ON garden_characters(child_id, char);

-- 提醒中心：调度只看 idx_reminders_due，一条索引查询搞定到期检查
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_push_logs_reminder ON push_logs(reminder_id);
CREATE INDEX IF NOT EXISTS idx_push_logs_status ON push_logs(status, created_at);
`);

// 级联删除（reminders 删行时自动清 reminder_rules）
sqlite.pragma("foreign_keys = ON");

// 旧库字段迁移：缺列时补齐
function ensureColumn(table: string, column: string, ddl: string) {
  const cols = (sqlite.pragma(`table_info(${table})`) as any[]).map((c) => c.name);
  if (!cols.includes(column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}
ensureColumn("children", "student_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("enrollments", "student_no", "TEXT NOT NULL DEFAULT ''");
ensureColumn("schools", "website", "TEXT NOT NULL DEFAULT ''");
ensureColumn("schools", "phone", "TEXT NOT NULL DEFAULT ''");
ensureColumn("schools", "intro", "TEXT NOT NULL DEFAULT ''");
ensureColumn("timetable_slots", "semester_id", "INTEGER");
ensureColumn("learning_records", "semester_id", "INTEGER");
ensureColumn("fee_records", "semester_id", "INTEGER");
ensureColumn("push_logs", "content", "TEXT NOT NULL DEFAULT ''");

// ===== 提醒中心多用户迁移：旧库（无 user_id 概念）补齐并按首个账号回填 =====
// 首个账号（种子 admin）之外的旧数据均归属该账号
const firstUserId = (sqlite.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get() as any)?.id ?? 1;

// push_channels 旧结构是 type 全局 UNIQUE，无法直接删约束（SQLite 不允许 DROP autoindex），
// 重建一次改为「按用户唯一」；新库首次创建已含 user_id，跳过
const pushChannelCols = (sqlite.pragma("table_info(push_channels)") as any[]).map((c) => c.name);
if (!pushChannelCols.includes("user_id")) {
  sqlite.exec("ALTER TABLE push_channels RENAME TO push_channels_old");
  sqlite.exec(`CREATE TABLE push_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`);
  sqlite
    .prepare(
      "INSERT INTO push_channels (id, user_id, type, config, enabled, created_at) SELECT id, ?, type, config, enabled, created_at FROM push_channels_old"
    )
    .run(firstUserId);
  sqlite.exec("DROP TABLE push_channels_old");
}

ensureColumn("reminders", "user_id", "INTEGER");
ensureColumn("push_logs", "user_id", "INTEGER");
ensureColumn("push_channels", "user_id", "INTEGER");
sqlite.prepare("UPDATE reminders SET user_id = ? WHERE user_id IS NULL").run(firstUserId);
sqlite.prepare("UPDATE push_logs SET user_id = ? WHERE user_id IS NULL").run(firstUserId);
sqlite.prepare("UPDATE push_channels SET user_id = ? WHERE user_id IS NULL").run(firstUserId);

// 多用户相关的索引必须在列迁移后创建（旧库启动时列尚不存在）
sqlite.exec(`
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id, id);
CREATE INDEX IF NOT EXISTS idx_push_logs_user ON push_logs(user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_channels_user_type ON push_channels(user_id, type);
`);

// 旧学期文本迁移（幂等）：term 列还在时，把遗留学期文本按孩子补建入学学期并回填 semester_id，然后删除 term 列
for (const table of ["timetable_slots", "learning_records", "fee_records"]) {
  const cols = (sqlite.pragma(`table_info(${table})`) as any[]).map((c) => c.name);
  if (!cols.includes("term") || !cols.includes("semester_id")) continue;
  const insertSemester = sqlite.prepare(
    "INSERT INTO semesters (child_id, name, created_at) VALUES (?, ?, ?)"
  );
  const findSemester = sqlite.prepare("SELECT id FROM semesters WHERE child_id = ? AND name = ?");
  const legacy = sqlite
    .prepare(`SELECT DISTINCT child_id, term FROM ${table} WHERE term != ''`)
    .all() as any[];
  for (const row of legacy) {
    if (!findSemester.get(row.child_id, row.term)) {
      insertSemester.run(row.child_id, row.term, new Date().toISOString());
    }
  }
  sqlite
    .prepare(
      `UPDATE ${table} SET semester_id = (SELECT id FROM semesters WHERE child_id = ${table}.child_id AND name = ${table}.term) WHERE semester_id IS NULL`
    )
    .run();
  sqlite.exec(`ALTER TABLE ${table} DROP COLUMN term`);
}

// 种子账号：首次运行时创建默认管理员 admin/admin123
const userCount = (sqlite.prepare("SELECT COUNT(*) as c FROM users").get() as any).c;
if (userCount === 0) {
  const hash = bcrypt.hashSync("admin123", 10);
  sqlite
    .prepare(
      "INSERT OR IGNORE INTO users (username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)"
    )
    .run("admin", hash, "管理员", new Date().toISOString());
}

export const db = drizzle(sqlite, { schema });
