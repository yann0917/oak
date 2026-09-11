import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { exerciseSyncState, exercises } from "@/db/schema";
import { EXERCISE_SOURCES, type ExerciseSource } from "./sources";

/**
 * 健身馆同步：commit sha 探测 → 拉 zip → 解析 exercises.json + 媒体 →
 * 图片/动图落盘 data/exercises/ → 按 source_id upsert，上游删除同步删。
 * GitHub 访问默认走镜像（EXERCISES_GH_MIRROR，默认 gh-proxy.com），失败回退直连。
 *
 * 媒体放 data/ 而不是 uploads/：它是可重新拉取的库内容（1300+ 缩略图 + 动图约 90MB），
 * 不属于用户上传数据，混进 uploads/ 会被导出/备份与构建追踪一起带上；
 * data/ 不进部署制品，服务器部署后由调度器按需拉取。
 */

export function repoOf(src: ExerciseSource): string {
  return (process.env[src.envRepo] || "").trim() || src.defaultRepo;
}

/** 媒体根目录（与 data/tts 同类运行时目录） */
const MEDIA_ROOT = path.join(process.cwd(), "data", "exercises");

/** 媒体是否已在本地落盘（空目录视为没有，触发重新拉取） */
function mediaReady(): boolean {
  for (const sub of ["images", "videos"]) {
    try {
      if (fs.readdirSync(path.join(MEDIA_ROOT, sub)).length === 0) return false;
    } catch {
      return false;
    }
  }
  return true;
}

const GH_MIRROR = (process.env.EXERCISES_GH_MIRROR ?? process.env.RECIPES_GH_MIRROR ?? "https://gh-proxy.com").replace(/\/+$/, "");
// 用常见浏览器 UA：自定义 UA 容易被镜像/CDN 限速，GitHub 也要求请求必须带 UA
const UA_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

export interface SourceSyncResult {
  source: string;
  label: string;
  total: number;
  added: number;
  updated: number;
  removed: number;
  images: number;
  gifs: number;
  skipped?: boolean;
  error?: string;
}

export interface SyncSummary {
  total: number;
  sources: SourceSyncResult[];
}

let syncing = false;

export function isSyncing(): boolean {
  return syncing;
}

export async function syncExercises(opts: { force?: boolean } = {}): Promise<SyncSummary> {
  if (syncing) throw new Error("健身馆同步正在进行中，请稍后再试");
  syncing = true;
  progress.syncing = true;
  progress.current = "";
  try {
    const results = await Promise.all(
      EXERCISE_SOURCES.map(async (src): Promise<SourceSyncResult> => {
        try {
          const summary = await syncSource(src, opts.force === true);
          return { source: src.key, label: src.label, ...summary };
        } catch (e: any) {
          const message = String(e?.message ?? e).slice(0, 500);
          upsertState({ lastStatus: "error", lastError: message });
          console.error(`[exercises:${src.key}] 同步失败:`, message);
          return {
            source: src.key,
            label: src.label,
            total: 0,
            added: 0,
            updated: 0,
            removed: 0,
            images: 0,
            gifs: 0,
            error: message,
          };
        }
      })
    );
    const failed = results.filter((r) => r.error);
    if (failed.length === EXERCISE_SOURCES.length) throw new Error(failed.map((r) => `${r.label}: ${r.error}`).join("；"));
    return { total: results.reduce((sum, r) => sum + r.total, 0), sources: results };
  } finally {
    syncing = false;
    progress.syncing = false;
    progress.current = "";
  }
}

/** exercise_sync_state 单行（id=1），避免每源一张表 */
function getState() {
  return db.select().from(exerciseSyncState).where(eq(exerciseSyncState.id, 1)).get();
}

function upsertState(patch: Partial<{ lastCommit: string; lastSyncedAt: string; lastStatus: string; lastError: string }>): void {
  const now = new Date().toISOString();
  const existing = getState();
  if (!existing) {
    db.insert(exerciseSyncState).values({ id: 1, ...patch, updatedAt: now }).run();
  } else {
    db.update(exerciseSyncState).set({ ...patch, updatedAt: now }).where(eq(exerciseSyncState.id, 1)).run();
  }
}

