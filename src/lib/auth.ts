import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const SECRET = process.env.AUTH_SECRET || "edu-tracker-dev-secret-change-me";

export function signToken(payload: { uid: number; username: string }) {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, SECRET) as { uid: number; username: string };
  } catch {
    return null;
  }
}

export function getTokenFromRequest(req: NextRequest) {
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
 * 用于需要用户身份的 API 路由（如按 user_id 隔离数据的查询）。
 * 用法：const auth = requireUser(req); if ("response" in auth) return auth.response; const { uid } = auth.user;
 */
export function requireUser(req: NextRequest): { user: { uid: number; username: string } } | { response: NextResponse } {
  const user = getAuthUser(req);
  if (!user) return { response: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  return { user };
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
