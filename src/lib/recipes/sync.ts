import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { recipeSyncState, recipes } from "@/db/schema";
import { RECIPE_SOURCES, type RecipeSource } from "./sources";

/**
 * 食谱库多源同步：按 RECIPE_SOURCES 注册表逐源执行「commit sha 探测 → 拉 zip → 解析 →
 * 图片落盘 uploads/<imageDir> → 按 (source, source_path) upsert、上游删除同步删」。
 * GitHub 访问默认走镜像（RECIPES_GH_MIRROR，默认 gh-proxy.com），失败自动回退直连。
 * 某个源失败不影响其他源；全部失败才抛错。
 */

export function repoOf(src: RecipeSource): string {
  return (process.env[src.envRepo] || "").trim() || src.defaultRepo;
}

const GH_MIRROR = (process.env.RECIPES_GH_MIRROR ?? "https://gh-proxy.com").replace(/\/+$/, "");
const UA_HEADERS = { "User-Agent": "oak-recipes-sync" };

export interface SourceSyncResult {
  source: string;
  label: string;
  total: number;
  added: number;
  updated: number;
  removed: number;
  images: number;
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

/** 手动/调度统一入口：各源并行执行；force=false 时上游 commit 没变的源跳过下载 */
export async function syncRecipes(opts: { force?: boolean } = {}): Promise<SyncSummary> {
  if (syncing) throw new Error("食谱同步正在进行中，请稍后再试");
  syncing = true;
  progress.syncing = true;
  progress.current = "";
  try {
    const results = await Promise.all(
      RECIPE_SOURCES.map(async (src): Promise<SourceSyncResult> => {
        try {
          const summary = await syncSource(src, opts.force === true);
          return { source: src.key, label: src.label, ...summary };
        } catch (e: any) {
          const message = String(e?.message ?? e).slice(0, 500);
          recordState(src.key, { lastStatus: "error", lastError: message });
          console.error(`[recipes:${src.key}] 同步失败:`, message);
          return { source: src.key, label: src.label, total: 0, added: 0, updated: 0, removed: 0, images: 0, error: message };
        }
      })
    );
    const failed = results.filter((r) => r.error);
    if (failed.length === RECIPE_SOURCES.length) throw new Error(failed.map((r) => `${r.label}: ${r.error}`).join("；"));
    return { total: results.reduce((sum, r) => sum + r.total, 0), sources: results };
  } finally {
    syncing = false;
    progress.syncing = false;
    progress.current = "";
  }
}

function recordState(source: string, patch: Partial<{ lastCommit: string; lastSyncedAt: string; lastStatus: string; lastError: string }>): void {
  const now = new Date().toISOString();
  db.insert(recipeSyncState)
    .values({ source, ...patch, updatedAt: now })
    .onConflictDoUpdate({ target: recipeSyncState.source, set: { ...patch, updatedAt: now } })
    .run();
}

function countBySource(source: string): number {
  const [row] = db.select({ count: sql<number>`count(*)` }).from(recipes).where(eq(recipes.source, source)).all();
  return row.count;
}

async function syncSource(src: RecipeSource, force: boolean): Promise<Omit<SourceSyncResult, "source" | "label">> {
  const now = new Date().toISOString();
  const repo = repoOf(src);

  // 1. commit sha 探测（best-effort：探测失败不阻塞，直接走全量拉取）
  progress.current = `${src.label}：探测上游版本`;
  let headSha = "";
  try {
    const res = await ghFetch(`https://api.github.com/repos/${repo}/branches/${src.branch}`, 15_000);
    if (res.ok) headSha = ((await res.json()) as any)?.commit?.sha ?? "";
  } catch {
    // 网络不通/被墙时继续全量同步
  }
  const state = db.select().from(recipeSyncState).where(eq(recipeSyncState.source, src.key)).get();
  if (!force && headSha && state?.lastCommit === headSha) {
    return { total: countBySource(src.key), added: 0, updated: 0, removed: 0, images: 0, skipped: true };
  }

  // 2. 拉取分支 zip（镜像+直连赛跑，胜者为完整正文；超时按源配置，大图仓库放宽）
  progress.current = `${src.label}：下载仓库包`;
  const zip = new AdmZip(await ghDownload(`https://codeload.github.com/${repo}/zip/refs/heads/${src.branch}`, src.zipTimeoutMs));

  // 3. 解析（源 adapter 负责分类/图片差异）
  progress.current = `${src.label}：解析入库`;
  const parsed = src.parse(zip.getEntries());
  if (!parsed.dishes.length) throw new Error("仓库 zip 中未解析到任何菜谱，疑似上游目录结构变化");
  if (parsed.missingImages.length) {
    console.warn(`[recipes:${src.key}] ${parsed.missingImages.length} 张正文引用的图片不在仓库中，示例:`, parsed.missingImages.slice(0, 5));
  }

  // 4. 图片落盘 uploads/<imageDir>（同名覆盖，上游已删除的清掉）
  const imageRoot = path.join(process.cwd(), "uploads", ...src.imageDir.split("/"));
  fs.mkdirSync(imageRoot, { recursive: true });
  for (const [key, data] of parsed.images) {
    const file = path.join(imageRoot, key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  }
  removeStaleFiles(imageRoot, new Set(parsed.images.keys()));

  // 5. 菜谱入库：按 (source, source_path) upsert，上游已删除的清掉（仅本源范围）
  const existing = new Map(
    db
      .select({ sourcePath: recipes.sourcePath, content: recipes.content })
      .from(recipes)
      .where(eq(recipes.source, src.key))
      .all()
      .map((r) => [r.sourcePath, r])
  );
  const stalePaths = [...existing.keys()].filter((p) => !parsed.dishes.some((d) => d.sourcePath === p));
  let added = 0;
  let updated = 0;
  db.transaction((tx) => {
    for (const dish of parsed.dishes) {
      const prev = existing.get(dish.sourcePath);
      if (!prev) added++;
      else if (prev.content !== dish.content) updated++;
      tx.insert(recipes)
        .values({ ...dish, source: src.key, updatedAt: now })
        .onConflictDoUpdate({
          target: [recipes.source, recipes.sourcePath],
          set: { category: dish.category, name: dish.name, content: dish.content, image: dish.image, updatedAt: now },
        })
        .run();
    }
    if (stalePaths.length) {
      tx.delete(recipes).where(and(eq(recipes.source, src.key), inArray(recipes.sourcePath, stalePaths))).run();
    }
  });

  // 6. 记录本源同步状态（commit sha + 时间）
  recordState(src.key, { lastCommit: headSha, lastSyncedAt: now, lastStatus: "ok", lastError: "" });

  return { total: parsed.dishes.length, added, updated, removed: stalePaths.length, images: parsed.images.size };
}

function removeStaleFiles(root: string, validKeys: Set<string>): void {
  const stale: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const relChild = rel ? `${rel}/${item.name}` : item.name;
      if (item.isDirectory()) walk(path.join(dir, item.name), relChild);
      else if (!validKeys.has(relChild)) stale.push(path.join(dir, item.name));
    }
  };
  if (fs.existsSync(root)) walk(root, "");
  for (const f of stale) fs.rmSync(f, { force: true });
}

