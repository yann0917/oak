import { NextRequest, NextResponse } from "next/server";
import { signToken, verifyCredentials } from "@/lib/auth";
import { clientIp, guard, RATE_LIMITS, resetRateLimit } from "@/lib/rateLimit";

/**
 * 原生客户端登录：token 放响应体，不设 cookie。
 * 与 /api/auth/login 分开，避免把 Web 端的 httpOnly 保护作废。
 * 位于 auth/ 下 → gen-api-perms.mjs 跳过该目录，不会产生「登录需要权限」的死循环。
 */
export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({}));
  const key = `login:${clientIp(req)}:${typeof username === "string" ? username : ""}`;
  const limited = guard(key, RATE_LIMITS.login);
  if (limited) return limited;

  if (!username || !password) {
    return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
  }
  const user = verifyCredentials(username, password);
  if (!user) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }
  if (!user.status) {
    return NextResponse.json({ error: "账号已停用，请联系管理员" }, { status: 403 });
  }
  resetRateLimit(key);
  return NextResponse.json({
    token: signToken({ uid: user.id, username: user.username }),
    user: { id: user.id, username: user.username, displayName: user.displayName, isAdmin: !!user.isAdmin },
  });
}
