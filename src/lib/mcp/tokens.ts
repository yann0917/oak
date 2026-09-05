import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mcpTokens } from "@/db/schema";
import { AUTH_SECRET } from "@/lib/auth";

/**
 * MCP 访问令牌：本体是复用 AUTH_SECRET 签的 JWT（payload {uid, scope:"mcp"}），
 * 数据库只存 sha256 摘要用于校验/撤销（不存明文，无法回显）。
 * 校验 = JWT 合法 + scope=mcp + 表中存在且启用未过期。
 */

const MCP_SCOPE = "mcp";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** 创建令牌：days=null 表示永久有效；明文 token 仅此一次返回 */
export function createMcpToken(
  userId: number,
  name: string,
  days: number | null
): { id: number; token: string } {
  const token = jwt.sign(
    { uid: userId, scope: MCP_SCOPE },
    AUTH_SECRET,
    days && days > 0 ? { expiresIn: `${days}d` } : undefined
  );
  const expiresAt = days && days > 0 ? new Date(Date.now() + days * 86400e3).toISOString() : "";
  const row = db
    .insert(mcpTokens)
    .values({ userId, name: (name || "").trim().slice(0, 50), tokenHash: hashToken(token), expiresAt })
    .run();
  return { id: Number(row.lastInsertRowid), token };
}

/** 校验令牌：成功返回 { uid }（并更新 last_used_at），否则 null */
export function verifyMcpToken(token: string): { uid: number } | null {
  try {
    const payload = jwt.verify(token, AUTH_SECRET) as { uid?: number; scope?: string };
    if (!payload.uid || payload.scope !== MCP_SCOPE) return null;
    const row = db
      .select()
      .from(mcpTokens)
      .where(
        and(
          eq(mcpTokens.userId, payload.uid),
          eq(mcpTokens.tokenHash, hashToken(token)),
          eq(mcpTokens.status, 1)
        )
      )
      .get();
    if (!row) return null;
    if (row.expiresAt && row.expiresAt < new Date().toISOString()) return null;
    db.update(mcpTokens).set({ lastUsedAt: new Date().toISOString() }).where(eq(mcpTokens.id, row.id)).run();
    return { uid: payload.uid };
  } catch {
    return null;
  }
}
