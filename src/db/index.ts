import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import * as schema from "./schema";
import { ensurePermissionSeeds } from "./seed";

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
  is_admin INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS children (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
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
  user_id INTEGER NOT NULL DEFAULT 1,
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
  user_id INTEGER NOT NULL DEFAULT 1,
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
  user_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  school_id INTEGER,
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS child_teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  child_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS learning_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
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
  user_id INTEGER NOT NULL DEFAULT 1,
  child_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  height REAL,
  weight REAL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS health_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
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
  user_id INTEGER NOT NULL DEFAULT 1,
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
  user_id INTEGER NOT NULL DEFAULT 1,
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
  user_id INTEGER NOT NULL DEFAULT 1,
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
  user_id INTEGER NOT NULL DEFAULT 1,
  child_id INTEGER NOT NULL,
  term TEXT NOT NULL,
  period TEXT NOT NULL,
  idx INTEGER NOT NULL DEFAULT 0,
  UNIQUE(child_id, term, period)
);
CREATE TABLE IF NOT EXISTS semesters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  child_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  year TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  child_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '学费',
  direction TEXT NOT NULL DEFAULT '支出',
  amount REAL NOT NULL DEFAULT 0,
  date TEXT NOT NULL DEFAULT '',
  semester_id INTEGER,
  organization TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '已缴',
  notes TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cert_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  child_id INTEGER,
  category TEXT NOT NULL DEFAULT '证件',
  title TEXT NOT NULL,
  number TEXT NOT NULL DEFAULT '',
  issuer TEXT NOT NULL DEFAULT '',
  issue_date TEXT NOT NULL DEFAULT '',
  expire_date TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS family_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  period TEXT NOT NULL DEFAULT 'monthly',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating',
  insights TEXT NOT NULL DEFAULT '[]',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS family_sops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  insight_id INTEGER,
  type TEXT NOT NULL DEFAULT '',
  insight TEXT NOT NULL DEFAULT '',
  action_sop TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quick_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  child_id INTEGER,
  content TEXT NOT NULL,
  photos TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  ai_type TEXT,
  result TEXT NOT NULL DEFAULT '{}',
  processed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 0,
  search_api_key TEXT NOT NULL DEFAULT '',
  active_provider_id INTEGER,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  provider TEXT NOT NULL DEFAULT 'custom',
  name TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  api_mode TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL DEFAULT '新对话',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL DEFAULT 1,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS policy_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
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
  user_id INTEGER NOT NULL DEFAULT 1,
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
  user_id INTEGER NOT NULL DEFAULT 1,
  child_id INTEGER NOT NULL,
  activity TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT '简单',
  config TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS garden_mastery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
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
  user_id INTEGER NOT NULL DEFAULT 1,
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
  attachments TEXT NOT NULL DEFAULT '[]',
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

-- 错题本/笔记（FSRS 间隔复习）
CREATE TABLE IF NOT EXISTS notebooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  notebook_id INTEGER REFERENCES notebooks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_cards (
  note_id INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL DEFAULT 1,
  due TEXT NOT NULL,
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  elapsed_days INTEGER NOT NULL DEFAULT 0,
  scheduled_days INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  state INTEGER NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  last_review TEXT
);

