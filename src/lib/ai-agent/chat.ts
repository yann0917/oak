import {
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import { NextResponse } from "next/server";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages, chatSessions, children } from "@/db/schema";
import { getAgentSetup } from "./provider";
import { buildSystemPrompt } from "./systemPrompt";
import { buildAgentTools } from "./tools";

const HISTORY_LIMIT = 40;
const MAX_STEPS = 8;

/**
 * AI 助手聊天主流程：
 * 1. 校验会话归属（当前用户）
 * 2. 用户消息先落库（流式失败也不丢）
 * 3. 历史消息（权威源：DB）+ 新消息 → streamText 工具循环（只读工具）
 * 4. onEnd 持久化 assistant 消息（正文 + 工具调用摘要）
 * 5. 返回 UI Message 流式响应
 */
export async function streamAgentChat(opts: {
  userId: number;
  userName: string;
  sessionId: number;
  userText: string;
}) {
  const { userId, userName, sessionId, userText } = opts;

  const session = db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
    .get();
  if (!session) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }

  const setup = getAgentSetup(userId);
  if (!setup) {
    return NextResponse.json(
      { error: "请先在「设置 → AI 大模型」中配置并启用模型后再对话" },
      { status: 400 }
    );
  }
  const model = setup.model;

  const now = new Date().toISOString();
  const priorUser = db
    .select({ c: count() })
    .from(chatMessages)
    .where(and(eq(chatMessages.sessionId, sessionId), eq(chatMessages.role, "user")))
    .get()?.c ?? 0;

  // 历史（最近 N 条，升序回放）
  const history = db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(desc(chatMessages.id))
    .limit(HISTORY_LIMIT)
    .all()
    .reverse()
    .map((r) => ({
      role: (r.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: r.content,
    }));

  // 会话首条用户消息：自动生成标题
  const isFirstUserMessage = priorUser === 0;
  db.insert(chatMessages)
    .values({ sessionId, userId, role: "user", content: userText })
    .run();
  db.update(chatSessions)
    .set({
      updatedAt: now,
      ...(isFirstUserMessage
        ? { title: userText.replace(/\s+/g, " ").slice(0, 30) || "新对话" }
        : {}),
    })
    .where(eq(chatSessions.id, sessionId))
    .run();

  const { tools, records } = buildAgentTools(userId, { searchApiKey: setup.searchApiKey });
  // DeepSeek Responses API 原生免费联网搜索（服务端工具，无需额外 key；
  // 其余服务商若原生不支持则依赖 AnySearch 工具，model 依据提示词按需调用）
  if (setup.mode === "responses" && setup.providerKey === "deepseek") {
    (tools as any).webSearchNative = setup.provider.tools.webSearch();
  }  const familyChildren = db
    .select({
      id: children.id,
      name: children.name,
      nickname: children.nickname,
      gender: children.gender,
      birthday: children.birthday,
    })
    .from(children)
    .where(eq(children.userId, userId))
    .all();

  const result = streamText({
    model,
    instructions: buildSystemPrompt(userName, familyChildren),
    messages: [...history, { role: "user", content: userText }],
    tools,
    stopWhen: isStepCount(MAX_STEPS),
    onEnd: async (event) => {
      const text = typeof event.text === "string" ? event.text : "";
      const finishedAt = new Date().toISOString();
      db.insert(chatMessages)
        .values({
          sessionId,
          userId,
          role: "assistant",
          content: text,
          data: JSON.stringify({ toolCalls: records }),
        })
        .run();
      db.update(chatSessions).set({ updatedAt: finishedAt }).where(eq(chatSessions.id, sessionId)).run();
    },
    onError: async ({ error }) => {
      console.error("[ai-agent] 流式生成失败:", error);
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
