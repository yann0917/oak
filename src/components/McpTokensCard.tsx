"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, Select, Table } from "animal-island-ui";
import { Notification } from "@/lib/toast";
import { api } from "@/lib/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface TokenRow {
  id: number;
  name: string;
  expiresAt: string;
  lastUsedAt: string;
  createdAt: string;
  status: number;
}

const fmt = (s: string) => (s ? new Date(s).toLocaleString("zh-CN") : "—");

/** MCP 接入令牌：生成/撤销 + 一次性令牌展示 + 接入方式说明 */
export default function McpTokensCard() {
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [name, setName] = useState("");
  const [days, setDays] = useState("90");
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState("");
  const [revokeId, setRevokeId] = useState<number | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = () =>
    api<{ rows: TokenRow[] }>("/api/mcp-tokens")
      .then((r) => setRows(r.rows))
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) {
      Notification.warning("请输入令牌名称（如 codex-agent）");
      return;
    }
    setCreating(true);
    try {
      const r = await api<{ id: number; token: string }>("/api/mcp-tokens", {
        method: "POST",
        body: JSON.stringify({ name, days: Number(days) }),
      });
      setIssued(r.token);
      setName("");
      setDays("90");
      await load();
      Notification.success("令牌已生成（只显示这一次，请立即复制保存）");
    } catch (err: any) {
      Notification.error(err.message || "生成失败");
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued);
      Notification.success("已复制到剪贴板");
    } catch {
      Notification.error("复制失败，请手动选中复制");
    }
  };

  const doRevoke = async () => {
    if (revokeId == null) return;
    setRevoking(true);
    try {
      await api(`/api/mcp-tokens/${revokeId}`, { method: "DELETE" });
      Notification.success("令牌已撤销（立即失效）");
      setRevokeId(null);
      await load();
    } catch (err: any) {
      Notification.error(err.message || "撤销失败");
    } finally {
      setRevoking(false);
    }
  };

  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="font-bold mb-2">MCP 接入令牌</h3>
        <p className="text-sm mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
          生成令牌后，外部 agent 可调用 Oak 的 18 个只读查询工具（按你当前账号隔离数据）。令牌为 JWT
          + 数据库双校验，撤销后立即失效。
        </p>
        <div className="flex flex-wrap items-end gap-3 max-w-2xl">
          <div className="flex-1 min-w-40">
            <label className="block text-sm mb-1" style={{ color: "var(--animal-text-color-secondary)" }}>
              名称
            </label>
            <Input placeholder="如 codex-agent" value={name} onChange={(e) => setName(e.target.value)} allowClear />
          </div>
          <div className="w-36">
            <label className="block text-sm mb-1" style={{ color: "var(--animal-text-color-secondary)" }}>
              有效期
            </label>
            <Select
              value={days}
              onChange={setDays}
              options={[
                { key: "30", label: "30 天" },
                { key: "90", label: "90 天" },
                { key: "365", label: "365 天" },
                { key: "0", label: "永久" },
              ]}
            />
          </div>
          <Button type="primary" loading={creating} onClick={create}>
            生成令牌
          </Button>
        </div>

        {issued && (
          <div className="mt-4 p-3 rounded-lg border border-dashed" style={{ borderColor: "var(--animal-primary-color)" }}>
            <p className="text-sm mb-2">
              请立即复制保存（关闭后无法再次查看原始令牌）：
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs break-all flex-1 bg-black/5 rounded px-2 py-1.5">{issued}</code>
              <Button size="small" onClick={copy}>
                复制
              </Button>
            </div>
          </div>
        )}

        <div className="mt-5">
          <Table
            rowKey="id"
            dataSource={rows as any}
            columns={[
              { title: "名称", dataIndex: "name" },
              { title: "创建时间", dataIndex: "createdAt", render: (v) => fmt(String(v)) },
              { title: "有效期至", dataIndex: "expiresAt", render: (v) => (v ? fmt(String(v)) : "永久") },
              { title: "上次使用", dataIndex: "lastUsedAt", render: (v) => fmt(String(v)) },
              {
                title: "状态",
                dataIndex: "status",
                render: (v, r) =>
                  v ? (
                    <span className="text-sm" style={{ color: "var(--animal-success-color, #52c41a)" }}>
                      启用中
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">已撤销</span>
                  ),
              },
              {
                title: "操作",
                render: (_, r) =>
                  r.status ? (
                    <Button size="small" danger onClick={() => setRevokeId(r.id as number)}>
                      撤销
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  ),
              },
            ]}
            emptyText="还没有令牌"
          />
        </div>
      </Card>

      <Card>
        <h3 className="font-bold mb-3">接入方式</h3>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-1">1. 本地 stdio（推荐）：在 oak 仓库目录运行</p>
            <pre className="text-xs bg-black/5 rounded p-2 overflow-x-auto">{`OAK_TOKEN=<令牌> npx tsx mcp/server.ts`}</pre>
            <p className="mt-1 text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
              连接本地 agent 配置示例（如 Claude Code 的 .mcp.json）：
            </p>
            <pre className="text-xs bg-black/5 rounded p-2 overflow-x-auto">{`{
  "mcpServers": {
    "oak": { "command": "npx", "args": ["tsx", "mcp/server.ts"], "env": { "OAK_TOKEN": "<令牌>" } }
  }
}`}</pre>
          </div>
          <div>
            <p className="font-semibold mb-1">2. 远程 HTTP（Streamable HTTP）：</p>
            <pre className="text-xs bg-black/5 rounded p-2 overflow-x-auto">{`端点：${endpoint}
请求头：Authorization: Bearer <令牌>`}</pre>
          </div>
          <ul className="text-xs list-disc pl-4 space-y-1" style={{ color: "var(--animal-text-color-secondary)" }}>
            <li>工具面为只读查询（与 AI 助手一致），不含联网搜索/网页抓取工具。</li>
            <li>令牌按生成账号隔离数据；请勿提交进 Git 或分享到不可信环境。</li>
          </ul>
        </div>
      </Card>

      <ConfirmDialog
        open={revokeId != null}
        title="撤销令牌"
        content="撤销后该令牌立即失效，使用它的 agent 将无法继续访问。确认撤销？"
        confirmText="确认撤销"
        danger
        loading={revoking}
        onConfirm={doRevoke}
        onClose={() => setRevokeId(null)}
      />
    </div>
  );
}
