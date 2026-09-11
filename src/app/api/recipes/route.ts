import { NextRequest, NextResponse } from "next/server";
import { and, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { recipes } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 96;

// 食谱列表（只读内容库）：q 搜菜名/正文 + 分类筛选，服务端分页。
// 分类计数是整库口径（不随筛选变化），前端分类导航不会跳动。
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:recipes:list");
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const category = (sp.get("category") ?? "").trim();
  const page = Math.max(1, Math.floor(Number(sp.get("page")) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(sp.get("pageSize")) || DEFAULT_PAGE_SIZE)));

  const conds = [
    category ? eq(recipes.category, category) : undefined,
    q ? or(like(recipes.name, `%${q}%`), like(recipes.content, `%${q}%`)) : undefined,
  ];
  const where = conds.length ? and(...conds) : undefined;

  const [countRow] = db.select({ count: sql<number>`count(*)` }).from(recipes).where(where).all();
  const total = countRow?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);

  const list = db
    .select({ id: recipes.id, source: recipes.source, category: recipes.category, name: recipes.name, image: recipes.image })
    .from(recipes)
    .where(where)
    .orderBy(recipes.category, recipes.id)
    .limit(pageSize)
    .offset((current - 1) * pageSize)
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

  return NextResponse.json({ categories, total, page: current, pageSize, pageCount, list });
}