async function syncSource(src: ExerciseSource, force: boolean): Promise<Omit<SourceSyncResult, "source" | "label">> {
  const now = new Date().toISOString();
  const repo = repoOf(src);

  progress.current = `${src.label}：探测上游版本`;
  let headSha = "";
  try {
    const res = await ghFetch(`https://api.github.com/repos/${repo}/branches/${src.branch}`, 15_000);
    if (res.ok) headSha = ((await res.json()) as any)?.commit?.sha ?? "";
  } catch {
    // 网络不通时继续全量同步
  }
  const state = getState();
  // 上游 commit 未变且媒体已在位才跳过：媒体被清空/换了目录（如从 uploads/ 迁到 data/）时重新拉
  if (!force && headSha && state?.lastCommit === headSha && mediaReady()) {
    const [row] = db.select({ count: sql<number>`count(*)` }).from(exercises).all();
    return { total: row?.count ?? 0, added: 0, updated: 0, removed: 0, images: 0, gifs: 0, skipped: true };
  }

  progress.current = `${src.label}：下载仓库包`;
  const zip = new AdmZip(await ghDownload(`https://codeload.github.com/${repo}/zip/refs/heads/${src.branch}`, src.zipTimeoutMs));

  progress.current = `${src.label}：解析入库`;
  const parsed = src.parse(zip.getEntries());
  if (parsed.missingMedia.length) {
    console.warn(`[exercises:${src.key}] ${parsed.missingMedia.length} 个媒体文件在 zip 中缺失，示例:`, parsed.missingMedia.slice(0, 5));
  }

  // 媒体落盘 data/exercises/{images,videos}/
  const mediaRoot = MEDIA_ROOT;
  fs.mkdirSync(mediaRoot, { recursive: true });
  let imageCount = 0;
  let gifCount = 0;
  for (const [key, data] of parsed.images) {
    const file = path.join(mediaRoot, key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    imageCount++;
  }
  for (const [key, data] of parsed.gifs) {
    const file = path.join(mediaRoot, key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    gifCount++;
  }
  removeStaleFiles(path.join(mediaRoot, "images"), new Set([...parsed.images.keys()].map((k) => k.slice("images/".length))));
  removeStaleFiles(path.join(mediaRoot, "videos"), new Set([...parsed.gifs.keys()].map((k) => k.slice("videos/".length))));

  progress.current = `${src.label}：写入数据库`;
  const existing = new Map(
    db
      .select({ sourceId: exercises.sourceId, updatedAt: exercises.updatedAt })
      .from(exercises)
      .all()
      .map((r) => [r.sourceId, r])
  );
  const liveIds = new Set(parsed.exercises.map((e) => e.sourceId));
  const staleIds = [...existing.keys()].filter((id) => !liveIds.has(id));
  let added = 0;
  let updated = 0;
  db.transaction((tx) => {
    for (const ex of parsed.exercises) {
      const prev = existing.get(ex.sourceId);
      if (!prev) added++;
      else updated++;
      tx.insert(exercises)
        .values({
          sourceId: ex.sourceId,
          name: ex.name,
          bodyPart: ex.bodyPart,
          equipment: ex.equipment,
          target: ex.target,
          muscleGroup: ex.muscleGroup,
          secondaryMuscles: JSON.stringify(ex.secondaryMuscles),
          steps: JSON.stringify(ex.steps),
          image: ex.image,
          gif: ex.gif,
          attribution: ex.attribution,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: exercises.sourceId,
          set: {
            name: ex.name,
            bodyPart: ex.bodyPart,
            equipment: ex.equipment,
            target: ex.target,
            muscleGroup: ex.muscleGroup,
            secondaryMuscles: JSON.stringify(ex.secondaryMuscles),
            steps: JSON.stringify(ex.steps),
            image: ex.image,
            gif: ex.gif,
            attribution: ex.attribution,
            updatedAt: now,
          },
        })
        .run();
    }
    if (staleIds.length) {
      tx.delete(exercises).where(inArray(exercises.sourceId, staleIds)).run();
    }
  });

  upsertState({ lastCommit: headSha, lastSyncedAt: now, lastStatus: "ok", lastError: "" });
  return { total: parsed.exercises.length, added, updated, removed: staleIds.length, images: imageCount, gifs: gifCount };
}

function removeStaleFiles(root: string, validKeys: Set<string>): void {
  if (!fs.existsSync(root)) return;
  const stale: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const relChild = rel ? `${rel}/${item.name}` : item.name;
      if (item.isDirectory()) walk(path.join(dir, item.name), relChild);
      else if (!validKeys.has(relChild)) stale.push(path.join(dir, item.name));
    }
  };
  walk(root, "");
  for (const f of stale) fs.rmSync(f, { force: true });
}

async function ghFetch(url: string, timeoutMs: number): Promise<Response> {
  if (GH_MIRROR) {
    const mirrored = `${GH_MIRROR}/${url}`;
    try {
      const res = await fetch(mirrored, { headers: UA_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      console.warn(`[exercises] 镜像返回 HTTP ${res.status}，回退直连：${url}`);
    } catch (e: any) {
      console.warn(`[exercises] 镜像请求失败（${e?.message ?? e}），回退直连：${url}`);
    }
  }
  return fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
}

/** 镜像与直连赛跑，谁先读完整 body 用谁 */
async function ghDownload(url: string, timeoutMs: number): Promise<Buffer> {
  const candidates = GH_MIRROR ? [`${GH_MIRROR}/${url}`, url] : [url];
  const controllers = candidates.map(() => new AbortController());
  const timer = setTimeout(() => controllers.forEach((c) => c.abort()), timeoutMs);
  try {
    const attempts = candidates.map((candidate, i) =>
      (async () => {
        const res = await fetch(candidate, { headers: UA_HEADERS, signal: controllers[i].signal });
        if (!res.ok) throw new Error(`${new URL(candidate).host} HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        return { buf, i };
      })()
    );
    try {
      const { buf, i } = await Promise.any(attempts);
      controllers.forEach((c, j) => {
        if (j !== i) c.abort();
      });
      return Buffer.from(buf);
    } catch (e) {
      const messages = (e as AggregateError)?.errors?.map((x: any) => x?.message ?? String(x)) ?? [String(e)];
      throw new Error(`所有下载通道均失败：${[...new Set(messages)].join(" / ")}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

const progress: { syncing: boolean; current: string } = { syncing: false, current: "" };

export function getSyncProgress(): { syncing: boolean; current: string } {
  return { ...progress };
}
