import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { presetByKey } from "@/lib/ai/presets";

export interface AgentSetup {
  provider: OpenAIProvider;
  model: ReturnType<OpenAIProvider["chat"]>;
  /** responses = Responses API（原生工具/Agent 友好）；chat = chat/completions */
  mode: "responses" | "chat";
  providerKey: string;
  searchApiKey: string;
}

/**
 * 从「当前生效的模型配置」构造 AI 助手的 provider/模型：
 * - responses：provider(model)，走 Responses API（DeepSeek V4/Kimi/千问/OpenAI 官方支持）
 * - chat：provider.chat(model)，走 chat/completions（仅兼容该协议的服务商）
 * 未配置或未启用返回 null，由调用方给出中文提示。
 */
export function getAgentSetup(userId: number): AgentSetup | null {
  const cfg = getAiRuntimeConfig(userId);
  if (!cfg.enabled || !cfg.provider?.baseUrl || !cfg.provider.model) return null;
  const p = cfg.provider;

  const presetMode = presetByKey(p.provider)?.apiMode ?? "chat";
  const mode: "responses" | "chat" =
    p.apiMode === "responses" || p.apiMode === "chat" ? p.apiMode : presetMode;

  const provider = createOpenAI({
    baseURL: p.baseUrl.replace(/\/+$/, ""),
    apiKey: p.apiKey || "not-set", // Ollama 等本地服务允许空 key
  });
  console.log(`[ai-agent] provider=${p.provider} mode=${mode} model=${p.model}`);

  return {
    provider,
    model: mode === "responses" ? provider(p.model) : provider.chat(p.model),
    mode,
    providerKey: p.provider,
    searchApiKey: cfg.searchApiKey,
  };
}

/** 仅拿模型（兼容小调用方） */
export function getAgentModel(userId: number) {
  return getAgentSetup(userId)?.model ?? null;
}
