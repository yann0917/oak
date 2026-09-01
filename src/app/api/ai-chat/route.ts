import { NextRequest, NextResponse } from "next/server";
import { requirePerm } from "@/lib/auth";
import { streamAgentChat } from "@/lib/ai-agent/chat";

/**
 * AI 助手对话（流式）：body = { id: sessionId, messages: UIMessage[] }。
 * DefaultChatTransport 默认发送 { id, messages }，messages 最后一条为新用户消息。
 * 历史消息一律以服务端 DB 为准（防止客户端注入不一致上下文）。
 */
export async function POST(req: NextRequest) {
  const { user, denied } = await requirePerm("ai-chat", "create", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: { id?: unknown; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const sessionId = Number(body.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ error: "会话 id 无效" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = messages[messages.length - 1] as
    | { content?: unknown; parts?: unknown }
    | undefined;

  // 兼容三种消息格式：UI 消息 parts 数组（DefaultChatTransport 实际发送）、
  // 旧 content 数组、纯文本 content
  let userText = "";
  if (Array.isArray(last?.parts)) {
    userText = (last.parts as { type?: string; text?: string }[])
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("");
  } else if (Array.isArray(last?.content)) {
    userText = (last.content as { type?: string; text?: string }[])
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("");
  } else if (typeof last?.content === "string") {
    userText = last.content;
  }
  userText = userText.trim();
  if (!userText) return NextResponse.json({ error: "消息内容不能为空" }, { status: 400 });
  if (userText.length > 2000) {
    return NextResponse.json({ error: "消息太长了（最多 2000 字）" }, { status: 400 });
  }

  return streamAgentChat({
    userId: user.id,
    userName: user.displayName || user.username,
    sessionId,
    userText,
  });
}
