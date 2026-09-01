"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Select, Tag, Title } from "animal-island-ui";
import type { TagColor } from "animal-island-ui";
import { Notification } from "@/lib/toast";
import { api } from "@/lib/api";
import type { InsightPeriod } from "@/lib/insights/aggregate";

const PERIOD_OPTIONS: { key: InsightPeriod; label: string }[] = [
  { key: "monthly", label: "月报" },
  { key: "weekly", label: "周报" },
];

const TYPE_COLORS: TagColor[] = ["app-teal", "app-blue", "app-orange", "app-green", "purple", "app-yellow"];

/** 首页「橡树长出了新叶」：家庭脉搏 AI 复盘 + 一键保存指南 */
export default function InsightPanel() {
  const [period, setPeriod] = useState<InsightPeriod>("monthly");
  const [latest, setLatest] = useState<any>(null);
  const [sops, setSops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ latest: any; sops: any[] }>(`/api/insights?period=${period}`);
      setLatest(d.latest);
      setSops(d.sops ?? []);
    } catch {
      setLatest(null);
      setSops([]);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const row = await api<any>("/api/insights/generate", {
        method: "POST",
        body: JSON.stringify({ period }),
      });
      if (row.status === "failed") {
        Notification.error(row.error || "复盘失败");
      } else {
        Notification.success(row.status === "done" ? "复盘完成，长出新叶啦 🌱" : "复盘正在生成中");
      }
      await load();
    } catch (err: any) {
      Notification.error(err.message || "复盘失败");
    } finally {
      setGenerating(false);
    }
  };

  const saveSop = async (item: any, index: number) => {
    if (!latest) return;
    const key = `${latest.id}:${index}`;
    setSavingKey(key);
    try {
      await api("/api/family-sops", {
        method: "POST",
        body: JSON.stringify({
          insightId: latest.id,
          type: item.type,
          insight: item.insight,
          actionSop: item.actionSop,
        }),
      });
      Notification.success("已保存至家庭指南");
      await load();
    } catch (err: any) {
      Notification.error(err.message || "保存失败");
    } finally {
      setSavingKey("");
    }
  };

  const removeSop = async (id: number) => {
    setDeletingId(id);
    try {
      await api(`/api/family-sops/${id}`, { method: "DELETE" });
      Notification.success("已移除");
      setSops((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      Notification.error(err.message || "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const insightMatches = (item: any, index: number) =>
    latest != null && sops.some((s) => s.insightId === latest.id && s.type === item.type && s.insight === item.insight);

  return (
    <Card color="app-green" pattern="app-blue">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-lg font-black">橡树长出了新叶 · 家庭洞察</h2>
        <div className="flex items-center gap-2">
          <Select
            value={period}
            options={PERIOD_OPTIONS.map((p) => ({ key: p.key, label: p.label }))}
            onChange={(k) => setPeriod(k as InsightPeriod)}
          />
          <Button loading={generating} onClick={generate}>
            立即复盘
          </Button>
        </div>
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
        由 AI 分析近 30 天 / 近 7 天的记录，提炼可长期指导行动的家庭经验（Knowledge）；每期自动在后台生成，也可手动触发
      </p>

      {loading ? (
        <p className="text-sm py-6 text-center" style={{ color: "var(--animal-text-color-secondary)" }}>
          加载中…
        </p>
      ) : !latest || latest.status === "failed" ? (
        <Card type="dashed">
          <div className="text-center py-6">
            <p className="text-sm mb-3" style={{ color: "var(--animal-text-color-secondary)" }}>
              {latest?.status === "failed"
                ? `本期复盘失败：${latest.error || "未知原因"}`
                : "还没有家庭洞察 —— 点击「立即复盘」，让 AI 把近期的流水提炼成经验"}
            </p>
            <Button type="primary" loading={generating} onClick={generate}>
              立即复盘
            </Button>
          </div>
        </Card>
      ) : latest.status === "generating" ? (
        <Card type="dashed">
          <p className="text-sm py-6 text-center" style={{ color: "var(--animal-text-color-secondary)" }}>
            正在分析近期的流水、账单与健康记录…（大约需要半分钟）
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {(latest.insights ?? []).map((item: any, index: number) => {
            const saved = insightMatches(item, index);
            return (
              <div
                key={index}
                className="rounded-2xl border-2 border-dashed px-4 py-3"
                style={{ borderColor: "var(--animal-border-color-light)" }}
              >
                <Tag size="small" variant="soft" color={TYPE_COLORS[index % TYPE_COLORS.length]}>
                  {item.type || "家庭经验"}
                </Tag>
                <p className="text-sm mt-2">{item.insight}</p>
                <div className="text-sm mt-2 rounded-xl px-3 py-2" style={{ background: "var(--animal-bg-color)" }}>
                  <span style={{ color: "var(--animal-text-color-secondary)" }}>建议：</span>
                  {item.actionSop}
                </div>
                <div className="mt-2 text-right">
                  <Button size="small" disabled={saved} loading={savingKey === `${latest.id}:${index}`} onClick={() => saveSop(item, index)}>
                    {saved ? "已保存至指南" : "一键保存至指南"}
                  </Button>
                </div>
              </div>
            );
          })}
          <p className="text-[11px]" style={{ color: "var(--animal-text-color-secondary)" }}>
            本期窗口：{latest.startDate} ~ {latest.endDate} · 生成于 {new Date(latest.createdAt).toLocaleString("zh-CN")}
          </p>
        </div>
      )}

      {sops.length > 0 && (
        <div className="mt-5 pt-4 border-t" style={{ borderColor: "var(--animal-border-color-light)" }}>
          <Title size="small" color="app-green">
            我的功能指南 · 保存的家庭经验（{sops.length}）
          </Title>
          <div className="mt-3 space-y-2">
            {sops.map((s) => (
              <div key={s.id} className="flex items-start gap-3">
                <Tag size="small" variant="soft" color="app-green" className="shrink-0">
                  {s.type || "指南"}
                </Tag>
                <div className="flex-1 min-w-0 text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {s.actionSop}
                </div>
                <Button size="small" loading={deletingId === s.id} onClick={() => removeSop(s.id)}>
                  移除
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
