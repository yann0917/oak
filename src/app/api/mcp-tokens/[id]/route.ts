import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mcpTokens } from "@/db/schema";
import { requirePerm } from "@/lib/auth";

/** 撤销令牌：仅本人可见/可撤（status=0 停用，删除会丢掉审计痕迹） */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requirePerm("mcp-tokens", "delete", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id 无效" }, { status: 400 });
  const row = db
    .select({ id: mcpTokens.id })
    .from(mcpTokens)
    .where(and(eq(mcpTokens.id, id), eq(mcpTokens.userId, user.id)))
    .get();
  if (!row) return NextResponse.json({ error: "令牌不存在" }, { status: 404 });
  db.update(mcpTokens).set({ status: 0 }).where(eq(mcpTokens.id, id)).run();
  return NextResponse.json({ ok: true });
}
