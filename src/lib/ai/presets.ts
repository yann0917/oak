/**
 * 大模型预设（全部 OpenAI 兼容 /chat/completions）：
 * 设置页选择预设自动填充 base_url/model，key 存 ai_settings 表。
 */
export interface AiPreset {
  key: string;
  label: string;
  baseUrl: string;
  model: string;
  desc?: string;
}

export const AI_PRESETS: AiPreset[] = [
  { key: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", desc: "推荐；带图快记自动用视觉模型 deepseek-v4-flash-vision-exp，模型名可改 deepseek-v4-pro" },
  { key: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { key: "qwen", label: "通义千问（阿里云百炼）", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { key: "zhipu", label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { key: "moonshot", label: "Kimi（月之暗面）", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { key: "ollama", label: "Ollama（本地）", baseUrl: "http://127.0.0.1:11434/v1", model: "llama3.1", desc: "本地模型，无需密钥" },
  { key: "custom", label: "自定义", baseUrl: "", model: "", desc: "任意 OpenAI 兼容接口，填写 base_url 与模型名" },
];

export function presetByKey(key: string): AiPreset | undefined {
  return AI_PRESETS.find((p) => p.key === key);
}

export const AI_PROVIDER_KEYS = AI_PRESETS.map((p) => p.key);
