import OpenAI from "openai";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";

/**
 * OpenAI 兼容客户端（官方 openai SDK）：{base_url}/chat/completions。
 * DeepSeek/通义/Kimi/智谱/Ollama 等 OpenAI 兼容服务均通过 base_url + model 适配。
 * 仅服务端使用（API 路由），不涉及浏览器端。
 */

/** 多模态消息内容：纯文本或 text+image 块数组（DeepSeek 等视觉模型的 OpenAI 兼容格式） */
export type ChatContentItem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentItem[];
}

export interface ChatOptions {
  messages: ChatMessage[];
  /** 要求模型返回纯 JSON（response_format=json_object，模型不支持时自动降级重试） */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** 中断上游请求（客户端断开/用户点击停止时传入 req.signal） */
  signal?: AbortSignal;
}

/** 调用所需的配置输入（来自 ai_settings 表或设置页表单） */
export interface AiConfigInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 服务商 key（deepseek 等），用于厂商特定参数，如关闭思考模式 */
  provider?: string;
}

export class AiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** 按 base_url+api_key 缓存实例，避免每次调用重复创建连接配置 */
const clientCache = new Map<string, OpenAI>();

function getClient(cfg: AiConfigInput, timeoutMs: number): OpenAI {
  const base = (cfg.baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) throw new AiError("未配置接口地址 base_url");
  if (!(cfg.model || "").trim()) throw new AiError("未配置模型名称");
  const key = `${base}|${cfg.apiKey}`;
  let client = clientCache.get(key);
  if (!client) {
    client = new OpenAI({
      baseURL: base,
      // Ollama 等本地服务不校验密钥，但 SDK 要求非空字符串
      apiKey: cfg.apiKey || "not-set",
      timeout: timeoutMs,
      maxRetries: 0,
    });
    clientCache.set(key, client);
  }
  return client;
}

/** 把 SDK 抛出的各种错误统一成中文 AiError（带 HTTP status，供界面展示与降级判断） */
function toAiError(e: any): AiError {
  if (e instanceof AiError) return e;
  const status = typeof e?.status === "number" ? e.status : undefined;
  const raw = typeof e?.message === "string" ? e.message : String(e ?? "请求失败");
  return new AiError(status ? `接口错误 ${status}：${raw}` : `请求失败：${raw}`, status);
}

/** 用量埋点：按天+模型聚合写入 ai_usage，失败静默（绝不影响主调用） */
function recordUsage(model: string, patch: { prompt?: number; completion?: number; error?: boolean }) {
  try {
    const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
    const now = new Date().toISOString();
    const p = Math.max(0, Math.floor(patch.prompt ?? 0));
    const c = Math.max(0, Math.floor(patch.completion ?? 0));
    const err = patch.error ? 1 : 0;
    db.insert(aiUsage)
      .values({ date, model, calls: 1, promptTokens: p, completionTokens: c, errors: err, updatedAt: now })
      .onConflictDoUpdate({
        target: [aiUsage.date, aiUsage.model],
        set: {
          calls: sql`${aiUsage.calls} + 1`,
          promptTokens: sql`${aiUsage.promptTokens} + ${p}`,
          completionTokens: sql`${aiUsage.completionTokens} + ${c}`,
          errors: sql`${aiUsage.errors} + ${err}`,
          updatedAt: now,
        },
      })
      .run();
  } catch {
    /* 埋点失败不影响主流程 */
  }
}

/**
 * 构造请求变体序列，前面的失败（4xx）自动退到变体重试：
 *  - deepseek（v4+ 默认开启思考模式）：先传 thinking={type:disabled} 关思考，节省 token 与延迟；
 *  - json 模式：每个变体先带 response_format，模型不支持时再去掉重试。
 */
function requestVariants(cfg: AiConfigInput, opts: ChatOptions, timeoutMs: number): Array<Record<string, any>> {
  const extras: Array<Record<string, any>> = [];
  if (cfg.provider === "deepseek") extras.push({ thinking: { type: "disabled" } });
  extras.push({});
  if (!opts.json) return extras;
  // json 模式下每个变体都拆成「带 response_format」+「不带」两次尝试
  return extras.flatMap((x) => [x, x]);
}

