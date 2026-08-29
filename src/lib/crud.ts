import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, SQL } from "drizzle-orm";
import { db } from "@/db";
import { requireAuth } from "@/lib/auth";

type AnyTable = any;

interface CrudOptions {
  /** 按 child_id 过滤的表需要传 true */
  childScoped?: boolean;
  /** 默认排序字段（drizzle 列），默认按 id desc */
  orderBy?: any;
}

/** 生成 GET(列表) / POST(新建) 处理器 */
export function makeCollectionHandlers(table: AnyTable, opts: CrudOptions = {}) {
  const { childScoped, orderBy } = opts;

  async function GET(req: NextRequest) {
    const unauthorized = await requireAuth(req);
    if (unauthorized) return unauthorized;
    const { searchParams } = new URL(req.url);
    const conditions: SQL[] = [];
    if (childScoped) {
      const childId = searchParams.get("childId");
      if (!childId) {
        return NextResponse.json({ error: "缺少 childId 参数" }, { status: 400 });
      }
      conditions.push(eq(table.childId, Number(childId)));
    }
    const query = db.select().from(table);
    const rows = conditions.length
      ? query.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : query;
    const result = orderBy ? rows.orderBy(desc(orderBy)) : rows.orderBy(desc(table.id));
    return NextResponse.json(result.all());
  }

  async function POST(req: NextRequest) {
    const unauthorized = await requireAuth(req);
    if (unauthorized) return unauthorized;
    const body = await req.json();
    const row = db.insert(table).values(body).returning().get();
    return NextResponse.json(row, { status: 201 });
  }

  return { GET, POST };
}

/** 生成 GET / PUT / DELETE 单条处理器（Next.js 16：params 为 Promise） */
export function makeItemHandlers(table: AnyTable) {
  async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const unauthorized = await requireAuth(req);
    if (unauthorized) return unauthorized;
    const { id } = await ctx.params;
    const row = db.select().from(table).where(eq(table.id, Number(id))).get();
    if (!row) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    return NextResponse.json(row);
  }

  async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const unauthorized = await requireAuth(req);
    if (unauthorized) return unauthorized;
    const { id } = await ctx.params;
    const body = await req.json();
    const { id: _ignored, ...values } = body;
    const row = db
      .update(table)
      .set(values)
      .where(eq(table.id, Number(id)))
      .returning()
      .get();
    if (!row) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    return NextResponse.json(row);
  }

  async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const unauthorized = await requireAuth(req);
    if (unauthorized) return unauthorized;
    const { id } = await ctx.params;
    db.delete(table).where(eq(table.id, Number(id))).run();
    return NextResponse.json({ ok: true });
  }

  return { GET, PUT, DELETE };
}
