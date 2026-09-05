import { and, eq, inArray } from "drizzle-orm";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { db } from "@/db";
import { BACKUP_TABLES } from "./tables";
import { BACKUP_VERSION, exportJson } from "./export";

/**
 * 导入（两种模式共用「重映射插入」路径）：
 * - 自增主键为全库共享：同一份备份导入到不同账号（或替换后）必然与已有主键冲突，
 *   因此一律不保留原 id——按原 id → 新 id 建立映射，外键列（childId/schoolId/notebookId 等）重映射；
 *   父行未导入（悬空外键）时跳过该行；
 * - merge（合并）：追加为新记录；
 * - replace（替换）：先自动导出一份备份到 data/backups/ 并清空本人业务数据，再重新插入；
 * - 敏感列（已脱敏为 ***）不覆盖现有配置；附件 zip 只释放 uploads/ 内文件；
 * - 两种模式完成都会清空 RAG 索引（chunks/captions/meta 置 unconfigured，FTS 同步清理）。
 */

export type ImportMode = "merge" | "replace";

export interface ImportSummary {
  mode: ImportMode;
  imported: Record<string, number>;
  skipped: Record<string, number>;
  backupFile?: string;
}

const sqlite = db.$client;

function parseRows(data: any): Record<string, Record<string, unknown>[]> {
  if (!data || typeof data !== "object" || typeof data.version !== "number" || !data.tables || typeof data.tables !== "object") {
    throw new Error("备份文件格式不正确：缺少 version/tables（请使用本系统导出的 JSON）");
  }
  if (data.version > BACKUP_VERSION) {
    throw new Error(`备份文件版本（${data.version}）高于当前系统（${BACKUP_VERSION}），请先升级系统再导入`);
  }
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const [k, v] of Object.entries(data.tables)) {
    if (Array.isArray(v)) out[k] = v as Record<string, unknown>[];
  }
  return out;
}

/** 敏感列：*** 或空值 → 保留现有配置 */
function isMasked(row: Record<string, unknown>, field: string) {
  const v = row[field];
  return v === "***" || v === "" || v === null || v === undefined;
}

type IdMap = Map<string, Map<number, number>>;

/**
 * 单表重映射插入：不保留原 id，外键经 idMap 重建，父行缺失（悬空）则跳过。
 * push_channels 现有渠道（同 user+type）保留，不重复插入。
 */
function insertRemapped(
  uid: number,
  defKey: string,
  def: any,
  rows: Record<string, unknown>[],
  idMap: IdMap
): { imported: number; skipped: number } {
  let importedCount = 0;
  let skippedCount = 0;
  for (const raw of rows) {
    if (typeof raw.id !== "number") continue;
    const row = { ...raw };
    // 外键列重映射；父行未导入（悬空）→ 跳过该行
    let dangling = false;
    for (const ref of def.refs ?? []) {
      const val = row[ref.column];
      if (val === null || val === undefined || val === "") continue;
      const newId = idMap.get(ref.refTable)?.get(val as number);
      if (newId) row[ref.column] = newId;
      else {
        dangling = true;
        break;
      }
    }
    if (dangling) {
      skippedCount++;
      continue;
    }
    // 敏感列（脱敏/空值）：渠道配置保留现有，不插新行
    if (defKey === "push_channels" && (def.sensitive ?? []).some((f: string) => isMasked(row, f))) {
      skippedCount++;
      continue;
    }
    if (defKey === "push_channels") {
      const exists = db
        .select()
        .from(def.table)
        .where(and(eq(def.table.userId as any, uid), eq(def.table.type as any, row.type)))
        .get();
      if (exists) {
        skippedCount++;
        continue;
      }
    }
    delete row.id;
    if (defKey !== "reminder_rules") row.userId = uid;
    const r = db.insert(def.table).values(row).run();
    const newId = Number(r.lastInsertRowid);
    (idMap.get(defKey) ?? idMap.set(defKey, new Map()).get(defKey)!).set(raw.id as number, newId);
    importedCount++;
  }
  return { imported: importedCount, skipped: skippedCount };
}

function summarize(mode: ImportMode, statsByKey: Map<string, { imported: number; skipped: number }>, backupFile?: string): ImportSummary {
  const imported: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  for (const def of BACKUP_TABLES) {
    imported[def.key] = statsByKey.get(def.key)?.imported ?? 0;
    skipped[def.key] = statsByKey.get(def.key)?.skipped ?? 0;
  }
  return { mode, imported, skipped, ...(backupFile ? { backupFile } : {}) };
}

// ===== 合并（merge）=====

export function importMerge(uid: number, rowsByKey: Record<string, Record<string, unknown>[]>): ImportSummary {
  const idMap: IdMap = new Map();
  const statsByKey = new Map<string, { imported: number; skipped: number }>();
  sqlite.transaction(() => {
    for (const def of BACKUP_TABLES) {
      statsByKey.set(def.key, insertRemapped(uid, def.key, def, rowsByKey[def.key] ?? [], idMap));
    }
  })();
  return summarize("merge", statsByKey);
}

// ===== 替换（replace）=====

