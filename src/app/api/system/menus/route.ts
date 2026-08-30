import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { menus } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { buildMenuTree } from "@/lib/menuTree";

const MENU_TYPES = ["dir", "menu", "button"];

/** 菜单管理：返回完整菜单树（含 button 权限点） */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "system:menu:list");
  if (denied) return denied;
  const rows = db.select().from(menus).orderBy(asc(menus.id)).all() as any[];
  return NextResponse.json(buildMenuTree(rows, true));
}

export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "system:menu:create");
  if (denied) return denied;

  const body = await req.json();
  const type = body.type ?? "menu";
  if (!MENU_TYPES.includes(type)) return NextResponse.json({ error: "未知菜单类型" }, { status: 400 });
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "菜单名称不能为空" }, { status: 400 });
  if (type !== "button" && !(body.path ?? "").trim()) {
    return NextResponse.json({ error: "目录/菜单需要填写路由路径" }, { status: 400 });
  }

  const row = db
    .insert(menus)
    .values({
      parentId: body.parentId != null && body.parentId !== "" ? Number(body.parentId) : null,
      type,
      name,
      path: body.path ?? "",
      icon: body.icon ?? "",
      perms: body.perms ?? "",
      sort: Number(body.sort ?? 0) || 0,
      visible: body.visible === false ? 0 : 1,
    })
    .returning()
    .get();
  return NextResponse.json(row, { status: 201 });
}
