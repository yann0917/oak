/**
 * 进程内固定窗口限流。
 * oak 必须单实例运行（SQLite + 常驻调度，见 ecosystem.config.js），
 * 因此内存计数就是准确的，无需 Redis；pm2 reload 后计数清零，可接受。
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 5000;

function envLimit(name: string, def: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

export const RATE_LIMITS = {
  /** 登录：IP + 用户名，次/分钟 */
  login: envLimit("OAK_LOGIN_RATE_LIMIT", 5),
  /** 消耗 AI 额度的接口：按用户，次/分钟 */
  ai: envLimit("OAK_AI_RATE_LIMIT", 20),
  /** 全局兜底：按用户，次/分钟 */
  api: envLimit("OAK_RATE_LIMIT", 300),
};

/** 返回 null 表示放行；否则返回 429 响应 */
export function guard(key: string, limit: number, windowMs = 60_000): NextResponse | null {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (bucket.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return NextResponse.json(
      { error: `请求过于频繁，请 ${retryAfter} 秒后重试` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }
  bucket.count++;
  return null;
}

/** 成功后清零（如登录成功） */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/** 客户端 IP：反代后取 X-Forwarded-For 首段 */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
