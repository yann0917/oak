import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mcpTokens } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { createMcpToken } from "@/lib/mcp/tokens";

/** MCP 接入令牌列表（不含令牌本体，只有元信息；明文仅在创建时返回一次） */
export async function GET(req: NextRequest) {
  const { user, denied } = await requirePerm("mcp-tokens", "list", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const rows = db
    .select({
      id: mcpTokens.id,
      name: mcpTokens.name,
      expiresAt: mcpTokens.expiresAt,
      lastUsedAt: mcpTokens.lastUsedAt,
      createdAt: mcpTokens.createdAt,
      status: mcpTokens.status,
    })
    .from(mcpTokens)
    .where(eq(mcpTokens.userId, user.id))
    .orderBy(desc(mcpTokens.id))
    .all();
  return NextResponse.json({ rows });
}

const VALID_DAYS = [30, 90, 365];

/** 创建令牌：明文 token 仅此响应返回一次（数据库只存 sha256） */
export async function POST(req: NextRequest) {
  const { user, denied } = await requirePerm("mcp-tokens", "create", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "请输入令牌名称（如 codex-agent）" }, { status: 400 });
  const rawDays = Number(body.days);
  const days = !rawDays ? null : VALID_DAYS.includes(rawDays) ? rawDays : null;
  if (rawDays && !VALID_DAYS.includes(rawDays)) {
    return NextResponse.json({ error: "有效期仅支持 30/90/365 天或永久" }, { status: 400 });
  }
  const { id, token } = createMcpToken(user.id, name, days);
  return NextResponse.json({ id, token });
}
