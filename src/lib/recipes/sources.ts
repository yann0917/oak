/**
 * 食谱数据源注册表：每个 GitHub 源一个 adapter，负责「zip 条目 → 菜谱 + 图片」的解析差异。
 * 本文件保持纯净（不 import node/adm-zip 运行时），供服务端同步器与客户端 UI（来源标签）共用。
 */

export interface RecipeSource {
  key: string; // 存 recipes.source
  label: string; // UI 展示名
  envRepo: string; // 覆盖仓库名的环境变量
  defaultRepo: string; // 默认 GitHub 仓库（owner/name）
  branch: string; // 上游默认分支
  zipTimeoutMs: number; // zip 下载超时（HowToCook 含 108MB 图片，镜像慢速也需 20 分钟级）
  imageDir: string; // 图片落盘目录（相对 data/，如 recipes/images）
  parse: (entries: ZipEntry[]) => ParsedSource;
}

export interface ZipEntry {
  entryName: string; // zip 内路径，带根目录前缀（如 "CookLikeHOC-main/炒菜/x.md"）
  isDirectory: boolean;
  getData(): Buffer;
}

export interface SourceDish {
  sourcePath: string; // 源仓库内路径（去掉 zip 根前缀），source 内唯一
  category: string;
  name: string;
  content: string; // 图片链接已改写为本地 /media/... 的 markdown
  image: string; // 首图本地路径
}

export interface ParsedSource {
  dishes: SourceDish[];
  images: Map<string, Buffer>; // key = 相对 imageDir 的落盘路径
  missingImages: string[]; // 正文引用了但 zip 里没有的本地图片（仅告警）
}

export const SOURCE_LABELS: Record<string, string> = {
  cooklikehoc: "老乡鸡",
  howtocook: "程序员指南",
};

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
/** 图片公开 URL 前缀，对应 /media/[...path] 路由，文件落在 data/recipes/（见 sync.ts 的 imageRootOf） */
const IMAGE_URL_PREFIX = "/media/recipes";

function isImage(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot !== -1 && IMAGE_EXTS.has(name.slice(dot).toLowerCase());
}

function firstImage(content: string): string {
  return content.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1] ?? "";
}

function pathBasename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function posixDirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "." : p.slice(0, i);
}

function posixJoin(...parts: string[]): string {
  const out: string[] = [];
  for (const seg of parts.join("/").split("/")) {
    if (seg === "..") out.pop();
    else if (seg !== "." && seg !== "") out.push(seg);
  }
  return out.join("/");
}

/** 通用链接改写：md 图片与 HTML img 的引用交给 resolve；返回 null 的引用原样保留（外链、md 互链等） */
function rewriteRefs(content: string, resolve: (ref: string) => string | null): string {
  const mapRef = (ref: string) => {
    const t = resolve(ref.trim());
    return t ? `](${t})` : null;
  };
  return content
    .replace(/\]\(([^)]+)\)/g, (m, ref: string) => mapRef(ref) ?? m)
    .replace(/src=["']([^"']+)["']/g, (m, ref: string) => {
      const t = resolve(ref.trim());
      return t ? `src="${t}"` : m;
    });
}

/** 外链/锚点/md 互链不参与图片解析 */
function isExternalRef(ref: string): boolean {
  return /^(https?:)?\/\//.test(ref) || ref.startsWith("/") || ref.startsWith("#") || ref.toLowerCase().endsWith(".md");
}

/** 去掉 zip 根目录前缀（"CookLikeHOC-master/xxx" → "xxx"），并拒绝路径穿越 */
function stripRoot(entryName: string): string {
  const parts = entryName.split("/");
  parts.shift();
  const rel = parts.join("/");
  return rel.includes("..") ? "" : rel;
}

/**
 * 两遍式解析：第一遍收图片集合 + 菜谱原文与各自的 resolve 闭包，
 * 第二遍（图片集合齐了）才做链接改写、缺失统计、首图抽取。
 */
function buildParsed(
  raws: { dish: SourceDish; resolve: (ref: string) => string | null }[],
  images: Map<string, Buffer>
): ParsedSource {
  const missingImages: string[] = [];
  for (const { dish, resolve } of raws) {
    dish.content = rewriteRefs(dish.content, resolve);
    dish.image = firstImage(dish.content);
    for (const m of dish.content.matchAll(/\]\(([^)]+)\)/g)) {
      const ref = m[1].trim();
      if (ref.startsWith(IMAGE_URL_PREFIX) || isExternalRef(ref)) continue;
      missingImages.push(`${dish.sourcePath} → ${ref}`);
    }
  }
  return { dishes: raws.map((r) => r.dish), images, missingImages };
}