/** 镜像优先拉取，失败回退直连（镜像站时效无保证，双通道兜底；配了镜像才回退） */
async function ghFetch(url: string, timeoutMs: number): Promise<Response> {
  if (GH_MIRROR) {
    const mirrored = `${GH_MIRROR}/${url}`;
    try {
      const res = await fetch(mirrored, { headers: UA_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      console.warn(`[recipes] 镜像返回 HTTP ${res.status}，回退直连：${url}`);
    } catch (e: any) {
      console.warn(`[recipes] 镜像请求失败（${e?.message ?? e}），回退直连：${url}`);
    }
  }
  return fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * 大文件下载：镜像与直连同时开跑，谁先把【完整正文】读回来用谁（Promise.any）。
 * 注意必须赛完整 body 而不是响应头——镜像可能秒回 headers 后以接近 0 B/s 滴灌，
 * 按头决胜会误选僵死通道。输家在胜负分出后中止。
 * 直连被墙的环境里直连会一直挂到超时，不影响镜像正常胜出。
 */
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

// ── 进度上报（手动同步改为后台任务后，状态接口轮询用） ────────────────────

const progress: { syncing: boolean; current: string } = { syncing: false, current: "" };

export function getSyncProgress(): { syncing: boolean; current: string } {
  return { ...progress };
}
