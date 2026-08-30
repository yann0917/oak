import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { roles } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "system:role:list");
  if (denied) return denied;
  return NextResponse.json(db.select().from(roles).orderBy(asc(roles.id)).all());
}

export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "system:role:create");
  if (denied) return denied;

  const body = await req.json();
  const code = (body.code ?? "").trim();
  const name = (body.name ?? "").trim();
  if (!code || !name) return NextResponse.json({ error: "角色编码和名称不能为空" }, { status: 400 });
  try {
    const row = db
      .insert(roles)
      .values({ code, name, remark: body.remark ?? "" })
      .returning()
      .get();
    return NextResponse.json(row, { status: 201 });
  } catch (e: any) {
    if (String(e?.message).includes("UNIQUE")) return NextResponse.json({ error: "角色编码已存在" }, { status: 400 });
    throw e;
  }
}
