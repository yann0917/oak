import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { recipeSyncState, recipes } from "@/db/schema";

/**
 * 食谱库同步：从 GitHub 仓库（默认《像老乡鸡那样做饭》CookLikeHOC）拉取 zip 包，
 * 顶层目录 = 分类、md 文件 = 菜名；图片集中在仓库 images/ 目录，落盘到
 * uploads/recipes/images/（复用带鉴权的 /uploads 静态服务），正文里的相对图片
 * 链接在入库前改写为本地路径。幂等：按 source_path upsert，上游删了的菜谱同步删除。
 */

// 可用环境变量覆盖：RECIPES_REPO 换仓库；RECIPES_GH_MIRROR 换镜像（默认 gh-proxy.com，设为空串走直连）
export const RECIPES_REPO = process.env.RECIPES_REPO || "Gar-b-age/CookLikeHOC";
const GH_MIRROR = (process.env.RECIPES_GH_MIRROR ?? "https://gh-proxy.com").replace(/\/+$/, "");

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const NON_CATEGORY_DIRS = new Set(["images", "docs", "docker_support"]);
const IMAGE_URL_PREFIX = "/uploads/recipes/images/";

const UA_HEADERS = { "User-Agent": "oak-recipes-sync" };

export interface SyncSummary {
  total: number;
  added: number;
  updated: number;
  removed: number;
  images: number;
  skipped?: boolean;
}

interface ZipDish {
  sourcePath: string;
  category: string;
  name: string;
  content: string;
  image: string;
}

function ghUrl(url: string): string {
  return GH_MIRROR ? `${GH_MIRROR}/${url}` : url;
}

/** 镜像优先拉取，失败回退直连（镜像站时效无保证，双通道兜底；配了镜像才回退） */
async function ghFetch(url: string, timeoutMs: number): Promise<Response> {
  if (GH_MIRROR) {
    const mirrored = ghUrl(url);
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

/** 正文里的 ../images/x.png、images/x.png 相对链接 → 本地 /uploads 路径（markdown 与 HTML img 都处理） */
function rewriteImageRefs(md: string): string {
  return md
    .replace(/\]\((?:\.\.\/)?images\/([^)]+)\)/g, `](${IMAGE_URL_PREFIX}$1)`)
    .replace(/src=["'](?:\.\.\/)?images\/([^"']+)["']/g, `src="${IMAGE_URL_PREFIX}$1"`);
}

function firstImage(content: string): string {
  return content.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1] ?? "";
}

let syncing = false;

export function isSyncing(): boolean {
  return syncing;
}

/** 手动/调度统一入口：force=false 时上游 commit 没变就跳过下载 */
export async function syncRecipes(opts: { force?: boolean } = {}): Promise<SyncSummary> {
  if (syncing) throw new Error("食谱同步正在进行中，请稍后再试");
  syncing = true;
  try {
    const summary = await runSync(opts.force === true);
    updateState({ lastStatus: "ok", lastError: "" });
    return summary;
  } catch (e: any) {
    const message = e?.message ?? String(e);
    updateState({ lastStatus: "error", lastError: message.slice(0, 500) });
    throw e;
  } finally {
    syncing = false;
  }
}

function updateState(patch: { lastStatus: string; lastError: string }): void {
  const now = new Date().toISOString();
  db.insert(recipeSyncState)
    .values({ id: 1, ...patch, updatedAt: now })
    .onConflictDoUpdate({ target: recipeSyncState.id, set: { ...patch, updatedAt: now } })
    .run();
}

