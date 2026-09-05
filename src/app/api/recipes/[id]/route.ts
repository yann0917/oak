import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recipes } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

// 菜谱详情（含 markdown 正文）
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:recipes:detail");
  if (denied) return denied;

  const { id } = await params;
  const row = db.select().from(recipes).where(eq(recipes.id, Number(id))).get();
  if (!row) return NextResponse.json({ error: "菜谱不存在" }, { status: 404 });
  return NextResponse.json(row);
}
