import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { db } from "@/db";
import { aiSettings, ragMeta } from "@/db/schema";
import { RERANK_DEFAULT_MODEL } from "@/lib/ai/presets";
import { embedTexts, getEmbeddingSetup } from "./embeddings";
import { buildCorpus } from "./corpus";
import { splitChunks } from "./chunk";
import { ensureImageCaptions } from "./images";

/**
 * RAG 记忆存储与检索：
 * - syncRag：全量/增量同步（按 content_hash diff，只嵌入新增/变更），事务内同步维护 FTS5；
 * - ensureSyncLazy：聊天请求前置的 60s 节流后台同步，绝不阻塞对话；
 * - retrieveRag：向量（全量余弦）+ BM25（2-gram）双通道，RRF 融合取 top-k。
 * 所有读写按 user_id 隔离；索引异常只记状态，不影响 AI 助手其他能力。
 */

const sqlite = db.$client;

/** 请求节流：每用户每 60s 最多触发一次后台同步检查 */
const SYNC_TTL_MS = 60_000;
const syncing = new Map<number, Promise<void>>();
const lastCheckAt = new Map<number, number>();

// ===== 中文 2-gram 预处理（FTS5 unicode61 分词器不支持中文词边界，应用层展开） =====

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/** 文本 → 检索 token：连续 CJK 序列展开为相邻 2-gram（单字保留），英文/数字词保留（小写） */
export function toBiTokens(text: string): string[] {
  const tokens = new Set<string>();
  let cjkBuf = "";
  const flushCjk = () => {
    if (cjkBuf.length >= 2) {
      for (let i = 0; i + 2 <= cjkBuf.length; i++) tokens.add(cjkBuf.slice(i, i + 2));
    } else if (cjkBuf.length === 1) {
      tokens.add(cjkBuf);
    }
    cjkBuf = "";
  };
  for (const ch of text) {
    if (CJK.test(ch)) cjkBuf += ch;
    else flushCjk();
  }
  flushCjk();
  for (const m of text.matchAll(/[A-Za-z0-9_]{2,}/g)) tokens.add(m[0].toLowerCase());
  return [...tokens];
}

/** FTS 索引内容：2-gram 空格串（unicode61 按空白切 token）；text 列存原文备英文/数字检索 */
function toBiText(text: string): string {
  return toBiTokens(text).join(" ");
}

/** BM25 查询：token 引号包裹 OR 连接（最多 24 个）；FTS5 裸词默认 AND 会过于严格 */
function toBiQuery(query: string): string | null {
  const tokens = toBiTokens(query).slice(0, 24);
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");
}

// ===== 向量工具 =====

