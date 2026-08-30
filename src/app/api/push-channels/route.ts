import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushChannels } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { CHANNEL_TYPES, type ChannelType } from "@/lib/reminders/meta";

export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.uid;
  const rows = db
    .select()
    .from(pushChannels)
    .where(eq(pushChannels.userId, uid))
    .orderBy(asc(pushChannels.type))
    .all();
  return NextResponse.json(rows);
}

/** 保存某用户某渠道配置（user_id+type 唯一，存在即覆写）。config 为 JSON 对象。 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.uid;
  const body = await req.json();
  const type = body.type as ChannelType;
  if (!CHANNEL_TYPES.includes(type)) return NextResponse.json({ error: "未知渠道" }, { status: 400 });

  const config = body.config && typeof body.config === "object" ? JSON.stringify(body.config) : "{}";
  const enabled = body.enabled == null ? 1 : body.enabled ? 1 : 0;

  const existing = db
    .select()
    .from(pushChannels)
    .where(and(eq(pushChannels.userId, uid), eq(pushChannels.type, type)))
    .get();
  let row;
  if (existing) {
    row = db
      .update(pushChannels)
      .set({ config, enabled })
      .where(eq(pushChannels.id, existing.id))
      .returning()
      .get();
  } else {
    row = db
      .insert(pushChannels)
      .values({ userId: uid, type, config, enabled })
      .returning()
      .get();
  }
  return NextResponse.json(row, { status: existing ? 200 : 201 });
}
