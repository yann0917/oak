# 为 agent 准备的 Oak 速览

Oak（「我记」）是自托管家庭数据管理系统（Next.js 16 + SQLite + AI SDK）。给 AI agent 用了两条路径：

1. **MCP 接入**（推荐）：见 [mcp/README.md](mcp/README.md) —— 18 个只读查询工具（成员/成长/健康/账单/学习/时光/笔记/提醒/待办/卡证/政策/快记/洞察/记忆检索），stdio 与 HTTP 双传输，令牌在 Web 端「设置 → MCP 接入」生成。
2. **文档**：数据模型在 `src/db/schema.ts`（约 40 张业务表，全部按 `user_id` 隔离）；权限为 RBAC（Casbin + `api:*` 权限点，构建时由 `scripts/gen-api-perms.mjs` 自动扫描生成）。

安全须知：MCP 工具只读、不含联网搜索；系统提示把记忆/工具返回/网页内容视为不可信数据（`src/lib/ai-agent/systemPrompt.ts` 守则 9）；威胁模型见 [THREAT_MODEL.md](THREAT_MODEL.md)。
