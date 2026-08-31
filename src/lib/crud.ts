import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, SQL } from "drizzle-orm";
import { db } from "@/db";
import { authorize, requireUser } from "@/lib/auth";

type AnyTable = any;

interface CrudOptions {
  /** 按 child_id 过滤的表需要传 true */
  childScoped?: boolean;
  /** 默认排序字段（drizzle 列），默认按 id desc */
  orderBy?: any;
  /** 接口权限前缀（如 "reminders"），自动映射为 api:reminders:list 等 */
  api: string;
}

const COLLECTION_PERMS = (api: string) => ({ list: `api:${api}:list`, create: `api:${api}:create` });
const ITEM_PERMS = (api: string) => ({ detail: `api:${api}:detail`, update: `api:${api}:update`, delete: `api:${api}:delete` });

/** 生成 GET(列表) / POST(新建) 处理器：按登录用户隔离数据 + 接口权限校验 */
export function makeCollectionHandlers(table: AnyTable, opts: CrudOptions = { api: "" }) {
  const { childScoped, orderBy, api } = opts;

  async function GET(req: NextRequest) {
    const auth = requireUser(req);
    if ("response" in auth) return auth.response;
    const denied = await authorize(auth.user.username, auth.user.isAdmin, COLLECTION_PERMS(api).list);
    if (denied) return denied;
    const { searchParams } = new URL(req.url);
    const conditions: SQL[] = [eq(table.userId, auth.user.id)];
    if (childScoped) {
      const childId = searchParams.get("childId");
      if (!childId) {
        return NextResponse.json({ error: "缺少 childId 参数" }, { status: 400 });
      }
      conditions.push(eq(table.childId, Number(childId)));
    }
    const where = conditions.length === 1 ? conditions[0] : and(...conditions);
    const orderCol = orderBy ?? table.id;

    // 分页：只有带 page 参数时才启用，返回 { total, list }；不带则保持原数组返回，兼容其它调用方
    if (searchParams.has("page")) {
      const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
      const pageSize = Math.min(Math.max(1, Number(searchParams.get("pageSize") ?? 10) || 10), 200);
      const total = await db.$count(table, where);
      const list = db
        .select()
        .from(table)
        .where(where)
        .orderBy(desc(orderCol))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .all();
      return NextResponse.json({ total, list });
    }

    const result = db.select().from(table).where(where).orderBy(desc(orderCol));
    return NextResponse.json(result.all());
  }

  async function POST(req: NextRequest) {
    const auth = requireUser(req);
    if ("response" in auth) return auth.response;
    const denied = await authorize(auth.user.username, auth.user.isAdmin, COLLECTION_PERMS(api).create);
    if (denied) return denied;
    const body = await req.json();
    const row = db.insert(table).values({ ...body, userId: auth.user.id }).returning().get();
    return NextResponse.json(row, { status: 201 });
  }

  return { GET, POST };
}

/** 生成 PUT / DELETE 单条处理器（Next.js 16：params 为 Promise），仅限本人记录 */
export function makeItemHandlers(table: AnyTable, opts: CrudOptions = { api: "" }) {
  const { api } = opts;

  async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const auth = requireUser(req);
    if ("response" in auth) return auth.response;
    const denied = await authorize(auth.user.username, auth.user.isAdmin, ITEM_PERMS(api).detail);
    if (denied) return denied;
    const { id } = await ctx.params;
    const row = db
      .select()
      .from(table)
      .where(and(eq(table.id, Number(id)), eq(table.userId, auth.user.id)))
      .get();
    if (!row) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    return NextResponse.json(row);
  }

  async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const auth = requireUser(req);
    if ("response" in auth) return auth.response;
    const denied = await authorize(auth.user.username, auth.user.isAdmin, ITEM_PERMS(api).update);
    if (denied) return denied;
    const { id } = await ctx.params;
    const body = await req.json();
    const { id: _ignored, userId: _uid, ...values } = body;
    const row = db
      .update(table)
      .set(values)
      .where(and(eq(table.id, Number(id)), eq(table.userId, auth.user.id)))
      .returning()
      .get();
    if (!row) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    return NextResponse.json(row);
  }

  async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const auth = requireUser(req);
    if ("response" in auth) return auth.response;
    const denied = await authorize(auth.user.username, auth.user.isAdmin, ITEM_PERMS(api).delete);
    if (denied) return denied;
    const { id } = await ctx.params;
    const row = db
      .delete(table)
      .where(and(eq(table.id, Number(id)), eq(table.userId, auth.user.id)))
      .returning()
      .get();
    if (!row) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    return NextResponse.json(row);
  }

  return { GET, PUT, DELETE };
}
