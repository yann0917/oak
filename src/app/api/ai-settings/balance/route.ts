import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiProviders } from "@/db/schema";
import { requirePerm } from "@/lib/auth";

/**
 * DeepSeek 余额查询：GET /api/ai-settings/balance?id=<providerId>
 * 官方文档：https://api-docs.deepseek.com/zh-cn/api/get-user-balance
 */
export async function GET(req: NextRequest) {
  const { user, denied } = await requirePerm("ai-settings", "balance-get", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "配置 id 无效" }, { status: 400 });
  }

  const row = db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.id, id), eq(aiProviders.userId, user.id)))
    .get();
  if (!row) return NextResponse.json({ error: "配置不存在" }, { status: 404 });
  if (row.provider !== "deepseek") {
    return NextResponse.json({ error: "该服务商暂不支持余额查询" }, { status: 400 });
  }

  try {
    const res = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${row.apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json) {
      const msg =
        res.status === 401
          ? "API Key 无效，请检查 DeepSeek 密钥"
          : `查询失败（HTTP ${res.status}）：${json?.error?.message ?? "未知错误"}`;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({
      isAvailable: !!json.is_available,
      balances: Array.isArray(json.balance_infos)
        ? json.balance_infos.map((b: any) => ({
            currency: String(b.currency ?? ""),
            totalBalance: String(b.total_balance ?? "0"),
            grantedBalance: String(b.granted_balance ?? "0"),
            toppedUpBalance: String(b.topped_up_balance ?? "0"),
          }))
        : [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `查询失败：${err.message}` : "查询失败" },
      { status: 502 }
    );
  }
}
