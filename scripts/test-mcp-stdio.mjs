// MCP stdio 冒烟测试：spawn mcp/server.ts，按 JSON-RPC 帧协议走一遍初始化/列工具/调用工具
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = process.env.OAK_TOKEN;
if (!TOKEN) {
  console.error("缺少 OAK_TOKEN");
  process.exit(1);
}

const child = spawn("npx", ["tsx", "mcp/server.ts"], {
  cwd: ROOT,
  env: { ...process.env, OAK_TOKEN: TOKEN },
  stdio: ["pipe", "pipe", "pipe"],
});

let buf = "";
const pending = new Map();
let nextId = 1;
const events = [];

child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else if (msg.id == null) {
        events.push(msg);
      }
    } catch {}
  }
});
child.stderr.on("data", (c) => {
  const text = c.toString().trim();
  if (text) console.error("[mcp-stderr]", text);
});

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}

function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, resolve);
    send({ jsonrpc: "2.0", id, method, params });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`请求超时: ${method}`));
      }
    }, 15000);
  });
}

const main = async () => {
  const init = await request("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "oak-smoke", version: "0.1" },
  });
  console.log("initialize ok:", init.result?.serverInfo?.name, init.result?.serverInfo?.version);
  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  const list = await request("tools/list", {});
  const names = list.result?.tools?.map((t) => t.name) ?? [];
  console.log(`tools/list: ${names.length} 个工具`);
  console.log("->", names.join(", "));
  if (names.includes("webSearch") || names.includes("webExtract")) {
    console.error("❌ 出现了 webSearch/webExtract（不应对外暴露）");
    process.exitCode = 1;
    return;
  }
  const expected = ["getChildren", "queryTeachers", "queryGrowth", "queryHealth", "queryBills", "queryLearning", "queryMoments", "queryReminders", "queryTodos", "queryNotes", "queryGarden", "queryGardenMastery", "queryCertArchives", "queryPolicyNotes", "queryQuickNotes", "queryInsights", "searchAll", "searchKnowledge"];
  const missing = expected.filter((n) => !names.includes(n));
  if (missing.length) {
    console.error("❌ 缺少工具:", missing.join(", "));
    process.exitCode = 1;
    return;
  }

  const call = await request("tools/call", { name: "getChildren", arguments: { limit: 3 } });
  const text = call.result?.content?.[0]?.text ?? "";
  console.log("tools/call getChildren →", text.slice(0, 200));
  console.log("✅ stdio 冒烟测试通过");
  child.kill();
  process.exit(process.exitCode ?? 0);
};

child.on("exit", (code) => {
  if (code && pending.size) {
    console.error("server exited early", code);
    process.exit(1);
  }
});

main().catch((e) => {
  console.error("❌", e.message);
  child.kill();
  process.exit(1);
});
