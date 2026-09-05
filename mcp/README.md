# Oak MCP（只读工具接入）

其他 agent（Claude Code / Cursor 等）通过 MCP 接入 Oak，调用与 Web 端 AI 助手一致的 **18 个只读查询工具**（成员/教师/成长/健康/账单/学习/时光/提醒/待办/笔记/园地/掌握度/卡证/政策/快记/洞察/跨模块搜索/记忆检索 searchKnowledge）。所有工具按令牌归属账号在库中隔离；**不含联网搜索与网页抓取**（避免烧钱/SSRF）。

## 先决条件

1. 在 Web 端登录后进入 **设置 → MCP 接入**，生成一个令牌（JWT + 数据库 sha256 双校验，可随时撤销）。
2. 本地接入需能运行仓库（`npx tsx mcp/server.ts`）；远程接入只需服务端已部署 `/api/mcp` 路由。

## 方式一：stdio（本地，推荐）

在 oak 仓库目录运行：

```bash
OAK_TOKEN=<令牌> npx tsx mcp/server.ts
```

agent 配置示例（如 Claude Code 的 `.mcp.json`，command 目录需设为仓库根）：

```json
{
  "mcpServers": {
    "oak": {
      "command": "npx",
      "args": ["tsx", "mcp/server.ts"],
      "env": { "OAK_TOKEN": "<令牌>" }
    }
  }
}
```

## 方式二：Streamable HTTP（远程/部署版）

端点：`<你的部署地址>/api/mcp`，每请求带 `Authorization: Bearer <令牌>`。

```bash
curl -X POST <部署地址>/api/mcp \
  -H "Authorization: Bearer <令牌>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

会话由一个 transport 实例管理（按 `mcp-session-id` 分派）；服务重启后客户端重新初始化即可。

## 工具与安全

- 工具面：与 Web 端 AI 助手完全一致（`src/lib/ai-agent/tools.ts` 的 `buildAgentTools`），只读、按 `user_id` 过滤。
- 输出：工具结果以 JSON 文本返回；执行失败返回 `isError`，不中断会话。
- 令牌：设置页撤销后立即失效（每请求校验数据库状态）；请勿提交进 Git。
- 数据说明：这些工具返回的是家庭敏感数据（证件号/健康/账单等），请仅在信任的本地 agent 环境使用。
