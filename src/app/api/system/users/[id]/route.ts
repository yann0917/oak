import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, usersRoles } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "system:user:update");
  if (denied) return denied;

  const { id } = await ctx.params;
  const existing = db.select().from(users).where(eq(users.id, Number(id))).get();
  if (!existing) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  const body = await req.json();

  const values: any = {};
  if (body.displayName != null) values.displayName = body.displayName;
  if (body.isAdmin != null) values.isAdmin = body.isAdmin ? 1 : 0;
  if (body.status != null) values.status = body.status ? 1 : 0;
  if (body.password) {
    if (body.password.length < 6) return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
    values.passwordHash = bcrypt.hashSync(body.password, 10);
  }

  const row = Object.keys(values).length
    ? db.update(users).set(values).where(eq(users.id, existing.id)).returning().get()
    : existing;

  // 角色设置：全量替换 users_roles（单独调用时 values 可能为空，已是合法场景）
  if (Array.isArray(body.roleIds)) {
    const roleIds = (body.roleIds as any[]).map(Number).filter((n): n is number => Number.isInteger(n));
    db.transaction((tx) => {
      tx.delete(usersRoles).where(eq(usersRoles.userId, existing.id)).run();
      if (roleIds.length) {
        tx.insert(usersRoles)
          .values(roleIds.map((roleId) => ({ userId: existing.id, roleId })))
          .run();
      }
    });
  }
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "system:user:delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const target = Number(id);
  if (target === auth.user.id) {
    return NextResponse.json({ error: "不能删除当前登录账号" }, { status: 400 });
  }
  const existing = db.select().from(users).where(and(eq(users.id, target))).get();
  if (!existing) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  db.delete(users).where(eq(users.id, target)).run(); // users_roles 级联删除
  return NextResponse.json({ ok: true });
}