export function importReplace(uid: number, rowsByKey: Record<string, Record<string, unknown>[]>): ImportSummary {
  // 替换前自动备份（JSON 全量，不含附件）
  const backupFile = writeAutoBackup(uid);
  const incomingTypes = new Set((rowsByKey.push_channels ?? []).map((r: any) => String(r.type)).filter(Boolean));
  const idMap: IdMap = new Map();
  const statsByKey = new Map<string, { imported: number; skipped: number }>();

  // 清空 + 重建必须原子：任一步失败整体回滚，避免"删了但没导入"的中间态
  sqlite.transaction(() => {
    // 清空本人业务数据（反转顺序子表先；提醒的 FK 级联会顺带删 reminder_rules）
    for (const def of [...BACKUP_TABLES].reverse()) {
      if (def.key === "reminder_rules") {
        const reminderTable = BACKUP_TABLES.find((t) => t.key === "reminders")!.table;
        const ids = db
          .select()
          .from(reminderTable)
          .where(eq(reminderTable.userId as any, uid))
          .all()
          .map((x: any) => x.id);
        if (ids.length) db.delete(def.table).where(inArray(def.table.reminderId as any, ids)).run();
        continue;
      }
      if (def.key === "push_channels") {
        // 渠道配置属于"现有配置"：保留备份里存在的类型（含脱敏渠道），删除未包含的类型
        const existing = db
          .select({ type: def.table.type as any })
          .from(def.table)
          .where(eq(def.table.userId as any, uid))
          .all()
          .map((x: any) => x.type);
        const toDelete = existing.filter((t: string) => t && !incomingTypes.has(t));
        if (toDelete.length) db.delete(def.table).where(and(eq(def.table.userId as any, uid), inArray(def.table.type as any, toDelete))).run();
        continue;
      }
      db.delete(def.table).where(eq(def.table.userId as any, uid)).run();
    }

    for (const def of BACKUP_TABLES) {
      const stats = insertRemapped(uid, def.key, def, rowsByKey[def.key] ?? [], idMap);
      statsByKey.set(def.key, stats);
      // 自增序列修正：避免后续新增记录撞上导入的 id（无自增主键表跳过：reminder_rules/review_cards）
      if (stats.imported && !["reminder_rules", "review_cards"].includes(def.key)) {
        sqlite
          .prepare(`UPDATE sqlite_sequence SET seq = (SELECT COALESCE(MAX(id), 0) FROM "${def.key}") WHERE name = '${def.key}'`)
          .run();
      }
    }
  })();

  return summarize("replace", statsByKey, backupFile);
}

function writeAutoBackup(uid: number): string {
  const dir = path.join(process.cwd(), "data", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "").slice(0, 14);
  const file = path.join(dir, `oak_replace_backup_${stamp}.json`);
  const { json } = exportJson(uid, { attachments: false });
  fs.writeFileSync(file, JSON.stringify(json, null, 2), "utf8");
  return path.relative(process.cwd(), file);
}

// ===== 附件还原 =====

export function extractAttachmentsZip(zipBuf: Buffer, mode: ImportMode): number {
  const zip = new AdmZip(zipBuf);
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  let restored = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue; // 目录条目不还原（只认文件条目）
    if (!entry.entryName.startsWith("files/uploads/")) continue; // 只认包内 uploads 相对路径
    const targetRel = entry.entryName.slice("files/".length); // uploads/xxx
    const abs = path.resolve(uploadsDir, targetRel.slice("uploads/".length));
    if (!abs.startsWith(uploadsDir + path.sep)) continue; // 防路径穿越
    if (mode === "merge" && fs.existsSync(abs)) continue; // 合并：跳过已存在文件
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, entry.getData());
    restored++;
  }
  return restored;
}

// ===== 导入后 RAG 索引重置（chunks/captions/meta + FTS 同步清理）=====

export function resetRagForImport(uid: number): void {
  sqlite.prepare("DELETE FROM rag_fts WHERE rowid IN (SELECT id FROM rag_chunks WHERE user_id = ?)").run(uid);
  sqlite.prepare("DELETE FROM rag_chunks WHERE user_id = ?").run(uid);
  sqlite.prepare("DELETE FROM rag_image_captions WHERE user_id = ?").run(uid);
  const now = new Date().toISOString();
  const existing = sqlite.prepare("SELECT id FROM rag_meta WHERE user_id = ?").get(uid) as { id: number } | undefined;
  if (existing) {
    sqlite
      .prepare("UPDATE rag_meta SET status = 'unconfigured', chunk_count = 0, last_sync_at = '', last_error = '数据已导入，请到「设置 → AI 大模型 → 记忆检索」重建索引', updated_at = ? WHERE user_id = ?")
      .run(now, uid);
  } else {
    sqlite
      .prepare("INSERT INTO rag_meta (user_id, status, chunk_count, last_sync_at, last_error, updated_at) VALUES (?, 'unconfigured', 0, '', '数据已导入，请到「设置 → AI 大模型 → 记忆检索」重建索引', ?)")
      .run(uid, now);
  }
}

// ===== 入口 =====

export function importData(uid: number, data: any, mode: ImportMode, opts: { zip?: Buffer } = {}): ImportSummary {
  const rowsByKey = parseRows(data);
  const summary = mode === "replace" ? importReplace(uid, rowsByKey) : importMerge(uid, rowsByKey);
  if (opts.zip?.length) {
    const restored = extractAttachmentsZip(opts.zip, mode);
    summary.imported["__attachments"] = restored;
  }
  resetRagForImport(uid);
  return summary;
}
