import { NextRequest, NextResponse } from "next/server";
import { desc, gte } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

/** AI 调用用量（近 30 天，按天+模型聚合）：AI 设置页展示 */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:ai-settings:list");
  if (denied) return denied;

  const since = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" })
    .format(new Date(Date.now() - 30 * 86400000));
  const rows = db
    .select()
    .from(aiUsage)
    .where(gte(aiUsage.date, since))
    .orderBy(desc(aiUsage.date), desc(aiUsage.model))
    .all();

  const summary = rows.reduce(
    (acc, r) => ({
      calls: acc.calls + r.calls,
      promptTokens: acc.promptTokens + r.promptTokens,
      completionTokens: acc.completionTokens + r.completionTokens,
      errors: acc.errors + r.errors,
    }),
    { calls: 0, promptTokens: 0, completionTokens: 0, errors: 0 }
  );

  return NextResponse.json({ summary, rows });
}
