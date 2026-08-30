import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { roles, users, usersRoles } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

function withRoles(rows: typeof users.$inferSelect[]) {
  return rows.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    isAdmin: !!u.isAdmin,
    status: u.status,
    createdAt: u.createdAt,
    roles: (
      db
        .select({ id: roles.id, code: roles.code, name: roles.name })
        .from(usersRoles)
        .innerJoin(roles, eq(usersRoles.roleId, roles.id))
        .where(eq(usersRoles.userId, u.id))
        .all()
    ),
  }));
}

export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "system:user:list");
  if (denied) return denied;
  const rows = db.select().from(users).orderBy(asc(users.id)).all();
  return NextResponse.json(withRoles(rows));
}

export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "system:user:create");
  if (denied) return denied;

  const body = await req.json();
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });

  try {
    const roleIds: number[] = Array.isArray(body.roleIds)
      ? (body.roleIds as any[]).map(Number).filter((n): n is number => Number.isInteger(n))
      : [];
    const created = db.transaction((tx) => {
      const user = tx
        .insert(users)
        .values({
          username,
          passwordHash: bcrypt.hashSync(password, 10),
          displayName: body.displayName ?? "",
          isAdmin: body.isAdmin ? 1 : 0,
          status: body.status === false ? 0 : 1,
        })
        .returning()
        .get();
      if (roleIds.length) {
        tx.insert(usersRoles)
          .values(roleIds.map((roleId) => ({ userId: user.id, roleId })))
          .run();
      }
      return user;
    });
    return NextResponse.json(withRoles([created])[0], { status: 201 });
  } catch (e: any) {
    if (String(e?.message).includes("UNIQUE")) return NextResponse.json({ error: "用户名已存在" }, { status: 400 });
    // 角色 id 不存在等外键错误
    if (String(e?.message).includes("FOREIGN KEY")) return NextResponse.json({ error: "角色不存在" }, { status: 400 });
    throw e;
  }
}
