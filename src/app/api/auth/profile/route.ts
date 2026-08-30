import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { menus, roles, rolesMenus, usersRoles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { buildMenuTree } from "@/lib/menuTree";

/** 登录后动态菜单核心接口：user + roles + 菜单树 + perms（按钮权限集合） */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const rolesOf = db
    .select({ code: roles.code })
    .from(usersRoles)
    .innerJoin(roles, eq(usersRoles.roleId, roles.id))
    .where(eq(usersRoles.userId, user.id))
    .all();

  let rows;
  if (user.isAdmin) {
    // 超管：全量可见菜单
    rows = db
      .select()
      .from(menus)
      .where(eq(menus.visible, 1))
      .orderBy(asc(menus.sort))
      .all();
  } else {
    // 按角色聚合（角色勾选的菜单，含按钮权限点）
    rows = db
      .selectDistinct({
        id: menus.id,
        parentId: menus.parentId,
        type: menus.type,
        name: menus.name,
        path: menus.path,
        icon: menus.icon,
        perms: menus.perms,
        sort: menus.sort,
      })
      .from(rolesMenus)
      .innerJoin(menus, eq(rolesMenus.menuId, menus.id))
      .innerJoin(roles, eq(rolesMenus.roleId, roles.id))
      .innerJoin(usersRoles, eq(usersRoles.roleId, roles.id))
      .where(and(eq(usersRoles.userId, user.id), eq(menus.visible, 1)))
      .orderBy(asc(menus.sort))
      .all() as any[];
  }

  // button 不进侧边栏，仅作为权限点收集
  const perms = [...new Set(rows.map((m) => m.perms).filter(Boolean))];
  const roots = buildMenuTree(rows.filter((m) => m.type !== "button"), true);

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      isAdmin: !!user.isAdmin,
    },
    roles: rolesOf.map((r) => r.code),
    menus: roots,
    perms,
  });
}

