import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { familySops } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

/** 保存一条家庭指南（从洞察一键保存，或手工添加） */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:family-sops:create");
  if (denied) return denied;
  const body = await req.json();
  const actionSop = typeof body.actionSop === "string" ? body.actionSop.trim() : "";
  if (!actionSop) return NextResponse.json({ error: "行动建议不能为空" }, { status: 400 });
  const row = db
    .insert(familySops)
    .values({
      userId: auth.user.id,
      insightId: body.insightId != null ? Number(body.insightId) : null,
      type: typeof body.type === "string" ? body.type.trim().slice(0, 20) : "",
      insight: typeof body.insight === "string" ? body.insight.trim().slice(0, 500) : "",
      actionSop: actionSop.slice(0, 500),
    })
    .returning()
    .get();
  return NextResponse.json(row, { status: 201 });
}
