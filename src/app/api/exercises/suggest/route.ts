import { NextRequest, NextResponse } from "next/server";
import { authorize, requireUser } from "@/lib/auth";
import { suggestWorkout } from "@/lib/exercises/suggest";

// 今天练什么：纯随机抽 1 个动作，或 mode=plan 抽 4-6 个组成小课表
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:exercises:suggest-post");
  if (denied) return denied;

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const bodyPart = String(body?.bodyPart ?? "").trim() || undefined;
  const equipment = String(body?.equipment ?? "").trim() || undefined;
  const mode = body?.mode === "single" ? "single" : "plan";

  return NextResponse.json(suggestWorkout({ bodyPart, equipment, mode }));
}
