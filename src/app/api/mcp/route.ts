/**
 * MCP Streamable HTTP transport（Next.js 路由托管）：
 * - 鉴权：每请求 Authorization: Bearer <MCP 令牌>（JWT + 表校验，撤销/过期即时生效）；
 * - 会话：一个 transport 实例 = 一个客户端会话（WebStandard transport 单会话语义），
 *   按 mcp-session-id 分派到对应实例；关闭时清理；
 * - 工具面与 stdio 版一致（18 个只读工具，按令牌归属用户隔离，不含联网搜索）。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { verifyMcpToken } from "@/lib/mcp/tokens";
import { buildMcpTools } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface McpSession {
  uid: number;
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
}

// 会话存活于进程内存：服务重启后客户端需重新初始化（标准行为）
const sessions = new Map<string, McpSession>();

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function jsonRes(body: unknown, status: number) {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * 转发 transport 响应：保留其头部（MCP-Session-Id、Content-Type 等）+ CORS。
 * SSE 响应前置一条注释帧（`: oak`）：SDK 在无 eventStore 时首帧要等 keep-alive，
 * Next 会缓冲到首个 chunk 才发响应头——注释帧让 GET/POST 流立即刷出。
 */
function forward(res: Response) {
  const out = new Response(res.body, { status: res.status });
  res.headers.forEach((v, k) => out.headers.set(k, v));
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/event-stream") || !res.body) return out;
  const reader = res.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(": oak\n\n"));
      (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      })();
    },
  });
  return new Response(body, { status: res.status, headers: out.headers });
}

function authOrDeny(req: NextRequest): ReturnType<typeof verifyMcpToken> {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  return verifyMcpToken(token);
}

async function buildMcpServer(uid: number) {
  const server = new McpServer({ name: "oak", version: "0.1.0" });
  for (const t of buildMcpTools(uid)) {
    (server.registerTool as any)(t.name, { description: t.description, inputSchema: t.inputSchema }, async (args: unknown) =>
      t.execute(args ?? {})
    );
  }
  return server;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** 新会话（initialize）由 POST 创建；无会话的 GET 一律 404（避免把未知会话当新帧） */
export async function GET(req: NextRequest) {
  const auth = authOrDeny(req);
  if (!auth) return jsonRes({ error: "未授权" }, 401);
  const sessionId = req.headers.get("mcp-session-id") || "";
  const session = sessions.get(sessionId);
  if (!session) return jsonRes({ error: "会话不存在" }, 404);
  if (session.uid !== auth.uid) return jsonRes({ error: "令牌与会话归属不一致" }, 403);
  return forward(await session.transport.handleRequest(req));
}

export async function POST(req: NextRequest) {
  const auth = authOrDeny(req);
  if (!auth) return jsonRes({ error: "未授权" }, 401);
  const sessionId = req.headers.get("mcp-session-id") || "";
  const session = sessions.get(sessionId);
  if (!session) {
    // 携带未知会话 id → 404；无 id 且非首个 initialize 也交给 SDK 校验
    if (sessionId) return jsonRes({ error: "会话不存在" }, 404);
    const server = await buildMcpServer(auth.uid);
    let sid = "";
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (s) => {
        sid = s;
      },
      onsessionclosed: (s) => {
        sessions.delete(s);
      },
    });
    await server.connect(transport);
    const res = await transport.handleRequest(req);
    if (sid) sessions.set(sid, { uid: auth.uid, server, transport });
    return forward(res);
  }
  if (session.uid !== auth.uid) return jsonRes({ error: "令牌与会话归属不一致" }, 403);
  return forward(await session.transport.handleRequest(req));
}

export async function DELETE(req: NextRequest) {
  const auth = authOrDeny(req);
  if (!auth) return jsonRes({ error: "未授权" }, 401);
  const sessionId = req.headers.get("mcp-session-id") || "";
  if (!sessionId) return jsonRes({ error: "缺少会话 id" }, 400);
  const session = sessions.get(sessionId);
  if (!session) return jsonRes({ error: "会话不存在" }, 404);
  if (session.uid !== auth.uid) return jsonRes({ error: "令牌与会话归属不一致" }, 403);
  const res = await session.transport.handleRequest(req);
  // onsessionclosed（SDK 内）已清理 sessions
  return forward(res);
}
