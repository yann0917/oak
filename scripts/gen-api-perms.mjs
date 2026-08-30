#!/usr/bin/env node
/**
 * API 接口权限点自动扫描器（构建前运行：npm run build 自动执行）。
 * 遍历 src/app/api 下的 route 文件，解析导出的 HTTP 方法，
 * 生成 src/generated/apiPerms.generated.ts（权限点清单，角色分配时勾选用）。
 *
 * 权限点命名规范：
 *  - 资源名 = api 目录首段（如 reminders、health-records）
 *  - 集合路由 route.ts：GET→list、POST→create
 *  - 单条路由 [id]/route.ts：GET→detail、PUT→update、DELETE→delete
 *  - 子路径（如 reminders/[id]/test）：动作名 = 静态段.join('-') + '-' + 方法小写
 * 排除：system/*（已有手工权限点 system:*）、auth/*（登录链路，无需权限）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const API_DIR = path.join(ROOT, "src", "app", "api");
const OUT_FILE = path.join(ROOT, "src", "generated", "apiPerms.generated.ts");

/** 资源 → 展示名（匹配不到时直接显示资源名） */
const RESOURCE_LABELS = {
  activities: "兴趣班",
  "child-teachers": "师生关联",
  children: "子女",
  enrollments: "就读阶段",
  "fee-records": "学费",
  "garden-characters": "识字字库",
  "garden-mastery": "知识掌握度",
  "garden-records": "练习记录",
  "garden-settings": "练习配置",
  "growth-records": "成长记录",
  "health-records": "健康档案",
  "learning-records": "学习记录",
  moments: "时光相册",
  "policy-notes": "政策动态",
  "push-channels": "推送渠道",
  reminders: "提醒中心",
  schools: "学校",
  semesters: "学期",
  teachers: "教师",
  "timetable-period-order": "节次排序",
  "timetable-slots": "课程表",
  tts: "语音朗读",
  upload: "文件上传",
};

/** 非标准 CRUD 资源的动作特例（资源名 → 方法 → { action, label }） */
const ACTION_OVERRIDES = {
  tts: { GET: { action: "synthesize", label: "语音合成" } },
  upload: { POST: { action: "upload", label: "上传文件" } },
};

/** 标准动作 → 中文展示名 */
const ACTION_LABELS = {
  list: "查看列表",
  create: "新增",
  detail: "查看详情",
  update: "修改",
  delete: "删除",
};

/** 子路径动作的展示名映射（test 等），匹配不到按动作名展示 */
const SUB_ACTION_LABELS = {
  "test-post": "测试推送",
  "toggle-post": "开关",
  "logs-get": "发送日志",
  "logs-read-post": "标记已读",
  "notifications-get": "站内通知",
};

function parseMethodNames(source) {
  const names = new Set();
  // export async function GET(...) {...}
  for (const m of source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)\s*\(/g)) {
    names.add(m[1]);
  }
  // export const { GET, POST } = make...
  for (const m of source.matchAll(/export\s+const\s*\{([^}]+)\}\s*=\s*make\w*/g)) {
    for (const n of m[1].split(",")) {
      const t = n.trim();
      if (/^(GET|POST|PUT|DELETE|PATCH)$/.test(t)) names.add(t);
    }
  }
  return [...names];
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (/^route\.(ts|tsx|js)$/.test(entry.name)) acc.push(p);
  }
  return acc;
}

const COLLECTION_ACTION = { GET: "list", POST: "create" };
const ITEM_ACTION = { GET: "detail", PUT: "update", DELETE: "delete" };

const perms = [];
for (const file of walk(API_DIR)) {
  const rel = path.relative(API_DIR, file).replace(/route\.(ts|tsx|js)$/, "").replace(/\/$/, "");
  const segs = rel.split("/").filter(Boolean);
  const resource = segs[0];
  if (resource === "system" || resource === "auth") continue;
  const label = RESOURCE_LABELS[resource] ?? resource;

  const methods = parseMethodNames(fs.readFileSync(file, "utf8"));
  for (const m of methods) {
    let action;
    let labelOverride;
    if (ACTION_OVERRIDES[resource]?.[m]) {
      action = ACTION_OVERRIDES[resource][m].action;
      labelOverride = ACTION_OVERRIDES[resource][m].label;
    } else if (segs.length === 1) action = COLLECTION_ACTION[m];
    else if (segs[1] === "[id]" && segs.length === 2) action = ITEM_ACTION[m];
    else {
      const sub = segs.slice(1).filter((s) => s !== "[id]").join("-");
      action = `${sub}-${m.toLowerCase()}`;
    }
    if (!action) continue; // 如 collection 里的 PUT（不存在）
    const actionLabel = labelOverride ?? ACTION_LABELS[action] ?? SUB_ACTION_LABELS[action] ?? action;
    perms.push({
      resource,
      perms: `api:${resource}:${action}`,
      label: `${label}·${actionLabel}`,
    });
  }
}

// 按资源分组排序，输出稳定
perms.sort((a, b) => (a.resource === b.resource ? a.perms.localeCompare(b.perms) : a.resource.localeCompare(b.resource)));

const header = `// 由 scripts/gen-api-perms.mjs 自动生成（npm run build 前执行），请勿手改。
// 接口权限点清单：角色分配权限时按「接口权限」目录勾选生效。

export interface ApiPermDef {
  resource: string;
  perms: string;
  label: string;
}

export const API_PERMS: ApiPermDef[] = ${JSON.stringify(perms, null, 2)};
`;

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, header, "utf8");
console.log(`已生成 ${perms.length} 个接口权限点 → src/generated/apiPerms.generated.ts`);
