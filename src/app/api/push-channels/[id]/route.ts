import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushChannels } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:push-channels:update");
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await req.json();
  const values: Record<string, any> = {};
  if (typeof body.config === "object" && body.config != null) values.config = JSON.stringify(body.config);
  if (body.enabled != null) values.enabled = body.enabled ? 1 : 0;
  if (!Object.keys(values).length) return NextResponse.json({ error: "无更新内容" }, { status: 400 });

  const row = db
    .update(pushChannels)
    .set(values)
    .where(and(eq(pushChannels.id, Number(id)), eq(pushChannels.userId, uid)))
    .returning()
    .get();
  if (!row) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:push-channels:delete");
  if (denied) return denied;
  const { id } = await ctx.params;
  const row = db
    .delete(pushChannels)
    .where(and(eq(pushChannels.id, Number(id)), eq(pushChannels.userId, uid)))
    .returning()
    .get();
  if (!row) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
