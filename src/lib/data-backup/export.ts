import AdmZip from "adm-zip";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { db } from "@/db";
import { BACKUP_TABLES, FILE_COLUMNS, getRows, type BackupTableDef } from "./tables";

/**
 * 导出：
 * - exportJson：全量 JSON（含 id，可再导入）+ 可选附件 zip（manifest.json + files/<uploads 相对路径>）；
 * - exportExcel：每张业务表一个 sheet（中文列头，附件/json 展开为可读文本，不导出 id/userId/时间戳）。
 * 敏感列（apiKey/推送配置等）统一脱敏为 ***，导入时保留现有配置。
 */

export const BACKUP_VERSION = 1;

export interface ExportJsonResult {
  json: Record<string, unknown>;
  zip?: Buffer;
}

function maskSensitive(row: Record<string, unknown>, def: BackupTableDef): Record<string, unknown> {
  const out = { ...row };
  for (const field of def.sensitive ?? []) {
    if (out[field]) out[field] = "***";
  }
  return out;
}

/** 收集附件路径（各表 JSON 数组列/单路径列），返回去重后的原始路径列表 */
export function collectFilePaths(uid: number, rowsByKey: Map<string, Record<string, unknown>[]>): string[] {
  const paths = new Set<string>();
  for (const fc of FILE_COLUMNS) {
    const rows = rowsByKey.get(fc.table) ?? [];
    for (const row of rows) {
      let list: string[] = [];
      if (fc.single) {
        if (typeof row[fc.column] === "string" && row[fc.column]) {
          list = [row[fc.column] as string];
        }
      } else {
        try {
          const v = JSON.parse(String(row[fc.column] || "[]"));
          if (Array.isArray(v)) list = v.filter((p) => typeof p === "string");
        } catch {
          /* 非 JSON 原样跳过 */
        }
      }
      for (const p of list) {
        const norm = p.replace(/^\/+/, "");
        if (norm && norm.startsWith("uploads/")) paths.add(norm);
      }
    }
  }
  return [...paths];
}

/** 把附件打进 zip：oak_backup.json（数据本体）+ manifest.json + files/<uploads 相对路径>。
 * 条目必须是精确的单层文件路径（files/uploads/xxx.jpg）：adm-zip 的 addLocalFile 第二参数
 * 是"目录"语义（自动补斜杠再拼本地文件名），会生成 xxx.jpg/xxx.jpg 嵌套伪目录——
 * 以图片后缀结尾的目录名会让部分解压器判定损坏拒绝解压，导入端路径也对不上。 */
function buildAttachmentsZip(uid: number, paths: string[], json: Record<string, unknown>): Buffer {
  const zip = new AdmZip();
  zip.addFile("oak_backup.json", Buffer.from(JSON.stringify(json, null, 2), "utf8"));
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const manifest: { path: string; exists: boolean }[] = [];
  for (const rel of paths) {
    const abs = path.resolve(uploadsRoot, rel.slice("uploads/".length));
    // 防路径穿越：只允许 uploads/ 内文件
    if (!abs.startsWith(uploadsRoot + path.sep)) continue;
    let exists = false;
    try {
      zip.addFile(`files/${rel}`, fs.readFileSync(abs));
      exists = true;
    } catch {
      /* 文件缺失：跳过并在 manifest 标注 */
    }
    manifest.push({ path: rel, exists });
  }
  zip.addFile("manifest.json", Buffer.from(JSON.stringify({ version: BACKUP_VERSION, exportedBy: uid, manifest }, null, 2)));
  return zip.toBuffer();
}

export interface ExportOptions {
  attachments?: boolean; // JSON 导出是否打包附件（Excel 永远只含路径文本）
}

export function exportJson(uid: number, opts: ExportOptions = {}): ExportJsonResult {
  const rowsByKey = new Map<string, Record<string, unknown>[]>();
  const tables: Record<string, unknown[]> = {};
  for (const def of BACKUP_TABLES) {
    const rows = getRows(uid, def).map((r) => maskSensitive(r, def));
    rowsByKey.set(def.key, rows);
    tables[def.key] = rows;
  }
  const json = {
    version: BACKUP_VERSION,
    app: "oak",
    exportedAt: new Date().toISOString(),
    tables,
  };
  if (!opts.attachments) return { json };
  const paths = collectFilePaths(uid, rowsByKey);
  return { json, zip: buildAttachmentsZip(uid, paths, json) };
}

function excelText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Excel 单元格上限 32767，超出截断（JSON 导出不受影响）
  return s.length > 32000 ? s.slice(0, 32000) + "…" : s;
}

/** Excel sheet 名不允许字符：* ? : \ / [ ]（中文斜杠换用间隔号） */
const SHEET_BAD_CHARS = /[*?:/\\[\]]/g;

/** JSON 串列展开为可读文本（数组 → “a | b”） */
function prettyCell(row: Record<string, unknown>, def: BackupTableDef, field: string): string {
  const v = row[field];
  const s = String(v ?? "");
  if (!s) return "";
  if (!(def.jsonCols ?? []).includes(field)) return excelText(v);
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" | ");
  } catch {
    /* 非 JSON 原样返回 */
  }
  return excelText(v);
}

export async function exportExcel(uid: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "oak";
  for (const def of BACKUP_TABLES) {
    const rows = getRows(uid, def).map((r) => maskSensitive(r, def));
    const ws = wb.addWorksheet(def.label.replace(SHEET_BAD_CHARS, "·"), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = def.excelColumns.map((c) => ({ header: c.label, key: c.field, width: 20 }));
    for (const row of rows) {
      const values: Record<string, unknown> = {};
      for (const c of def.excelColumns) {
        values[c.field] = prettyCell(row, def, c.field);
      }
      ws.addRow(values);
    }
    // 空表也保留 header 行（报表一致性）
    if (!rows.length && def.excelColumns.length) ws.addRow({});
  }
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
