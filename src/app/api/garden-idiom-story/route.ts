// 成语故事接口：POST /api/garden-idiom-story { word, ageGroup }
// 命中缓存（garden_idiom_stories）直接回存稿；未命中则按年龄组流式生成，
// 生成结束后落库，下次同年龄组直接复用。客户端一边读流一边把句子交给 /api/tts 分段朗读，
// 实现「边生成故事，边合成语音」。
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { gardenIdiomStories } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { guard, RATE_LIMITS } from "@/lib/rateLimit";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { streamChatCompletion } from "@/lib/ai/client";
import { AGE_GROUPS, IDIOM_MAP } from "@/data/garden/idioms";

// 年龄组讲故事重点（进系统提示词）
const AGE_SPEC: Record<string, string> = {
  "3-6": "语言非常简单，多用小动物、拟声词和重复的小句子，角色只说一两句简单的话",
  "7-9": "情节完整，有一点点小波折，适当描写动作和心情",
  "10-12": "用词可以更丰富，结尾可带一句轻巧的小道理，但不要讲大道理",
};

export async function POST(req: NextRequest) {
  const { user, denied } = await requirePerm("garden-idiom-story", "create", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const limited = guard(`ai:${user.id}`, RATE_LIMITS.ai);
  if (limited) return limited;

  let body: { word?: unknown; ageGroup?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const word = typeof body.word === "string" ? body.word.trim() : "";
  const ageGroup = typeof body.ageGroup === "string" ? body.ageGroup.trim() : "";
  if (!IDIOM_MAP[word]) {
    return NextResponse.json({ error: "成语不在内置词库中" }, { status: 400 });
  }
  if (!AGE_GROUPS.some((a) => a.key === ageGroup)) {
    return NextResponse.json({ error: "年龄组无效" }, { status: 400 });
  }

  const runtime = getAiRuntimeConfig(user.id);
  if (!runtime.enabled || !runtime.provider?.baseUrl || !runtime.provider.model) {
    return NextResponse.json({ error: "未启用 AI，请先在设置页配置模型" }, { status: 400 });
  }
  const ai = runtime.provider;
  const idiom = IDIOM_MAP[word];

  const existing = db
    .select()
    .from(gardenIdiomStories)
    .where(and(eq(gardenIdiomStories.userId, user.id), eq(gardenIdiomStories.word, word), eq(gardenIdiomStories.ageGroup, ageGroup)))
    .get();

  const stream = existing
    ? null
    : streamChatCompletion(
        { baseUrl: ai.baseUrl, apiKey: ai.apiKey, model: ai.model, provider: ai.provider },
        {
          messages: [
            {
              role: "system",
              content: `你是儿童故事老师，给孩子讲成语故事。
成语是「${idiom.word}」，意思是：${idiom.meaning}。给孩子编一个原创小故事学习这个成语：
- 故事要用一个具体的情境把这个成语的“字面意思”演出来，最后让角色说出或总结这个成语的意思
- 故事 80~180 字，分成 2~3 个短段落，每句尽量简短、口语化、生动有趣
- 年龄组：${AGE_GROUPS.find((a) => a.key === ageGroup)?.label}（${AGE_SPEC[ageGroup]}）
- 只输出故事正文：不要标题、不要“故事开始了”“打小广告”这类提示语
- 简体中文，不要写拼音，结尾不要留空行`,
            },
            { role: "user", content: `请讲「${idiom.word}」的故事` },
          ],
          temperature: 0.8,
          maxTokens: 1024,
          timeoutMs: 90_000,
          signal: req.signal, // 客户端停止/断开时中断上游
        }
      );

  const encoder = new TextEncoder();
  let full = existing?.story ?? "";
  const saveStory = () => {
    try {
      db.insert(gardenIdiomStories)
        .values({ userId: user.id, word, ageGroup, story: full.trim(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .onConflictDoUpdate({
          target: [gardenIdiomStories.userId, gardenIdiomStories.word, gardenIdiomStories.ageGroup],
          set: { story: full.trim(), updatedAt: new Date().toISOString() },
        })
        .run();
    } catch {
      /* 落库失败不影响返回 */
    }
  };
  const bodyStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 命中缓存直接回存稿（客户端同样按句子推进朗读）；未命中走流式生成
        if (existing) {
          controller.enqueue(encoder.encode(existing.story));
        } else {
          for await (const delta of stream!) {
            full += delta;
            controller.enqueue(encoder.encode(delta));
          }
          full = full.trim();
          // 整体落库：同一个成语同一个年龄组只生成一次，之后播放零等待
          saveStory();
        }
        controller.close();
      } catch (e: any) {
        // 流已输出一部分：把已生成的半篇落库，让客户端拿到完整可读结果而不是报错
        if (full.trim()) {
          saveStory();
          controller.close();
          return;
        }
        controller.error(new Error(e?.message ?? "生成失败"));
      }
    },
  });
  return new Response(bodyStream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
