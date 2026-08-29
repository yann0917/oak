import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const user = db.select().from(users).where(eq(users.id, auth.uid)).get();
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  return NextResponse.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
  });
}

// 修改个人信息（昵称）
export async function PUT(req: NextRequest) {
  const auth = getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { displayName } = await req.json();
  db.update(users)
    .set({ displayName: String(displayName ?? "").slice(0, 50) })
    .where(eq(users.id, auth.uid))
    .run();
  return NextResponse.json({ ok: true });
}
