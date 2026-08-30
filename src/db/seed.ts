import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { menuSeedDefs } from "./menuSeed";
import { API_PERMS } from "@/generated/apiPerms.generated";

type Db = BetterSQLite3Database<typeof schema>;

/**
 * 权限种子（幂等，启动时执行）：
 * 1. 已有 admin 账号升级为超管（is_admin=1）
 * 2. 菜单树（现有业务导航 + 系统管理目录/页面/按钮权限点）
 * 3. 接口权限目录：扫描生成的 95 个接口权限点（API 自动扫描入库）
 * 4. 示例角色 editor 并勾选部分菜单 + 接口权限，供非超管权限演示
 * 注：接收 db 而不是 import "@/db"，避免与 db/index.ts 形成循环依赖。
 */
export function ensurePermissionSeeds(db: Db) {
  // admin 账号（种子或旧库已有）最终确认超管状态
  db.run(sql`UPDATE users SET is_admin = 1, status = 1 WHERE username = 'admin'`);

  // 递归种菜单：已存在同父同级同名即跳过
  const seedMenu = (node: (typeof menuSeedDefs)[number], parentId: number | null): number => {
    const existing = db.all(
      sql`SELECT id FROM menus WHERE parent_id IS ${parentId} AND type = ${node.type} AND name = ${node.name}`
    ) as any[];
    if (existing.length) {
      // 已存在（如旧库早建的目录）也继续种它的 children，否则后代新菜单永远补不进来
      const id = existing[0].id as number;
      for (const child of node.children ?? []) seedMenu(child, id);
      return id;
    }
    const inserted = db.run(
      sql`INSERT INTO menus (parent_id, type, name, path, icon, perms, sort, visible) VALUES (${parentId}, ${node.type}, ${node.name}, ${node.path ?? ""}, ${node.icon ?? ""}, ${node.perms ?? ""}, ${node.sort ?? 0}, 1)`
    ) as any;
    const id = Number(inserted.lastInsertRowid);
    for (const child of node.children ?? []) {
      seedMenu(child, id);
    }
    return id;
  };
  for (const node of menuSeedDefs) {
    seedMenu(node, null);
  }

  // 接口权限目录：API 扫描生成的权限点以按钮形式挂载，供角色勾选
  const apiDir = (db.all(sql`SELECT id FROM menus WHERE type = 'dir' AND name = '接口权限'`) as any[])[0];
  const apiDirId = apiDir
    ? (apiDir.id as number)
    : Number(
        (db.run(
          sql`INSERT INTO menus (parent_id, type, name, path, icon, perms, sort, visible) VALUES (NULL, 'dir', '接口权限', '', 'icon-diy', '', 21, 1)`
        ) as any).lastInsertRowid
      );
  for (const p of API_PERMS) {
    const exists = (db.all(sql`SELECT id FROM menus WHERE type = 'button' AND perms = ${p.perms}`) as any[])[0];
    if (exists) continue;
    db.run(
      sql`INSERT INTO menus (parent_id, type, name, path, icon, perms, sort, visible) VALUES (${apiDirId}, 'button', ${p.label}, '', '', ${p.perms}, 0, 1)`
    );
  }

  // 示例角色 editor（幂等）：
  // 勾选 概览 + 子女管理 + 提醒中心 + 接口权限目录（勾了全部接口，便于演示数据隔离而非权限限制）
  const editor = db.all(sql`SELECT id FROM roles WHERE code = 'editor'`) as any[];
  let editorId = editor.length ? (editor[0].id as number) : 0;
  if (!editorId) {
    editorId = Number(
      (db.run(sql`INSERT INTO roles (code, name, remark, created_at) VALUES ('editor', '编辑', '示例角色：所有模块可见可用（无系统管理）', ${new Date().toISOString()})`) as any)
        .lastInsertRowid
    );
    const pickMenus = db.all(
      sql`SELECT id FROM menus WHERE (name IN ('概览', '子女管理', '提醒中心')) OR (parent_id IN (SELECT id FROM menus WHERE name IN ('子女管理', '提醒中心')))`
    ) as any[];
    for (const m of pickMenus) {
      db.run(sql`INSERT OR IGNORE INTO roles_menus (role_id, menu_id) VALUES (${editorId}, ${m.id})`);
    }
    db.run(sql`INSERT OR IGNORE INTO roles_menus (role_id, menu_id) VALUES (${editorId}, ${apiDirId})`);
  }
}
