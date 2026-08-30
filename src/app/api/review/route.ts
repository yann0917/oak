import { NextRequest, NextResponse } from "next/server";
import { Rating } from "ts-fsrs";
import { authorize, requireUser } from "@/lib/auth";
import { getDueCards, previewIntervals, rateCard } from "@/lib/fsrs";

/** 今日待复习队列：卡片 + 四个评分按钮的间隔预览 */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:review:list");
  if (denied) return denied;

  const queue = getDueCards(auth.user.id);
  return NextResponse.json({
    items: queue.map((item) => {
      const previews = previewIntervals(item.noteId);
      return { ...item, previews };
    }),
  });
}

/** 评分：1 Again / 2 Hard / 3 Good / 4 Easy */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:review:post");
  if (denied) return denied;

  const body = await req.json();
  const noteId = Number(body.noteId);
  const rating = Number(body.rating) as Rating;
  if (!noteId || !(rating >= 1 && rating <= 4)) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }
  // 只允许给自己的到期卡评分（getDueCards 已按用户+enabled 过滤）
  if (!getDueCards(auth.user.id).some((i) => i.noteId === noteId)) {
    return NextResponse.json({ error: "卡片不存在" }, { status: 404 });
  }
  const result = rateCard(noteId, rating);
  return NextResponse.json(result);
}
