import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { recipeSyncState, recipes } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { RECIPES_REPO, isSyncing, syncRecipes } from "@/lib/recipes/sync";

// 同步状态（设置页/手动同步按钮展示）
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:recipes:sync-get");
  if (denied) return denied;

  const state = db.select().from(recipeSyncState).where(eq(recipeSyncState.id, 1)).get();
  const [{ count }] = db.select({ count: sql<number>`count(*)` }).from(recipes).all();
  return NextResponse.json({
    repo: RECIPES_REPO,
    count,
    syncing: isSyncing(),
    lastCommit: state?.lastCommit ?? "",
    lastSyncedAt: state?.lastSyncedAt ?? "",
    lastStatus: state?.lastStatus ?? "",
    lastError: state?.lastError ?? "",
  });
}

// 手动立即同步（强制全量拉取，忽略 commit 短路）
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:recipes:sync-post");
  if (denied) return denied;

  try {
    const summary = await syncRecipes({ force: true });
    return NextResponse.json(summary);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "同步失败" }, { status: 500 });
  }
}
