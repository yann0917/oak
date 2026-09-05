import { NextRequest, NextResponse } from "next/server";
import { requirePerm } from "@/lib/auth";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { streamChatCompletion } from "@/lib/ai/client";

/**
 * 笔记编辑器 AI 续写（流式纯文本增量）。
 * 与 FIM 方案的差异：走当前配置的对话模型（任意 OpenAI 兼容服务商，无 DeepSeek beta 端点依赖），
 * 标题 + 光标前后文作为结构化上下文，输出约束为纯文本 + $...$ 公式（编辑器内直接可读）。
 */
export async function POST(req: NextRequest) {
  const { user, denied } = await requirePerm("ai-chat", "create", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: { title?: unknown; prefix?: unknown; suffix?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 100) : "";
  const mode = body.mode === "markdown" ? "markdown" : "plain";
  // 只保留靠近光标的 4000 字，控制上下文长度
  const clamp = (v: unknown) => (typeof v === "string" ? v.slice(-4000) : "");
  const prefix = clamp(body.prefix);
  const suffix = clamp(body.suffix);
  if (!prefix.trim() && !suffix.trim()) {
    return NextResponse.json({ error: "先写点内容再让 AI 续写" }, { status: 400 });
  }

  const runtime = getAiRuntimeConfig(user.id);
  if (!runtime.enabled || !runtime.provider?.baseUrl || !runtime.provider.model) {
    return NextResponse.json({ error: "未启用 AI，请先在设置页配置模型" }, { status: 400 });
  }
  const ai = runtime.provider;

  const system =
    mode === "markdown"
      ? `你是笔记续写助手。用户会给你笔记标题、光标前的文本（before）和光标后的文本（after），请续写光标处缺失的内容：
- 与上下文自然衔接，延续已有叙述的风格、语气与详略程度
- 只输出要新增的内容，不要重复 before/after 中已有的文字，不要输出「好的，以下是续写」之类的说明
- Markdown 语法书写：可使用标题、列表、**加粗**、代码块等；数学公式用 $...$ 的 LaTeX 写法
- 简体中文；长度适中，把该讲的内容讲清楚即可`
      : `你是错题本笔记的续写助手。用户会给你笔记标题、光标前的文本（before）和光标后的文本（after），请续写光标处缺失的内容：
- 与上下文自然衔接，延续已有叙述的风格、语气与详略程度
- 只输出要新增的内容，不要重复 before/after 中已有的文字，不要输出「好的，以下是续写」之类的说明
- 纯文本输出：不要使用 markdown 标记（如 **、##、列表符号）；数学公式用 $...$ 的 LaTeX 写法
- 简体中文；一般 1-3 段以内，把该讲的内容讲清楚即可`;
  const userText = JSON.stringify({
    title: title || undefined,
    before: prefix,
    after: suffix || undefined,
  });

  const encoder = new TextEncoder();
  const stream = streamChatCompletion(
    { baseUrl: ai.baseUrl, apiKey: ai.apiKey, model: ai.model, provider: ai.provider },
    {
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
      temperature: 0.4,
      maxTokens: 4096,
      timeoutMs: 60_000,
      signal: req.signal, // 客户端停止/断开时中断上游
    }
  );

  const bodyStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of stream) controller.enqueue(encoder.encode(delta));
      } catch (e: any) {
        // 流已开始输出后再失败只能 error 断开；客户端按异常提示
        controller.error(new Error(e?.message ?? "生成失败"));
        return;
      }
      controller.close();
    },
  });
  return new Response(bodyStream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
