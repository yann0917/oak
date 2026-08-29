import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";

export async function PUT(req: NextRequest) {
  const auth = getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { oldPassword, newPassword } = await req.json();
  if (!oldPassword || !newPassword) {
    return NextResponse.json({ error: "请填写完整" }, { status: 400 });
  }
  if (String(newPassword).length < 6) {
    return NextResponse.json({ error: "新密码至少 6 位" }, { status: 400 });
  }
  const user = db.select().from(users).where(eq(users.id, auth.uid)).get();
  if (!user || !bcrypt.compareSync(oldPassword, user.passwordHash)) {
    return NextResponse.json({ error: "原密码不正确" }, { status: 400 });
  }
  db.update(users)
    .set({ passwordHash: bcrypt.hashSync(newPassword, 10) })
    .where(eq(users.id, auth.uid))
    .run();
  return NextResponse.json({ ok: true });
}
