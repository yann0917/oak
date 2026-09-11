import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

// 动作详情（含中文分步）
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:exercises:detail");
  if (denied) return denied;

  const { id } = await params;
  const row = db.select().from(exercises).where(eq(exercises.id, Number(id))).get();
  if (!row) return NextResponse.json({ error: "动作不存在" }, { status: 404 });

  let secondaryMuscles: string[] = [];
  let steps: string[] = [];
  try {
    secondaryMuscles = JSON.parse(row.secondaryMuscles || "[]");
  } catch {}
  try {
    steps = JSON.parse(row.steps || "[]");
  } catch {}

  return NextResponse.json({ ...row, secondaryMuscles, steps });
}
