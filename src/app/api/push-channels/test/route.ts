import { NextRequest, NextResponse } from "next/server";
import { authorize, requireUser } from "@/lib/auth";
import { sendChannel } from "@/lib/reminders/channels";
import { CHANNEL_TYPES } from "@/lib/reminders/meta";

/** 渠道连通性测试：真实发送一条测试消息（配置须已保存并启用，按当前用户读取） */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:push-channels:test-post");
  if (denied) return denied;
  const { type } = await req.json();
  if (!CHANNEL_TYPES.includes(type)) return NextResponse.json({ error: "未知渠道" }, { status: 400 });
  const res = await sendChannel(
    uid,
    type,
    "Oak 提醒中心测试",
    "这是一条来自 Oak 提醒中心的测试消息，收到即为配置成功。"
  );
  if (res.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: false, error: res.error }, { status: 502 });
}
