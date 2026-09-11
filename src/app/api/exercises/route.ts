import { NextRequest, NextResponse } from "next/server";
import { and, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { expandKeyword } from "@/lib/exercises/sources";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 96;

// 健身馆列表（只读内容库）：服务端分页 + 部位/器械/关键词筛选。
// 部位与器械的计数是整库口径（不随筛选变化），前端筛选栏不会跳动。
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:exercises:list");
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const bodyPart = (sp.get("bodyPart") ?? "").trim().toLowerCase();
  const equipment = (sp.get("equipment") ?? "").trim().toLowerCase();
  const page = Math.max(1, Math.floor(Number(sp.get("page")) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(sp.get("pageSize")) || DEFAULT_PAGE_SIZE)));

  // 中文关键词展开成英文动作名/肌群词后再匹配（动作名与字段值都是英文）；
  // 步骤正文只对原词做全文匹配，避免同义词把无关动作也捞进来
  const terms = expandKeyword(q);
  const kwConds = terms.flatMap((t, i) => [
    like(exercises.name, `%${t}%`),
    like(exercises.target, `%${t}%`),
    like(exercises.muscleGroup, `%${t}%`),
    like(exercises.secondaryMuscles, `%${t}%`),
    ...(i === 0 ? [like(exercises.steps, `%${t}%`)] : []),
  ]);
  const conds = [
    bodyPart ? eq(exercises.bodyPart, bodyPart) : undefined,
    equipment ? eq(exercises.equipment, equipment) : undefined,
    ...(kwConds.length ? [or(...kwConds)] : []),
  ];
  const where = conds.length ? and(...conds) : undefined;

  const [countRow] = db.select({ count: sql<number>`count(*)` }).from(exercises).where(where).all();
  const total = countRow?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);

  const list = db
    .select({
      id: exercises.id,
      name: exercises.name,
      bodyPart: exercises.bodyPart,
      equipment: exercises.equipment,
      target: exercises.target,
      image: exercises.image,
    })
    .from(exercises)
    .where(where)
    .orderBy(exercises.bodyPart, exercises.name)
    .limit(pageSize)
    .offset((current - 1) * pageSize)
    .all();

  const bodyParts = db
    .select({ name: exercises.bodyPart, count: sql<number>`count(*)` })
    .from(exercises)
    .groupBy(exercises.bodyPart)
    .all()
    .map((c) => ({ name: c.name, count: c.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const equipments = db
    .select({ name: exercises.equipment, count: sql<number>`count(*)` })
    .from(exercises)
    .groupBy(exercises.equipment)
    .all()
    .map((c) => ({ name: c.name, count: c.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return NextResponse.json({ bodyParts, equipments, total, page: current, pageSize, pageCount, list });
}
