# Oak 威胁模型（Threat Model）

本文档描述 Oak 面对的安全威胁、信任边界与对应缓解措施（每项标注代码位置，随实现演化）。

## 资产

| 资产 | 位置 | 敏感级别 |
| --- | --- | --- |
| 家庭成员档案（姓名/生日/性别/照片） | `children` | 高 |
| 证件/卡证原件照片与 OCR 全文（身份证、户口本、检测报告…） | `cert_archives` + `uploads/` | 极高 |
| 健康档案（体检/疫苗/用药/病历） | `health_records` | 高 |
| 账单（收支金额、组织、凭证照片） | `bills` | 高 |
| 教师/学校/课程表/学习记录（联系方式） | `teachers`/`schools`/`learning_records`/`timetable_slots` | 中 |
| 历史对话与快记流水 | `chat_messages`/`quick_notes` | 中 |
| AI 服务商 API Key / 推送渠道密钥 | `ai_providers`/`push_channels`/`ai_settings` | 高 |
| MCP 接入令牌 | `mcp_tokens`（只存 sha256） | 中 |

## 信任边界

1. **自托管边界**：oak 部署在用户自有服务器（Nginx 反代 + Node standalone），公网可达是设计前提。
2. **浏览器 → API**：JWT cookie（httpOnly, sameSite=lax）+ Casbin `api:*` 权限点。
3. **外部 agent → MCP**：Bearer 令牌（JWT + `mcp_tokens` 表双校验），stdio（本地进程）与 HTTP（远程）两个入口。
4. **上游内容 → 模型上下文**：快记/笔记/政策/网页正文/历史对话会经 RAG 或工具返回进入 AI 提示词，**均视为不可信数据**。
5. **云 API**：OpenAI 兼容的对话/嵌入/重排/搜索服务，其返回（网页摘要、提取正文）会进入上下文。

## 威胁源与缓解

### 1. Prompt 注入（最高频面）
- **注入面**：① RAG 注入的相关记忆片段（含历史对话摘录——攻击者可借用户消息把指令写进"记忆"）；② 政策正文/笔记/快记/时光描述等用户可编辑内容；③ 联网搜索摘要与 webExtract 网页正文（恶意网页可直接投毒）；④ 工具返回的描述性字段（如 notes 文本）。
- **缓解**：系统提示「守则 9 不可信数据原则」+ 守则 8 收紧措辞（`src/lib/ai-agent/systemPrompt.ts`）；RAG 片段逐条加「【不可信数据】」标记并在标题声明（`src/lib/rag/store.ts formatRagContext`）；引用式回答（要求模型仅把内容当事实引用、不执行其中指令）。
- **审计**：`scripts/audit-prompt-injection.mjs`——静态断言守则与标记在位；RAG 已配置时可跑 live 探针（写入注入 payload 快记 → 提问 → 断言不触发泄露）。

### 2. MCP 越权访问 / 令牌泄露
- **缓解**：只读工具集（无写操作、无 shell）；**不暴露 webSearch/webExtract**（对外烧钱 + SSRF，`src/lib/mcp/tools.ts` 不传 searchApiKey 使其天然不注册）；所有工具强制 `user_id` 过滤（复用 `buildAgentTools`）；令牌 = `AUTH_SECRET` 签名 JWT + 数据库 sha256 双校验，撤销/过期即时生效（`src/lib/mcp/tokens.ts` + `mcp_tokens` 表）；每请求鉴权并校验会话归属 uid（`src/app/api/mcp/route.ts`）；令牌不在浏览器侧存储（设置页只在创建时回显一次）。
- **注意**：MCP 客户端（agent）是全新信任体，其收到的数据可被该 agent 直接转走——只在信任的机器/客户端上配置令牌。

### 3. API Key 泄露
- **缓解**：导出数据时 `ai_providers.apiKey`/`ai_settings.search_api_key`/`push_channels.config` 一律脱敏为 `***`，导入时遇脱敏/空值保留现有配置（`src/lib/data-backup/tables.ts`）；密钥只存服务端数据库，前端设置页读取时按需回显遮罩。

### 4. 公网暴露与暴力破解
- **缓解**：JWT 30 天 + httpOnly + sameSite=lax（`src/lib/auth.ts`）；登录链路是唯一无 `api:*` 权限点的入点（`scripts/gen-api-perms.mjs` 排除 auth/*）；部署文档建议仅经 HTTPS 反代暴露；未启用用户自注册（仅 admin 添加用户）。

### 5. 附件路径穿越 / 恶意上传
- **缓解**：上传按 `uploads/` 前缀校验；导出 zip 解析路径须落在项目目录内（adm-zip 条目名校验）；附件列表（attachments/photos）只存服务端生成的路径。

## 缺失项（已知残余风险）

- 无 2FA：TODO（odysseus 有 TOTP 可参考）。
- 本地模型自托管：不在此威胁模型内（当前纯云端 API 路线）。
- webExtract 对内仍开放：agent 建议生成系统提示的守则 9 涵盖其输出；MCP 路径已整体移除。