async function runSync(force: boolean): Promise<SyncSummary> {
  const now = new Date().toISOString();

  // 1. commit sha 探测（best-effort：探测失败不阻塞，直接走全量拉取）
  let headSha = "";
  try {
    const res = await ghFetch(`https://api.github.com/repos/${RECIPES_REPO}/branches/main`, 15_000);
    if (res.ok) headSha = ((await res.json()) as any)?.commit?.sha ?? "";
  } catch {
    // 网络不通/被墙时继续全量同步
  }
  const state = db.select().from(recipeSyncState).where(eq(recipeSyncState.id, 1)).get();
  if (!force && headSha && state?.lastCommit === headSha) {
    const [{ count }] = db.select({ count: sql<number>`count(*)` }).from(recipes).all();
    return { total: count, added: 0, updated: 0, removed: 0, images: 0, skipped: true };
  }

  // 2. 拉取分支 zip（只有当前工作树，不含 git 历史，约 7MB）
  const res = await ghFetch(`https://codeload.github.com/${RECIPES_REPO}/zip/refs/heads/main`, 120_000);
  if (!res.ok) throw new Error(`下载仓库 zip 失败：HTTP ${res.status}`);
  const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));

  // 3. 解析条目：顶层分类目录下的 md（排除 README）+ images/ 目录图片
  const dishes: ZipDish[] = [];
  const images = new Map<string, Buffer>();
  const referencedImages = new Set<string>();
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const parts = entry.entryName.split("/");
    parts.shift(); // 去掉 zip 根目录前缀（CookLikeHOC-main）
    const rel = parts.join("/");
    if (!rel || rel.includes("..")) continue;
    const ext = path.extname(rel).toLowerCase();
    if (parts[0] === "images" && IMAGE_EXTS.has(ext)) {
      images.set(path.basename(rel), entry.getData());
      continue;
    }
    if (!rel.endsWith(".md")) continue;
    if (parts.length !== 2 || NON_CATEGORY_DIRS.has(parts[0])) continue; // 只认顶层分类目录下的 md
    if (path.basename(rel) === "README.md") continue;
    const content = rewriteImageRefs(entry.getData().toString("utf8"));
    for (const m of content.matchAll(/\]\((?:\.\.\/)?images\/([^)]+)\)/g)) referencedImages.add(decodeURIComponent(m[1]));
    dishes.push({
      sourcePath: rel,
      category: parts[0],
      name: path.basename(rel, ".md"),
      content,
      image: firstImage(content),
    });
  }
  if (!dishes.length) throw new Error("仓库 zip 中未解析到任何菜谱，疑似上游目录结构变化");
  const missingImages = [...referencedImages].filter((n) => !images.has(n));
  if (missingImages.length) console.warn(`[recipes] ${missingImages.length} 张正文引用的图片不在仓库 images/ 目录:`, missingImages.slice(0, 5));

  // 4. 图片落盘 uploads/recipes/images/（同名覆盖，上游已删除的清掉）
  const imageDir = path.join(process.cwd(), "uploads", "recipes", "images");
  fs.mkdirSync(imageDir, { recursive: true });
  for (const [name, data] of images) fs.writeFileSync(path.join(imageDir, name), data);
  for (const old of fs.readdirSync(imageDir)) {
    if (!images.has(old)) fs.rmSync(path.join(imageDir, old), { force: true });
  }

  // 5. 菜谱入库：按 source_path upsert，上游已删除的清掉
  const existing = new Map(
    db.select({ id: recipes.id, sourcePath: recipes.sourcePath, content: recipes.content }).from(recipes).all().map((r) => [r.sourcePath, r])
  );
  const stalePaths = [...existing.keys()].filter((p) => !dishes.some((d) => d.sourcePath === p));
  let added = 0;
  let updated = 0;
  db.transaction((tx) => {
    for (const dish of dishes) {
      const prev = existing.get(dish.sourcePath);
      if (!prev) added++;
      else if (prev.content !== dish.content) updated++;
      tx.insert(recipes)
        .values({ ...dish, updatedAt: now })
        .onConflictDoUpdate({
          target: recipes.sourcePath,
          set: { category: dish.category, name: dish.name, content: dish.content, image: dish.image, updatedAt: now },
        })
        .run();
    }
    if (stalePaths.length) tx.delete(recipes).where(inArray(recipes.sourcePath, stalePaths)).run();
  });

  // 6. 记录同步状态（commit sha + 时间）
  db.insert(recipeSyncState)
    .values({ id: 1, lastCommit: headSha, lastSyncedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: recipeSyncState.id,
      set: { lastCommit: headSha, lastSyncedAt: now, updatedAt: now },
    })
    .run();

  return { total: dishes.length, added, updated, removed: stalePaths.length, images: images.size };
}
