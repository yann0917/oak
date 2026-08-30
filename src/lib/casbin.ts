import { newEnforcer, newModelFromString } from "casbin";
import type { Adapter, Enforcer, Model } from "casbin";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { menus, roles, rolesMenus, users, usersRoles } from "@/db/schema";

/**
 * 权限模型：权限点用单字符串（如 system:user:list），keyMatch 支持通配 system:user:*。
 * sub = 用户名（users.username 即 Casbin 的 sub）。
 */
const MODEL = `
[request_definition]
r = sub, perm

[policy_definition]
p = sub, perm

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && keyMatch(r.perm, p.perm)
`;

/**
 * 从业务表加载策略（业务表是唯一数据源，savePolicy 空实现即可）：
 * - g 规则：用户 -> 角色（users_roles）
 * - p 规则：角色 -> 权限点（roles_menus 勾选的菜单中 perms 非空者）
 */
class DrizzleAdapter implements Adapter {
  async loadPolicy(model: Model): Promise<void> {
    const gRules = db
      .select({ sub: users.username, role: roles.code })
      .from(usersRoles)
      .innerJoin(users, eq(usersRoles.userId, users.id))
      .innerJoin(roles, eq(usersRoles.roleId, roles.id))
      .all();
    for (const r of gRules) model.addPolicy("g", "g", [r.sub, r.role]);

    const pRules = db
      .selectDistinct({ role: roles.code, perms: menus.perms })
      .from(rolesMenus)
      .innerJoin(roles, eq(rolesMenus.roleId, roles.id))
      .innerJoin(menus, eq(rolesMenus.menuId, menus.id))
      .where(isNotNull(menus.perms))
      .all();
    for (const r of pRules) {
      if (r.perms) model.addPolicy("p", "p", [r.role, r.perms]);
    }
  }

  async savePolicy(): Promise<boolean> {
    return true;
  }

  async addPolicy(): Promise<void> {}
  async removePolicy(): Promise<void> {}
  async removeFilteredPolicy(): Promise<void> {}
}

declare global {
  var __enforcer: Enforcer | undefined;
}

export async function getEnforcer(): Promise<Enforcer> {
  if (!globalThis.__enforcer) {
    globalThis.__enforcer = await newEnforcer(newModelFromString(MODEL), new DrizzleAdapter());
  }
  return globalThis.__enforcer;
}

/** 角色权限变更（菜单勾选）后调用，使策略立即生效（单机 SQLite 无需 watcher） */
export async function reloadPolicy(): Promise<void> {
  await (await getEnforcer()).loadPolicy();
}

/** 判断用户是否有某权限（已排除超管短路，超管在 auth.authorize 里放行，不走这里） */
export async function hasPerm(username: string, perm: string): Promise<boolean> {
  const e = await getEnforcer();
  return e.enforce(username, perm);
}