function toFloat32(buf: Buffer): Float32Array {
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return new Float32Array(ab);
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ===== 同步状态 =====

export interface RagStatus {
  configured: boolean;
  status: string; // unconfigured|syncing|ok|error
  chunkCount: number;
  embeddingDim: number;
  lastSyncAt: string;
  lastError: string;
  embeddingProviderId: number | null;
  embeddingModel: string;
  rerankEnabled: boolean;
  rerankModel: string;
  embeddingHint: string; // 未配置/不支持时的提示
}

function setMeta(userId: number, patch: Partial<{ status: string; chunkCount: number; embeddingDim: number; lastSyncAt: string; lastError: string }>) {
  const now = new Date().toISOString();
  const existing = db.select({ id: ragMeta.id }).from(ragMeta).where(eq(ragMeta.userId, userId)).get();
  if (existing) {
    db.update(ragMeta).set({ ...patch, updatedAt: now }).where(eq(ragMeta.userId, userId)).run();
  } else {
    db.insert(ragMeta).values({ userId, ...patch, updatedAt: now }).run();
  }
}

export function getRagStatus(userId: number): RagStatus {
  const s = db
    .select({
      embeddingProviderId: aiSettings.embeddingProviderId,
      embeddingModel: aiSettings.embeddingModel,
      rerankEnabled: aiSettings.rerankEnabled,
      rerankModel: aiSettings.rerankModel,
    })
    .from(aiSettings)
    .where(eq(aiSettings.userId, userId))
    .get();
  const meta = db.select().from(ragMeta).where(eq(ragMeta.userId, userId)).get();
  const setup = getEmbeddingSetup(userId);
  return {
    configured: setup.ok,
    status: setup.ok ? (meta?.status ?? "unconfigured") : "unconfigured",
    chunkCount: meta?.chunkCount ?? 0,
    embeddingDim: meta?.embeddingDim ?? 0,
    lastSyncAt: meta?.lastSyncAt ?? "",
    lastError: setup.ok ? (meta?.lastError ?? "") : setup.message,
    embeddingProviderId: s?.embeddingProviderId ?? null,
    embeddingModel: s?.embeddingModel ?? "",
    rerankEnabled: !!s?.rerankEnabled,
    rerankModel: s?.rerankModel || RERANK_DEFAULT_MODEL,
    embeddingHint: setup.ok ? "" : setup.message,
  };
}

// ===== 同步 =====

interface DesiredChunk {
  docKey: string;
  seq: number;
  childId: number | null;
  content: string;
  hash: string;
  metadata: string;
}

function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

/** 全量/增量同步：corpus → diff → 仅嵌入新增/变更 → 事务写 chunk + FTS → 更新状态 */
export function syncRag(userId: number): Promise<void> {
  const running = syncing.get(userId);
  if (running) return running;
  const task = doSync(userId).catch((err) => {
    console.error("[rag] sync 失败:", err);
    try {
      setMeta(userId, { status: "error", lastError: err instanceof Error ? err.message : String(err) });
    } catch {
      /* meta 写入失败不再抛 */
    }
  });
  syncing.set(userId, task);
  void task.finally(() => syncing.delete(userId));
  return task;
}

async function doSync(userId: number): Promise<void> {
  const setup = getEmbeddingSetup(userId);
  if (!setup.ok) {
    setMeta(userId, { status: "unconfigured", lastError: setup.message });
    return;
  }

  // 照片描述：附件图片经视觉模型生成语义描述（单张失败跳过，不阻塞索引）
  try {
    await ensureImageCaptions(userId);
  } catch (err) {
    console.error("[rag] 照片描述生成失败:", err);
  }

  setMeta(userId, { status: "syncing" });
  const started = new Date().toISOString();

  // 1. 语料 → 期望块
  const docs = buildCorpus(userId);
  const desired: DesiredChunk[] = [];
  for (const doc of docs) {
    const chunks = splitChunks(doc.text);
    chunks.forEach((content, seq) => {
      desired.push({
        docKey: doc.docKey,
        seq,
        childId: doc.childId,
        content,
        hash: sha1(content),
        metadata: JSON.stringify({ module: doc.module, title: doc.title, date: doc.date }),
      });
    });
  }

  // 2. diff 现有块
  const existing = sqlite
    .prepare("SELECT id, doc_key, seq, content_hash FROM rag_chunks WHERE user_id = ?")
    .all(userId) as { id: number; doc_key: string; seq: number; content_hash: string }[];
  const byKey = new Map(existing.map((e) => [`${e.doc_key}#${e.seq}`, e]));
  const metaRow = sqlite.prepare("SELECT embedding_dim FROM rag_meta WHERE user_id = ?").get(userId) as { embedding_dim: number } | undefined;

  const toWrite: (DesiredChunk & { id: number | null })[] = [];
  for (const d of desired) {
    const key = `${d.docKey}#${d.seq}`;
    const ex = byKey.get(key);
    if (!ex || ex.content_hash !== d.hash) toWrite.push({ ...d, id: ex?.id ?? null });
    byKey.delete(key);
  }
  const toDeleteIds = [...byKey.values()].map((e) => e.id);

  // 3. 嵌入新增/变更（先算再写；向量维度变化 → 全量重建）
  let dim = 0;
  let vectors: number[][] = [];
  if (toWrite.length) {
    vectors = await embedTexts(setup, toWrite.map((w) => w.content));
    dim = vectors[0]?.length ?? 0;
    const oldDim = metaRow?.embedding_dim ?? 0;
    if (oldDim > 0 && dim > 0 && oldDim !== dim) {
      console.warn(`[rag] embedding 维度变化 ${oldDim} → ${dim}，全量重建用户 ${userId} 索引`);
      sqlite.prepare("DELETE FROM rag_fts WHERE rowid IN (SELECT id FROM rag_chunks WHERE user_id = ?)").run(userId);
      sqlite.prepare("DELETE FROM rag_chunks WHERE user_id = ?").run(userId);
      toWrite.forEach((w) => (w.id = null));
    }
  }

  // 4. 事务：写 chunk + FTS（增/改/删同事务，保持两表一致）
  const insertChunk = sqlite.prepare(
    "INSERT INTO rag_chunks (user_id, child_id, doc_key, seq, content_hash, content, metadata, embedding, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const updateChunk = sqlite.prepare(
    "UPDATE rag_chunks SET child_id = ?, content_hash = ?, content = ?, metadata = ?, embedding = ?, updated_at = ? WHERE id = ?"
  );
  const deleteChunk = sqlite.prepare("DELETE FROM rag_chunks WHERE id = ?");
  const ftsInsert = sqlite.prepare("INSERT INTO rag_fts(rowid, text, text_bi) VALUES (?, ?, ?)");
  const ftsDelete = sqlite.prepare("DELETE FROM rag_fts WHERE rowid = ?");
  const upsertFts = (id: number, content: string) => {
    ftsDelete.run(id);
    ftsInsert.run(id, content, toBiText(content));
  };

  const tx = sqlite.transaction(() => {
    toWrite.forEach((w, i) => {
      const buf = Buffer.from(new Float32Array(vectors[i]).buffer);
      if (w.id != null) {
        updateChunk.run(w.childId, w.hash, w.content, w.metadata, buf, started, w.id);
      } else {
        const res = insertChunk.run(userId, w.childId, w.docKey, w.seq, w.hash, w.content, w.metadata, buf, started);
        w.id = Number(res.lastInsertRowid);
      }
      upsertFts(w.id!, w.content);
    });
    for (const id of toDeleteIds) {
      ftsDelete.run(id);
      deleteChunk.run(id);
    }
  });
  tx();

  const count = sqlite.prepare("SELECT COUNT(*) AS c FROM rag_chunks WHERE user_id = ?").get(userId) as { c: number };
  setMeta(userId, { status: "ok", chunkCount: count.c, embeddingDim: dim || metaRow?.embedding_dim || 0, lastSyncAt: started, lastError: "" });
}

/** 聊天请求前置：60s 节流的后台同步（fire-and-forget，不阻塞调用方） */
export function ensureSyncLazy(userId: number): void {
  const now = Date.now();
  if (now - (lastCheckAt.get(userId) ?? 0) < SYNC_TTL_MS) return;
  lastCheckAt.set(userId, now);
  void syncRag(userId);
}

// ===== 检索 =====

export interface RagHit {
  id: number;
  childId: number | null;
  docKey: string;
  seq: number;
  content: string;
  module: string;
  title: string;
  date: string;
}

const VECTOR_TOP = 20;
const BM25_TOP = 20;
const RRF_K = 60;
const SAME_DOC_MAX = 2;
/** 向量通道最低相似度：低于此值的片段视为不相关，不参与融合（避免注入噪声） */
const VECTOR_MIN_SIM = 0.45;
/** RRF 融合后送精排的条数（qwen3-rerank 单次 ≤500 条，此处取前 20 足够） */
const RERANK_TOP = 20;

/** 重排配置：开关 + 复用 embedding 服务商的 baseUrl/apiKey + 模型名（支持 /reranks 端点） */
function getRerankConfig(userId: number): { baseUrl: string; apiKey: string; model: string } | null {
  const s = db
    .select({ rerankEnabled: aiSettings.rerankEnabled, rerankModel: aiSettings.rerankModel })
    .from(aiSettings)
    .where(eq(aiSettings.userId, userId))
    .get();
  if (!s?.rerankEnabled) return null;
  const setup = getEmbeddingSetup(userId);
  if (!setup.ok) return null;
  return { baseUrl: setup.baseUrl, apiKey: setup.apiKey, model: (s.rerankModel || RERANK_DEFAULT_MODEL).trim() };
}

/** OpenAI 兼容 /reranks（qwen3-rerank）：query + documents → 相关性排序 */
async function rerankByModel(cfg: { baseUrl: string; apiKey: string; model: string }, query: string, docs: Decoded[]): Promise<Decoded[]> {
  const url = cfg.baseUrl.replace(/\/+$/, "") + "/reranks";
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, query, documents: docs.map((d) => d.content), top_n: docs.length }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`rerank HTTP ${res.status}`);
  const data = (await res.json()) as { results?: { index: number; relevance_score?: number }[] };
  const items = (data.results ?? [])
    .filter((r) => Number.isInteger(r.index) && r.index >= 0 && r.index < docs.length)
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
  return items.map((r) => docs[r.index]).filter((d): d is Decoded => !!d);
}

