import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { menus, roles, rolesMenus } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { reloadPolicy } from "@/lib/casbin";

/** 角色当前勾选的菜单 id 集合（分配权限弹窗回显用） */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "system:role:assign");
  if (denied) return denied;
  const { id } = await ctx.params;
  const menuIds = db
    .select({ menuId: rolesMenus.menuId })
    .from(rolesMenus)
    .where(eq(rolesMenus.roleId, Number(id)))
    .all()
    .map((r) => r.menuId);
  return NextResponse.json(menuIds);
}

/** 勾选父级（目录/菜单）时自动展开其全部子孙，保证按钮权限点不遗漏 */
function expandMenuIds(ids: number[], allRows: { id: number; parentId: number | null }[]): number[] {
  const childrenOf = new Map<number | null, number[]>();
  for (const row of allRows) {
    const list = childrenOf.get(row.parentId) ?? [];
    list.push(row.id);
    childrenOf.set(row.parentId, list);
  }
  const result = new Set<number>();
  const visit = (id: number) => {
    if (result.has(id)) return;
    result.add(id);
    for (const child of childrenOf.get(id) ?? []) visit(child);
  };
  for (const id of ids) visit(id);
  return [...result];
}

/** 角色分配权限（勾选的菜单 id 集合，含 button 权限点）；保存后策略立即生效 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "system:role:assign");
  if (denied) return denied;

  const { id } = await ctx.params;
  const roleId = Number(id);
  const exists = db.select().from(roles).where(eq(roles.id, roleId)).get();
  if (!exists) return NextResponse.json({ error: "角色不存在" }, { status: 404 });

  const { menuIds } = await req.json();
  const ids: number[] = Array.isArray(menuIds) ? menuIds.map(Number).filter(Number.isInteger) : [];
  const allRows = db.select({ id: menus.id, parentId: menus.parentId }).from(menus).all();
  const expanded = ids.length ? expandMenuIds(ids, allRows) : [];

  db.transaction((tx) => {
    tx.delete(rolesMenus).where(eq(rolesMenus.roleId, roleId)).run();
    if (expanded.length) {
      tx.insert(rolesMenus)
        .values(expanded.map((menuId) => ({ roleId, menuId })))
        .run();
    }
  });
  await reloadPolicy();
  return NextResponse.json({ ok: true, count: expanded.length });
}
