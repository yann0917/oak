import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { recipeSyncState, recipes } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { getSyncProgress, isSyncing, repoOf, syncRecipes } from "@/lib/recipes/sync";
import { RECIPE_SOURCES, SOURCE_LABELS } from "@/lib/recipes/sources";

// 各源同步状态（手动同步按钮/设置页展示）
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:recipes:sync-get");
  if (denied) return denied;

  const states = db.select().from(recipeSyncState).all();
  const counts = db
    .select({ source: recipes.source, count: sql<number>`count(*)` })
    .from(recipes)
    .groupBy(recipes.source)
    .all();
  const countMap = new Map(counts.map((c) => [c.source, c.count]));
  const progress = getSyncProgress();
  const sources = RECIPE_SOURCES.map((s) => {
    const st = states.find((x) => x.source === s.key);
    return {
      source: s.key,
      label: SOURCE_LABELS[s.key] ?? s.key,
      repo: repoOf(s),
      count: countMap.get(s.key) ?? 0,
      lastCommit: st?.lastCommit ?? "",
      lastSyncedAt: st?.lastSyncedAt ?? "",
      lastStatus: st?.lastStatus ?? "",
      lastError: st?.lastError ?? "",
    };
  });
  return NextResponse.json({ total: counts.reduce((sum, c) => sum + c.count, 0), syncing: progress.syncing, current: progress.current, sources });
}

// 手动立即同步：改为后台任务，立即返回，前端轮询 GET 看进度（110MB 级下载不该挂住 HTTP 请求）
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:recipes:sync-post");
  if (denied) return denied;

  if (isSyncing()) return NextResponse.json({ started: false, syncing: true });
  // 失败已逐源记录到 recipe_sync_state（状态接口可见），这里无需处理
  void syncRecipes({ force: true }).catch(() => {});
  return NextResponse.json({ started: true, syncing: true });
}
