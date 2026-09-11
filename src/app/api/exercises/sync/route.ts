import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { exerciseSyncState, exercises } from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";
import { getSyncProgress, isSyncing, repoOf, syncExercises } from "@/lib/exercises/sync";
import { EXERCISE_SOURCES, EXERCISE_SOURCE_LABELS } from "@/lib/exercises/sources";

// 同步状态
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:exercises:sync-get");
  if (denied) return denied;

  const state = db.select().from(exerciseSyncState).limit(1).get();
  const [countRow] = db.select({ count: sql<number>`count(*)` }).from(exercises).all();
  const progress = getSyncProgress();
  const src = EXERCISE_SOURCES[0];
  return NextResponse.json({
    total: countRow?.count ?? 0,
    syncing: progress.syncing,
    current: progress.current,
    sources: [
      {
        source: src.key,
        label: EXERCISE_SOURCE_LABELS[src.key] ?? src.key,
        repo: repoOf(src),
        count: countRow?.count ?? 0,
        lastCommit: state?.lastCommit ?? "",
        lastSyncedAt: state?.lastSyncedAt ?? "",
        lastStatus: state?.lastStatus ?? "",
        lastError: state?.lastError ?? "",
      },
    ],
  });
}

// 手动立即同步：后台任务，前端轮询 GET
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:exercises:sync-post");
  if (denied) return denied;

  if (isSyncing()) return NextResponse.json({ started: false, syncing: true });
  void syncExercises({ force: true }).catch(() => {});
  return NextResponse.json({ started: true, syncing: true });
}