// ── 源 1：《像老乡鸡那样做饭》顶层目录=分类，图片集中在 images/ ──────────────

const COOK_NON_CATEGORY = new Set(["images", "docs", "docker_support"]);

function parseCookLikeHOC(entries: ZipEntry[]): ParsedSource {
  const images = new Map<string, Buffer>();
  const raws: { dish: SourceDish; resolve: (ref: string) => string | null }[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const rel = stripRoot(entry.entryName);
    if (!rel) continue;
    if (rel.startsWith("images/") && isImage(rel)) {
      images.set(pathBasename(rel), entry.getData());
    } else if (rel.endsWith(".md")) {
      const parts = rel.split("/");
      if (parts.length !== 2 || COOK_NON_CATEGORY.has(parts[0])) continue; // 只认顶层分类目录下的 md
      if (parts[1] === "README.md") continue;
      raws.push({
        dish: {
          sourcePath: rel,
          category: parts[0],
          name: pathBasename(rel).slice(0, -3),
          content: entry.getData().toString("utf8"),
          image: "",
        },
        resolve: (ref) => {
          const m = ref.match(/^(?:\.\.\/)?images\/(.+)$/);
          if (!m) return null;
          return images.has(decodeURIComponent(m[1])) ? `${IMAGE_URL_PREFIX}/images/${m[1]}` : null;
        },
      });
    }
  }
  return buildParsed(raws, images);
}

// ── 源 2：《程序员做饭指南》dishes/<英文分类>/[菜名文件夹/]xx.md，图片与 md 同目录 ──

const HOWTO_CATEGORIES: Record<string, string> = {
  meat_dish: "荤菜",
  vegetable_dish: "素菜",
  staple: "主食",
  aquatic: "水产",
  breakfast: "早餐",
  drink: "饮品",
  soup: "汤",
  dessert: "甜品",
  "semi-finished": "半成品",
  condiment: "配料",
};

function parseHowToCook(entries: ZipEntry[]): ParsedSource {
  const images = new Map<string, Buffer>();
  const raws: { dish: SourceDish; resolve: (ref: string) => string | null }[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const rel = stripRoot(entry.entryName);
    if (!rel.startsWith("dishes/")) continue;
    const inDishes = rel.slice("dishes/".length);
    if (isImage(inDishes)) {
      images.set(inDishes, entry.getData());
    } else if (inDishes.endsWith(".md")) {
      const parts = inDishes.split("/");
      const category = HOWTO_CATEGORIES[parts[0]];
      if (parts.length < 2 || !category) continue; // template 等非菜谱目录
      if (pathBasename(inDishes) === "README.md") continue;
      const dishDir = posixDirname(inDishes);
      raws.push({
        dish: {
          sourcePath: inDishes,
          category,
          name: pathBasename(inDishes).slice(0, -3),
          content: entry.getData().toString("utf8"),
          image: "",
        },
        resolve: (ref) => {
          if (isExternalRef(ref)) return null;
          const key = posixJoin(dishDir, decodeURIComponent(ref));
          return images.has(key) ? `${IMAGE_URL_PREFIX}/howtocook/${key}` : null;
        },
      });
    }
  }
  return buildParsed(raws, images);
}

// ── 注册表 ────────────────────────────────────────────────────────────────

export const RECIPE_SOURCES: RecipeSource[] = [
  {
    key: "cooklikehoc",
    label: SOURCE_LABELS.cooklikehoc,
    envRepo: "RECIPES_REPO",
    defaultRepo: "Gar-b-age/CookLikeHOC",
    branch: "main",
    zipTimeoutMs: 300_000,
    imageDir: "recipes/images",
    parse: parseCookLikeHOC,
  },
  {
    key: "howtocook",
    label: SOURCE_LABELS.howtocook,
    envRepo: "RECIPES_HOWTOCOOK_REPO",
    defaultRepo: "Anduin2017/HowToCook",
    branch: "master",
    zipTimeoutMs: 1_500_000,
    imageDir: "recipes/howtocook",
    parse: parseHowToCook,
  },
];
