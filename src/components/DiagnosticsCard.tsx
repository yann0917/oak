"use client";

import { useEffect, useState } from "react";
import { Button, Card, Tag } from "animal-island-ui";
import { Notification } from "@/lib/toast";
import { api } from "@/lib/api";

interface DiagItem {
  key: string;
  label: string;
  status: "ok" | "warn" | "error" | "na";
  detail: string;
  probe?: string;
}

interface DiagReport {
  summary: "ok" | "warn" | "error";
  items: DiagItem[];
  checkedAt: string;
}

interface ProbeResult {
  ok: boolean;
  ms: number;
  detail: string;
}

const STATUS_COLOR: Record<DiagItem["status"], "app-green" | "app-yellow" | "app-red" | "default"> = {
  ok: "app-green",
  warn: "app-yellow",
  error: "app-red",
  na: "default",
};
const STATUS_TEXT: Record<DiagItem["status"], string> = {
  ok: "正常",
  warn: "降级",
  error: "异常",
  na: "未启用",
};

/** 系统诊断：廉价状态自动加载，真实探针（AI/嵌入/搜索/推送）点击才运行 */
export default function DiagnosticsCard() {
  const [report, setReport] = useState<DiagReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState<Record<string, ProbeResult | "running">>({});

  const load = () => {
    setLoading(true);
    api<DiagReport>("/api/diagnostics")
      .then(setReport)
      .catch((e) => Notification.error(e.message || "诊断加载失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const runProbe = async (target: string) => {
    setProbing((p) => ({ ...p, [target]: "running" }));
    try {
      const r = await api<ProbeResult>("/api/diagnostics/probe", {
        method: "POST",
        body: JSON.stringify({ target }),
      });
      setProbing((p) => ({ ...p, [target]: r }));
      Notification[r.ok ? "success" : "error"](`「${target}」探测：${r.ok ? `正常（${r.ms}ms）` : r.detail}`);
    } catch (e: any) {
      setProbing((p) => ({ ...p, [target]: { ok: false, ms: 0, detail: e.message || "探测失败" } }));
    }
  };

  const summary = report?.summary;
  const summaryInfo = {
    ok: { text: "全部正常", color: "app-green" as const },
    warn: { text: "有降级项，建议排查", color: "app-yellow" as const },
    error: { text: "有异常项，请优先处理", color: "app-red" as const },
  }[summary ?? "ok"];

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">系统诊断</h3>
          <div className="flex items-center gap-2">
            {summary && <Tag color={summaryInfo.color}>{summaryInfo.text}</Tag>}
            <Button size="small" loading={loading} onClick={load}>
              刷新
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {!report && loading && <p className="text-sm text-gray-400">检查中…</p>}
          {report?.items.map((item) => {
            const probeState = probing[item.probe ?? ""];
            return (
              <div key={item.key} className="flex items-start gap-3 py-2 border-b border-dashed last:border-0" style={{ borderColor: "var(--animal-border-color, rgba(0,0,0,0.08))" }}>
                <span className="mt-1">
                  <Tag size="small" color={STATUS_COLOR[item.status]} variant="soft">
                    {STATUS_TEXT[item.status]}
                  </Tag>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-xs mt-0.5 break-all" style={{ color: "var(--animal-text-color-secondary)" }}>
                    {item.detail}
                    {probeState && probeState !== "running" && (
                      <span className={probeState.ok ? "ml-2" : "ml-2"} style={{ color: probeState.ok ? "var(--animal-success-color, #52c41a)" : "var(--animal-error-color, #ff4d4f)" }}>
                        探测：{probeState.ok ? `正常（${probeState.ms}ms）` : probeState.detail}
                      </span>
                    )}
                  </p>
                </div>
                {item.probe && (
                  <Button size="small" loading={probeState === "running"} onClick={() => runProbe(item.probe!)}>
                    检测
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {report && (
          <p className="text-xs mt-3" style={{ color: "var(--animal-text-color-secondary)" }}>
            检查时间：{new Date(report.checkedAt).toLocaleString("zh-CN")} · 「检测」按钮会真实调用对应服务（可能产生少量 API 费用）
          </p>
        )}
      </Card>
    </div>
  );
}
