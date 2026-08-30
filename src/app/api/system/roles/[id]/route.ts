import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { roles } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "system:role:update");
  if (denied) return denied;

  const { id } = await ctx.params;
  const body = await req.json();
  const values: Record<string, any> = {};
  if (body.code != null) values.code = String(body.code).trim();
  if (body.name != null) values.name = String(body.name).trim();
  if (body.remark != null) values.remark = body.remark;
  if (!values.code || !values.name) return NextResponse.json({ error: "角色编码和名称不能为空" }, { status: 400 });

  try {
    const row = db.update(roles).set(values).where(eq(roles.id, Number(id))).returning().get();
    if (!row) return NextResponse.json({ error: "角色不存在" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e: any) {
    if (String(e?.message).includes("UNIQUE")) return NextResponse.json({ error: "角色编码已存在" }, { status: 400 });
    throw e;
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "system:role:delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  // users_roles / roles_menus 外键级联删除
  const row = db.delete(roles).where(eq(roles.id, Number(id))).returning().get();
  if (!row) return NextResponse.json({ error: "角色不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
