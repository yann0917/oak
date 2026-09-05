import { NextRequest, NextResponse } from "next/server";
import { like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { recipes } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

// 食谱列表（只读内容库）：q 搜菜名/正文，返回全量精简字段 + 各分类计数（351 篇体量一次拉完，前端本地渲染）
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:recipes:list");
  if (denied) return denied;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const rows = db
    .select({ id: recipes.id, category: recipes.category, name: recipes.name, image: recipes.image })
    .from(recipes)
    .where(q ? or(like(recipes.name, `%${q}%`), like(recipes.content, `%${q}%`)) : undefined)
    .orderBy(recipes.category, recipes.id)
    .all();

  const counts = db
    .select({ category: recipes.category, count: sql<number>`count(*)` })
    .from(recipes)
    .groupBy(recipes.category)
    .all();

  // 分类按菜谱数多 → 少排（炒菜/蒸菜在前），同名按名称
  const categories = counts
    .map((c) => ({ name: c.category, count: c.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hans-CN"));

  return NextResponse.json({ categories, list: rows });
}
