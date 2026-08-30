import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Edge runtime（middleware）无法使用 better-sqlite3/Casbin，这里只做 JWT 验签；
// 用户是否停用、细粒度权限校验在 Node runtime 的 API 路由里完成（auth.requireUser / authorize）。
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "edu-tracker-dev-secret-change-me");

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  if (!token) return redirectToLogin(req);
  try {
    await jwtVerify(token, secret);
  } catch {
    return redirectToLogin(req);
  }
  return NextResponse.next();
}

function redirectToLogin(req: NextRequest) {
  const login = new URL("/login", req.url);
  const path = req.nextUrl.pathname + req.nextUrl.search;
  if (path !== "/") login.searchParams.set("next", path);
  return NextResponse.redirect(login);
}

export const config = {
  // 页面路由全部拦截；API 由路由层自鉴权；登录页与静态资源放行
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico|uploads|.*\\..*).*)"],
};
