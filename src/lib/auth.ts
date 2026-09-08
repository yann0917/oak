import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { InferSelectModel } from "drizzle-orm";
import { hasPerm } from "./casbin";
import { guard, RATE_LIMITS } from "./rateLimit";

export const AUTH_SECRET = process.env.AUTH_SECRET || "edu-tracker-dev-secret-change-me";

export type AuthUser = InferSelectModel<typeof users>;

export function signToken(payload: { uid: number; username: string }) {
  return jwt.sign(payload, AUTH_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, AUTH_SECRET) as { uid: number; username: string };
  } catch {
    return null;
  }
}

/** 校验用户名密码（Web 登录与客户端登录共用）。失败返回 null。 */
export function verifyCredentials(username: unknown, password: unknown): AuthUser | null {
  if (typeof username !== "string" || typeof password !== "string") return null;
  if (!username || !password) return null;
  const user = db.select().from(users).where(eq(users.username, username)).get();
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) return null;
  return user;
}

/** 优先读 Authorization: Bearer（原生客户端），回退 cookie（Web 端） */
export function getTokenFromRequest(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  if (header) {
    const bearer = header.replace(/^Bearer\s+/i, "").trim();
    if (bearer) return bearer;
  }
  return req.cookies.get("token")?.value || "";
}

export function getAuthUser(req: NextRequest) {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  return verifyToken(token);
}

// 用于 API 路由：未登录返回 401
export async function requireAuth(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return null;
}

/**
 * 用于需要用户身份的 API 路由（按 user_id 隔离数据或做权限校验）。
 * 返回数据库用户行（含 is_admin/status）；用户不存在或已停用视为未登录。
 * 用法：const auth = requireUser(req); if ("response" in auth) return auth.response; const { id, username, isAdmin } = auth.user;
 */
export function requireUser(req: NextRequest): { user: AuthUser } | { response: NextResponse } {
  const tokenUser = getAuthUser(req);
  if (!tokenUser) return { response: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  const user = db.select().from(users).where(eq(users.id, tokenUser.uid)).get();
  if (!user || !user.status) return { response: NextResponse.json({ error: "账号不存在或已停用" }, { status: 401 }) };
  // 全局兜底限流：单实例内存计数（见 rateLimit.ts）
  const limited = guard(`user:${user.id}`, RATE_LIMITS.api);
  if (limited) return { response: limited };
  return { user };
}

/**
 * 核心权限校验：超管（is_admin）短路放行，其余走 Casbin。
 * 返回 NextResponse 表示无权限（403），返回 null 表示放行。
 */
export async function authorize(
  username: string,
  isAdmin: number,
  perm: string
): Promise<NextResponse | null> {
  if (isAdmin) return null;
  if (await hasPerm(username, perm)) return null;
  return NextResponse.json({ error: "无权限" }, { status: 403 });
}

/**
 * 手写路由的统一接入点：登录校验 + 接口权限校验（api:{api}:{action}）。
 * 返回 { user, denied }：denied 非空时直接返回，否则用 user 做数据隔离。
 */
export async function requirePerm(
  api: string,
  action: string,
  req: NextRequest
): Promise<{ user: AuthUser | null; denied: NextResponse | null }> {
  const auth = requireUser(req);
  if ("response" in auth) return { user: null, denied: auth.response };
  const denied = await authorize(auth.user.username, auth.user.isAdmin, `api:${api}:${action}`);
  return { user: auth.user, denied };
}

export async function setAuthCookie(token: string) {
  // Next.js 16：cookies() 为异步 API
  (await cookies()).set("token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function clearAuthCookie() {
  (await cookies()).delete("token");
}
