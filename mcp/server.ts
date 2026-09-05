/**
 * Oak MCP 服务（stdio transport，独立进程）——给本地 agent（Claude Code / Cursor 等）零配置接入。
 * 启动：OAK_TOKEN=<令牌> npx tsx mcp/server.ts（令牌在 Web 端「设置 → MCP 接入」生成）
 * 工具面：与 AI 助手一致的 18 个只读查询工具，按令牌归属用户在库中隔离；不含联网搜索。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { verifyMcpToken } from "../src/lib/mcp/tokens";
import { buildMcpTools } from "../src/lib/mcp/tools";

async function main() {
  const token = process.env.OAK_TOKEN || "";
  if (!token) {
    console.error("[oak-mcp] 缺少环境变量 OAK_TOKEN：请在 Web 端「设置 → MCP 接入」生成令牌");
    process.exit(1);
  }
  const auth = verifyMcpToken(token);
  if (!auth) {
    console.error("[oak-mcp] OAK_TOKEN 无效、已撤销或已过期：请在设置页重新生成");
    process.exit(1);
  }

  const server = new McpServer({ name: "oak", version: "0.1.0" });
  const tools = buildMcpTools(auth.uid);
  for (const t of tools) {
    (server.registerTool as any)(
      t.name,
      { description: t.description || "", inputSchema: t.inputSchema },
      async (args: unknown) => t.execute(args ?? {})
    );
  }

  await server.connect(new StdioServerTransport());
  console.error(`[oak-mcp] 已就绪：${tools.length} 个只读工具（uid=${auth.uid}）`);
}

main().catch((err) => {
  console.error("[oak-mcp] 启动失败:", err);
  process.exit(1);
});