CREATE TABLE IF NOT EXISTS review_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  state INTEGER NOT NULL,
  due TEXT NOT NULL,
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  elapsed_days INTEGER NOT NULL DEFAULT 0,
  scheduled_days INTEGER NOT NULL DEFAULT 0,
  reviewed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  list_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  remind_at TEXT NOT NULL DEFAULT '',
  repeat_rule TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 0,
  my_day_date TEXT NOT NULL DEFAULT '',
  reminder_id INTEGER,
  done INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS todo_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'app-blue',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS todo_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  todo_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 权限（RBAC）：业务表即策略源
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  remark TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  perms TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS users_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);
CREATE TABLE IF NOT EXISTS roles_menus (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, menu_id)
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
CREATE INDEX IF NOT EXISTS idx_bills_child ON bills(child_id);
CREATE INDEX IF NOT EXISTS idx_cert_archives_user ON cert_archives(user_id, id);
CREATE INDEX IF NOT EXISTS idx_family_insights_user ON family_insights(user_id, period, created_at);
CREATE INDEX IF NOT EXISTS idx_family_sops_user ON family_sops(user_id, id);
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
ensureColumn("bills", "semester_id", "INTEGER");
ensureColumn("push_logs", "content", "TEXT NOT NULL DEFAULT ''");
ensureColumn("users", "is_admin", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "status", "INTEGER NOT NULL DEFAULT 1");
// review_cards 曾在建表后补过 learning_steps 列（存量库升级）
ensureColumn("review_cards", "learning_steps", "INTEGER NOT NULL DEFAULT 0");
// 待办升级（MS To Do 风格）：旧库逐列补齐
ensureColumn("todos", "list_id", "INTEGER");
ensureColumn("todos", "note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("todos", "due_date", "TEXT NOT NULL DEFAULT ''");
ensureColumn("todos", "remind_at", "TEXT NOT NULL DEFAULT ''");
ensureColumn("todos", "repeat_rule", "TEXT NOT NULL DEFAULT ''");
ensureColumn("todos", "priority", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("todos", "my_day_date", "TEXT NOT NULL DEFAULT ''");
ensureColumn("todos", "reminder_id", "INTEGER");
ensureColumn("todos", "completed_at", "TEXT NOT NULL DEFAULT ''");
ensureColumn("quick_notes", "photos", "TEXT NOT NULL DEFAULT '[]'");
// AI 助手接口形态：老库 ai_settings 无 api_mode 列，补上（'' = 按预设）
ensureColumn("ai_settings", "api_mode", "TEXT NOT NULL DEFAULT ''");
// 联网搜索（AnySearch）API Key：'' = 未配置
ensureColumn("ai_settings", "search_api_key", "TEXT NOT NULL DEFAULT ''");
// 当前生效的模型配置（多模型改造后指向 ai_providers.id）
ensureColumn("ai_settings", "active_provider_id", "INTEGER");

// ===== 多模型改造迁移（幂等）：老单行配置 → ai_providers，并设为当前生效 =====
// 老库 ai_settings 含 provider/base_url 列且尚未迁移（无 active_provider_id 指向的行）时回填
const aiProvCount = (sqlite.prepare("SELECT COUNT(*) as c FROM ai_providers").get() as any).c;
const settingsCols = (sqlite.pragma("table_info(ai_settings)") as any[]).map((c: any) => c.name);
if (aiProvCount === 0 && settingsCols.includes("base_url")) {
  const legacyRows = sqlite
    .prepare("SELECT user_id, provider, base_url, api_key, model, api_mode FROM ai_settings WHERE base_url IS NOT NULL AND base_url != ''")
    .all() as any[];
  for (const row of legacyRows) {
    const ins = sqlite
      .prepare(
        "INSERT INTO ai_providers (user_id, provider, name, base_url, api_key, model, api_mode, created_at, updated_at) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?)"
      )
      .run(row.user_id, row.provider || "custom", row.base_url, row.api_key || "", row.model || "", row.api_mode || "", new Date().toISOString(), new Date().toISOString());
    const provId = Number(ins.lastInsertRowid);
    sqlite
      .prepare("UPDATE ai_settings SET active_provider_id = ? WHERE user_id = ?")
      .run(provId, row.user_id);
  }
}
// 每用户每服务商唯一：先按最早行去重（防御多版本数据），再建唯一索引
sqlite.exec(`
DELETE FROM ai_providers WHERE id NOT IN (SELECT MIN(id) FROM ai_providers GROUP BY user_id, provider);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_providers_user_type ON ai_providers(user_id, provider);
`);
// 老库 ai_settings 可能还留着一个默认深空配置行且 enabled=1（全新库无 provider 列，无影响）；
// 若 settings 未指向任何 provider 且存在 provider 行，兜底指向第一条
sqlite.exec(`
UPDATE ai_settings SET active_provider_id = (SELECT id FROM ai_providers WHERE user_id = ai_settings.user_id ORDER BY id LIMIT 1)
WHERE active_provider_id IS NULL AND EXISTS (SELECT 1 FROM ai_providers WHERE user_id = ai_settings.user_id);
`);
ensureColumn("reminders", "attachments", "TEXT NOT NULL DEFAULT '[]'");

// 业务表按用户归属（存量数据默认归首个账号 admin）
ensureColumn("children", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("schools", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("enrollments", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("teachers", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("child_teachers", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("learning_records", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("growth_records", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("health_records", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("activities", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("moments", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("timetable_slots", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("timetable_period_order", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("semesters", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("bills", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("policy_notes", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("garden_records", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("garden_settings", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("garden_mastery", "user_id", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("garden_characters", "user_id", "INTEGER NOT NULL DEFAULT 1");

// ===== 学费记录 → 账单迁移（幂等）：旧库把 fee_records 全量搬进 bills 后删除旧表 =====
const oldFeeExists = sqlite
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fee_records'")
  .get();
if (oldFeeExists) {
  sqlite.exec(`
INSERT INTO bills (id, user_id, child_id, title, type, direction, amount, date, semester_id, organization, status, notes, attachments, created_at)
SELECT id, user_id, child_id, title, type, '支出', amount, date, semester_id, organization, status, notes, attachments, created_at
FROM fee_records;
DROP TABLE fee_records;
`);
}

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

-- 业务表按用户隔离的主查询路径：有 child_id 的用 (user_id, child_id) 复合索引
CREATE INDEX IF NOT EXISTS idx_enrollments_user_child ON enrollments(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_child_teachers_user_child ON child_teachers(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_learning_records_user_child ON learning_records(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_growth_records_user_child ON growth_records(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_health_records_user_child ON health_records(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_activities_user_child ON activities(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_moments_user_child ON moments(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_user_child ON timetable_slots(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_timetable_period_order_user_child ON timetable_period_order(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_semesters_user_child ON semesters(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_bills_user_child ON bills(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_garden_records_user_child ON garden_records(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_garden_settings_user_child ON garden_settings(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_garden_mastery_user_child ON garden_mastery(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_garden_characters_user_child ON garden_characters(user_id, child_id);
CREATE INDEX IF NOT EXISTS idx_children_user ON children(user_id, id);
CREATE INDEX IF NOT EXISTS idx_schools_user ON schools(user_id, id);
CREATE INDEX IF NOT EXISTS idx_teachers_user ON teachers(user_id, id);
CREATE INDEX IF NOT EXISTS idx_policy_notes_user ON policy_notes(user_id, id);

-- 快记/ai 配置
CREATE INDEX IF NOT EXISTS idx_quick_notes_user ON quick_notes(user_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_settings_user ON ai_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_providers_user ON ai_providers(user_id, id);

-- AI 助手会话/消息
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, id);

-- 错题本/笔记：用户隔离查询 + 复习到期调度主路径
CREATE INDEX IF NOT EXISTS idx_notebooks_user ON notebooks(user_id, id);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, id);
CREATE INDEX IF NOT EXISTS idx_notes_notebook ON notes(user_id, notebook_id);
CREATE INDEX IF NOT EXISTS idx_review_cards_user_due ON review_cards(user_id, due);
CREATE INDEX IF NOT EXISTS idx_review_logs_user_reviewed ON review_logs(user_id, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id, id);
CREATE INDEX IF NOT EXISTS idx_todo_lists_user ON todo_lists(user_id, id);
CREATE INDEX IF NOT EXISTS idx_todo_steps_todo ON todo_steps(user_id, todo_id);
`);

// 旧学期文本迁移（幂等）：term 列还在时，把遗留学期文本按孩子补建入学学期并回填 semester_id，然后删除 term 列
for (const table of ["timetable_slots", "learning_records", "bills"]) {
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
      "INSERT OR IGNORE INTO users (username, password_hash, display_name, is_admin, status, created_at) VALUES (?, ?, ?, 1, 1, ?)"
    )
    .run("admin", hash, "管理员", new Date().toISOString());
}

// 菜单改名迁移（旧库）：学费记录 → 账单，路径 /fees → /bills。
// 必须在权限种子之前执行，否则种子会再插一个「账单」菜单导致重名。
sqlite.prepare("UPDATE menus SET name = '账单', path = '/bills' WHERE path = '/fees'").run();

// 卡证档案菜单插入迁移（幂等）：老库尚无 /certs 时，把 sort>=10 的菜单整体后移一位，
// 给新菜单腾出 sort=10 的位置（卡证档案排在账单之后、提醒中心之前）。
const certMenuExists = sqlite.prepare("SELECT id FROM menus WHERE type = 'menu' AND path = '/certs'").get();
if (!certMenuExists) {
  sqlite.exec("UPDATE menus SET sort = sort + 1 WHERE type = 'menu' AND sort >= 10");
}

// 权限种子：admin 超管升级 + 菜单树 + 示例角色（幂等）
export const db = drizzle(sqlite, { schema });
ensurePermissionSeeds(db);