interface Decoded extends RagHit {
  vectors: Float32Array | null;
}

/**
 * 混合检索：向量（余弦 top-VECTOR_TOP）+ BM25（top-BM25_TOP）→ RRF 融合 → top-k。
 * 向量（embedding 外呼）失败时降级为纯 BM25；双通道都不可用返回空。
 */
export async function retrieveRag(
  userId: number,
  query: string,
  opts: { limit?: number; childId?: number } = {}
): Promise<RagHit[]> {
  const limit = Math.max(1, Math.min(24, opts.limit ?? 8));
  const q = query.trim();
  if (!q) return [];

  const rows = sqlite
    .prepare("SELECT id, child_id, doc_key, seq, content, metadata, embedding FROM rag_chunks WHERE user_id = ?")
    .all(userId) as {
    id: number;
    child_id: number | null;
    doc_key: string;
    seq: number;
    content: string;
    metadata: string;
    embedding: Buffer | null;
  }[];

  const decoded: Decoded[] = rows.map((r) => {
    const meta = JSON.parse(r.metadata || "{}") as { module?: string; title?: string; date?: string };
    return {
      id: r.id,
      childId: r.child_id,
      docKey: r.doc_key,
      seq: r.seq,
      content: r.content,
      module: meta.module || "",
      title: meta.title || "",
      date: meta.date || "",
      vectors: r.embedding && r.embedding.length >= 4 ? toFloat32(r.embedding) : null,
    };
  });

  const rrf = new Map<number, number>();
  const addRanked = (results: Decoded[]) => {
    results.forEach((h, i) => {
      rrf.set(h.id, (rrf.get(h.id) ?? 0) + 1 / (RRF_K + i + 1));
    });
  };

  // 通道 1：向量（同一查询向量对所有块点积；低相似度片段不参与融合）
  try {
    const setup = getEmbeddingSetup(userId);
    if (setup.ok) {
      const [vec] = await embedTexts(setup, [q]);
      if (vec) {
        addRanked(
          decoded
            .filter((d) => d.vectors && dot(vec, d.vectors!) >= VECTOR_MIN_SIM)
            .map((d) => ({ d, s: dot(vec, d.vectors!) }))
            .sort((a, b) => b.s - a.s)
            .slice(0, VECTOR_TOP)
            .map(({ d }) => d)
        );
      }
    }
  } catch (err) {
    console.error("[rag] 向量检索失败，降级为 BM25:", err);
  }

  // 通道 2：BM25（2-gram）
  const bq = toBiQuery(q);
  if (bq) {
    try {
      const hits = sqlite
        .prepare(
          `SELECT rag_fts.rowid AS id
           FROM rag_fts JOIN rag_chunks ON rag_chunks.id = rag_fts.rowid
           WHERE rag_fts MATCH ? AND rag_chunks.user_id = ?
           ORDER BY bm25(rag_fts) LIMIT ?`
        )
        .all(bq, userId, BM25_TOP) as { id: number }[];
      const byId = new Map(decoded.map((d) => [d.id, d]));
      addRanked(
        hits
          .map((h) => byId.get(h.id))
          .filter((d): d is Decoded => !!d)
      );
    } catch (err) {
      console.error("[rag] BM25 检索失败:", err);
    }
  }

  // RRF 融合排序 → 重排（可选）→ 同文档限流 → childId 过滤 → top-k
  let merged: Decoded[] = decoded
    .map((d) => ({ d, rrf: rrf.get(d.id) ?? 0 }))
    .filter((x) => x.rrf > 0)
    .sort((a, b) => b.rrf - a.rrf)
    .map((x) => x.d);

  const rerankCfg = getRerankConfig(userId);
  if (rerankCfg && merged.length) {
    try {
      merged = await rerankByModel(rerankCfg, q, merged.slice(0, RERANK_TOP));
    } catch (err) {
      // 精排不可用（网络/服务商不支持 /reranks）→ 保持 RRF 顺序
      console.error("[rag] rerank 失败，降级为 RRF 排序:", err);
    }
  }

  const docCount = new Map<string, number>();
  const out: RagHit[] = [];
  for (const d of merged) {
    if ((docCount.get(d.docKey) ?? 0) >= SAME_DOC_MAX) continue;
    docCount.set(d.docKey, (docCount.get(d.docKey) ?? 0) + 1);
    if (opts.childId != null && d.childId != null && d.childId !== opts.childId) continue;
    out.push({ id: d.id, childId: d.childId, docKey: d.docKey, seq: d.seq, content: d.content, module: d.module, title: d.title, date: d.date });
    if (out.length >= limit) break;
  }
  return out;
}

/** 注入用上下文块：来源（模块 · 日期）+ 标题 + 正文（截断） */
export function formatRagContext(hits: RagHit[]): string {
  if (!hits.length) return "";
  const lines = hits.map((h, i) => {
    const meta = [h.module, h.date].filter(Boolean).join(" · ");
    const body = h.content.length > 300 ? h.content.slice(0, 300) + "…" : h.content;
    return `${i + 1}. 「${meta}」${body}`;
  });
  return `\n\n## 相关记忆片段（家庭记录/历史对话摘录，可能过时，仅供参考）\n${lines.join("\n")}`;
}
