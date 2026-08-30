import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { menus } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

const MENU_TYPES = ["dir", "menu", "button"];

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "system:menu:update");
  if (denied) return denied;

  const { id } = await ctx.params;
  const body = await req.json();
  const values: Record<string, any> = {};
  if (body.type != null) {
    if (!MENU_TYPES.includes(body.type)) return NextResponse.json({ error: "未知菜单类型" }, { status: 400 });
    values.type = body.type;
  }
  if (body.name != null) values.name = String(body.name).trim();
  if (body.path != null) values.path = body.path;
  if (body.icon != null) values.icon = body.icon;
  if (body.perms != null) values.perms = body.perms;
  if (body.sort != null) values.sort = Number(body.sort) || 0;
  if (body.visible != null) values.visible = body.visible ? 1 : 0;
  if (body.parentId !== undefined) {
    values.parentId = body.parentId != null && body.parentId !== "" ? Number(body.parentId) : null;
  }
  if (values.name === "") return NextResponse.json({ error: "菜单名称不能为空" }, { status: 400 });

  const row = db.update(menus).set(values).where(eq(menus.id, Number(id))).returning().get();
  if (!row) return NextResponse.json({ error: "菜单不存在" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "system:menu:delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const children = db.select().from(menus).where(eq(menus.parentId, Number(id))).all();
  if (children.length) {
    return NextResponse.json({ error: "请先删除子菜单" }, { status: 400 });
  }
  const row = db.delete(menus).where(eq(menus.id, Number(id))).returning().get();
  if (!row) return NextResponse.json({ error: "菜单不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
