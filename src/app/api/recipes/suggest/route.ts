import { NextRequest, NextResponse } from "next/server";
import { authorize, requireUser } from "@/lib/auth";
import { guard, RATE_LIMITS } from "@/lib/rateLimit";
import { suggestMeals } from "@/lib/recipes/suggest";

// 今天吃什么：AI 从食谱库搭配一餐（未配 AI 时降级随机）
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:recipes:suggest-post");
  if (denied) return denied;
  const limited = guard(`ai:${auth.user.id}`, RATE_LIMITS.ai);
  if (limited) return limited;

  try {
    return NextResponse.json(await suggestMeals(auth.user.id));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "推荐失败" }, { status: 500 });
  }
}
