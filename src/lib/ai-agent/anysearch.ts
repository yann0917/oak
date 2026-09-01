/**
 * AnySearch API 客户端（仅服务端使用）：文档 https://www.anysearch.com/docs
 * POST /v1/search  统一搜索（Bearer 可选，匿名走每日免费额度）
 * POST /v1/extract 抓取并提取指定 URL 的正文
 */

const API_BASE = "https://api.anysearch.com";

function clip(v: unknown, max: number) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/** 保留条目里的标量字段（模型能直接读），字符串统一裁剪 */
function pickItem(it: unknown): Record<string, unknown> {
  if (!it || typeof it !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(it as Record<string, unknown>)) {
    if (typeof v === "string") {
      out[k] = k === "content" || k === "text" ? clip(v, 2000) : clip(v, 500);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

/** 从响应 data 里找出结果数组（字段名随服务演进，取第一个数组兜底） */
function findResultsArray(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  for (const key of ["results", "items", "search_results", "documents", "snippets"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  for (const v of Object.values(record)) {
    if (Array.isArray(v)) return v;
  }
  return [];
}

export interface AnySearchOpts {
  maxResults?: number;
  tag?: string; // 子域能力标签，如 "code.doc"、"finance.quote"
  language?: string; // 如 zh-CN
  zone?: string; // cn | intl
}

export async function anysearchSearch(apiKey: string, query: string, opts: AnySearchOpts = {}): Promise<{ results: Record<string, unknown>[] }> {
  const body: Record<string, unknown> = {
    query,
    max_results: Math.max(1, Math.min(10, opts.maxResults ?? 5)),
    ...(opts.tag ? { tag: opts.tag } : {}),
    ...(opts.language ? { language: opts.language } : {}),
    ...(opts.zone ? { zone: opts.zone } : {}),
  };
  const res = await fetch(`${API_BASE}/v1/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json: any = await res.json().catch(() => null);
  if (!json || json.code !== 0) {
    throw new Error(`AnySearch 搜索失败：${json?.message ?? `HTTP ${res.status}`}`);
  }
  return { results: findResultsArray(json.data).slice(0, 10).map(pickItem) };
}

/** 提取网页正文：参数 url 为公开可访问的网址 */
export async function anysearchExtract(apiKey: string, url: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/v1/extract`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(20_000),
  });
  const json: any = await res.json().catch(() => null);
  if (!json || json.code !== 0) {
    throw new Error(`AnySearch 提取失败：${json?.message ?? `HTTP ${res.status}`}`);
  }
  const data = (json.data ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string") out[k] = clip(v, 6000);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}
