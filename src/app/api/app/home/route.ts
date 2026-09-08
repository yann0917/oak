import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bills,
  certArchives,
  children,
  growthRecords,
  healthRecords,
  learningRecords,
  moments,
  notes,
  pushLogs,
  quickNotes,
  todoSteps,
  todos,
} from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

/** 按北京时间归到 YYYY-MM-DD（与 /api/stats/heatmap 一致） */
function dayKey(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date(iso));
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 移动端首屏聚合：成员 + 未完成待办 + 未读通知 + 最近快记 + 近 7 天活动 */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:app:home-get");
  if (denied) return denied;
  const uid = auth.user.id;

  const childRows = db.select().from(children).where(eq(children.userId, uid)).orderBy(children.id).all();

  const todoRows = db
    .select()
    .from(todos)
    .where(and(eq(todos.userId, uid), eq(todos.done, 0)))
    .orderBy(desc(todos.id))
    .all();
  const todoIds = todoRows.map((t) => t.id);
  const steps = todoIds.length
    ? db.select().from(todoSteps).where(inArray(todoSteps.todoId, todoIds)).orderBy(todoSteps.sort).all()
    : [];

  const noticeRows = db
    .select()
    .from(pushLogs)
    .where(and(eq(pushLogs.userId, uid), eq(pushLogs.read, 0)))
    .orderBy(desc(pushLogs.id))
    .limit(50)
    .all();

  const noteRows = db
    .select()
    .from(quickNotes)
    .where(eq(quickNotes.userId, uid))
    .orderBy(desc(quickNotes.id))
    .limit(5)
    .all();

  // 近 7 天活动：表集合与 /api/stats/heatmap 保持一致
  const sinceIso = new Date(Date.now() - 7 * 86400000).toISOString();
  const days: Record<string, number> = {};
  for (const table of [
    quickNotes,
    moments,
    growthRecords,
    healthRecords,
    bills,
    learningRecords,
    certArchives,
    notes,
  ]) {
    const rows = db
      .select({ createdAt: table.createdAt })
      .from(table)
      .where(and(eq(table.userId, uid), gte(table.createdAt, sinceIso)))
      .all();
    for (const r of rows) {
      const day = dayKey(r.createdAt);
      days[day] = (days[day] ?? 0) + 1;
    }
  }

  return NextResponse.json({
    children: childRows.map((c) => ({
      id: c.id,
      name: c.name,
      nickname: c.nickname,
      birthday: c.birthday,
      photo: c.photo,
    })),
    todos: todoRows.map((t) => ({
      id: t.id,
      title: t.title,
      done: t.done,
      dueDate: t.dueDate,
      remindAt: t.remindAt,
      priority: t.priority,
      myDayDate: t.myDayDate,
      steps: steps.filter((s) => s.todoId === t.id),
    })),
    notices: noticeRows.map((n) => ({ id: n.id, content: n.content, createdAt: n.createdAt })),
    notes: noteRows.map((n) => ({
      id: n.id,
      content: n.content,
      status: n.status,
      photos: parseJson<string[]>(n.photos, []),
      result: parseJson<Record<string, unknown>>(n.result, {}),
      createdAt: n.createdAt,
    })),
    activity: {
      days: Object.entries(days)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
    },
  });
}