export async function chatCompletion(cfg: AiConfigInput, opts: ChatOptions): Promise<string> {
  const model = (cfg.model || "").trim();
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const client = getClient(cfg, timeoutMs);

  const variants = requestVariants(cfg, opts, timeoutMs);
  let res: any = null;
  let lastError: any = null;

  for (let i = 0; i < variants.length; i++) {
    // json 模式下 i%2==0 时带 response_format
    const useJson = !!opts.json && i % 2 === 0;
    try {
      res = await client.chat.completions.create(
        {
          model,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 4096,
          ...(useJson ? { response_format: { type: "json_object" as const } } : {}),
          // thinking 等厂商扩展字段不在 SDK 类型里，按变体透传
          ...(variants[i] as any),
        } as any,
        { timeout: timeoutMs, signal: opts.signal }
      );
      break;
    } catch (e: any) {
      lastError = e;
      // 只有 4xx（参数不受支持等）才降级重试；网络/5xx 直接抛
      if (!(typeof e?.status === "number" && e.status >= 400 && e.status < 500)) {
        recordUsage(model, { error: true });
        throw toAiError(e);
      }
    }
  }
  if (!res) {
    recordUsage(model, { error: true });
    throw toAiError(lastError);
  }

  const msg = res?.choices?.[0]?.message;
  const content = msg?.content;
  if (typeof content !== "string" || !content.trim()) {
    recordUsage(model, { error: true });
    const finish = res?.choices?.[0]?.finish_reason;
    if (finish === "length") throw new AiError("输出被截断：max_tokens 太小，请调大后再试");
    const reasoning = typeof msg?.reasoning_content === "string" ? msg.reasoning_content.trim() : "";
    if (reasoning) throw new AiError("模型未输出内容（思考/推理被截断，请调大 max_tokens）");
    throw new AiError("模型未返回内容");
  }
  recordUsage(model, {
    prompt: res?.usage?.prompt_tokens,
    completion: res?.usage?.completion_tokens,
  });
  return content.trim();
}

/**
 * 流式补全：逐段产出文本增量（OpenAI 兼容 stream:true），供笔记编辑器 AI 续写等场景。
 * 4xx 仍按变体降级重试；流中断/异常直接抛错（不重试，避免重复插入）。
 * 用量埋点：只计调用次数（流式 usage 各厂商支持不一，不采集 token）。
 */
export async function* streamChatCompletion(cfg: AiConfigInput, opts: ChatOptions): AsyncGenerator<string> {
  const model = (cfg.model || "").trim();
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const client = getClient(cfg, timeoutMs);
  const variants = requestVariants(cfg, opts, timeoutMs);
  let lastError: any = null;

  for (let i = 0; i < variants.length; i++) {
    let stream: AsyncIterable<any>;
    try {
      stream = (await client.chat.completions.create(
        {
          model,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.4,
          max_tokens: opts.maxTokens ?? 4096,
          stream: true,
          ...(variants[i] as any),
        } as any,
        { timeout: timeoutMs, signal: opts.signal }
      )) as unknown as AsyncIterable<any>;
    } catch (e: any) {
      lastError = e;
      if (typeof e?.status === "number" && e.status >= 400 && e.status < 500) continue;
      recordUsage(model, { error: true });
      throw toAiError(e);
    }
    try {
      for await (const part of stream) {
        const delta = part?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      }
      recordUsage(model, {});
      return;
    } catch (e: any) {
      recordUsage(model, { error: true });
      throw toAiError(e);
    }
  }
  recordUsage(model, { error: true });
  throw toAiError(lastError);
}

/** 解析模型返回的 JSON（容忍 ```json 围栏与前后杂文本，按首个 [ 或 { 截取到对应闭括号） */
export function parseJSONContent(raw: string): any {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const starts = ["[", "{"].map((c) => text.indexOf(c)).filter((i) => i !== -1);
  if (starts.length) {
    const start = Math.min(...starts);
    const close = text[start] === "[" ? "]" : "}";
    const end = text.lastIndexOf(close);
    if (end > start) text = text.slice(start, end + 1);
  }
  return JSON.parse(text);
}

export async function chatJSON<T = any>(cfg: AiConfigInput, opts: ChatOptions): Promise<T> {
  const raw = await chatCompletion(cfg, { ...opts, json: true });
  return parseJSONContent(raw) as T;
}
