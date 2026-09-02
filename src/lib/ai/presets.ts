/**
 * 大模型预设：设置页选择预设自动填充 base_url/model，key 存 ai_settings 表。
 *
 * apiMode：AI 助手（AI SDK）使用的接口形态——
 * - responses = OpenAI Responses API（原生支持 tools/agent 流式，DeepSeek V4 官方支持）
 * - chat = Chat Completions（仅支持 OpenAI 兼容 chat/completions 的服务商）
 * 快记归类/家庭洞察沿用 openai SDK 的 /chat/completions，不受 apiMode 影响。
 */
export interface AiPreset {
  key: string;
  label: string;
  baseUrl: string;
  model: string;
  /** responses | chat；设置页还允许用户在「接口类型」里覆盖并保存 */
  apiMode: "responses" | "chat";
  desc?: string;
}

export const AI_PRESETS: AiPreset[] = [
  {
    key: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    apiMode: "responses",
    desc: "推荐；原生支持 Responses API，对 AI 助手工具调用更友好。模型名可改 deepseek-v4-pro",
  },
  {
    key: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiMode: "responses",
  },
  {
    key: "moonshot",
    label: "Kimi（月之暗面）",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k3",
    apiMode: "responses",
    desc: "原生支持 Responses API（/v1/responses），当前仅 kimi-k3 走该接口",
  },
  {
    key: "qwen",
    label: "通义千问（阿里云百炼）",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3.7-plus",
    apiMode: "responses",
    desc: "compatible-mode 原生支持 Responses API（/v1/responses）；模型可改 qwen-plus/qwen-max 等",
  },
  {
    key: "custom",
    label: "自定义",
    baseUrl: "",
    model: "",
    apiMode: "chat",
    desc: "任意接口：支持 Responses API 的填 responses，仅支持 chat/completions 的填 chat",
  },
];

export function presetByKey(key: string): AiPreset | undefined {
  return AI_PRESETS.find((p) => p.key === key);
}

export const AI_PROVIDER_KEYS = AI_PRESETS.map((p) => p.key);

// ===== RAG 记忆检索：embedding 预设（纯常量，供服务端与设置页共用） =====

/** 各服务商预设的 embedding 默认模型（为空 = 不支持或必须手动填写） */
export const EMBEDDING_DEFAULTS: Record<string, string> = {
  openai: "text-embedding-3-small",
  qwen: "text-embedding-v4",
};

/** 各服务商是否支持 OpenAI 兼容 /embeddings 接口 */
export const EMBEDDING_SUPPORTED: Record<string, boolean> = {
  deepseek: false,
  moonshot: false,
  openai: true,
  qwen: true,
  custom: true, // 任意兼容 /embeddings 的接口，模型名必须手动填
};

/** RAG 重排默认模型（qwen3-rerank：OpenAI 兼容 /compatible-mode/v1/reranks，100+ 语言含中文） */
export const RERANK_DEFAULT_MODEL = "qwen3-rerank";
