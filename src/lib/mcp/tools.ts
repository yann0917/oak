import { buildAgentTools } from "@/lib/ai-agent/tools";

/** MCP 工具的最小内部形态（stdio 与 HTTP 两个 transport 共用，注册时再适配 SDK 类型） */
export interface OakMcpTool {
  name: string;
  description: string;
  inputSchema: unknown;
  execute: (args: unknown) => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>;
}

/**
 * 把 AI 助手的只读工具集映射为 MCP 工具：
 * - 不传 searchApiKey → webSearch/webExtract 天然不注册（对外暴露有烧钱/SSRF 风险）；
 * - 工具面与 AI 助手一致（18 个只读查询工具，全部强制按调用用户 user_id 隔离）；
 * - 结果序列化为文本；异常返回 isError（不中断会话）。
 */
export function buildMcpTools(uid: number): OakMcpTool[] {
  const { tools } = buildAgentTools(uid);
  return Object.entries(tools).map(([name, aiTool]: [string, any]) => {
    const execute = aiTool.execute;
    return {
      name,
      description: aiTool.description || "",
      inputSchema: aiTool.inputSchema,
      execute: async (args: unknown) => {
        try {
          const result = execute ? await execute((args ?? {}) as never) : {};
          return { content: [{ type: "text", text: JSON.stringify(result ?? null) }] };
        } catch (err) {
          return {
            content: [{ type: "text", text: `工具执行失败：${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      },
    };
  });
}
