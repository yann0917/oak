"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, Select, Switch } from "animal-island-ui";
import { Notification } from "@/lib/toast";
import { api } from "@/lib/api";
import { AI_PRESETS, presetByKey } from "@/lib/ai/presets";

/** 设置页：AI 助手（快记智能归类）大模型配置卡片 */
export default function AiSettingsCard() {
  const [provider, setProvider] = useState("deepseek");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api("/api/ai-settings")
      .then((cfg: any) => {
        if (cfg) {
          setProvider(cfg.provider ?? "custom");
          setBaseUrl(cfg.baseUrl ?? "");
          setModel(cfg.model ?? "");
          setApiKey(cfg.apiKey ?? "");
          setEnabled(!!cfg.enabled);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pickPreset = (key: string) => {
    setProvider(key);
    const p = presetByKey(key);
    if (p) {
      setBaseUrl(p.baseUrl);
      setModel(p.model);
    }
  };

  const save = async () => {
    if (!baseUrl.trim() || !model.trim()) {
      Notification.warning("请填写接口地址与模型名称");
      return;
    }
    setSaving(true);
    try {
      await api("/api/ai-settings", {
        method: "POST",
        body: JSON.stringify({ provider, baseUrl, model, apiKey, enabled }),
      });
      Notification.success(enabled ? "AI 助手已启用" : "AI 助手设置已保存（未启用）");
    } catch (err: any) {
      Notification.error(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!baseUrl.trim() || !model.trim()) {
      Notification.warning("请填写接口地址与模型名称");
      return;
    }
    setTesting(true);
    try {
      const res = await api<{ ok: boolean; reply?: string; error?: string }>("/api/ai-settings/test", {
        method: "POST",
        body: JSON.stringify({ provider, baseUrl, model, apiKey }),
      });
      if (res.ok) Notification.success(`连接成功：${res.reply || "正常"}`);
      else Notification.error(res.error || "连接失败");
    } catch (err: any) {
      Notification.error(err.message || "连接失败");
    } finally {
      setTesting(false);
    }
  };

  const preset = presetByKey(provider);

  return (
    <Card>
      <h3 className="font-bold mb-1">AI 助手（快记智能归类）</h3>
      <p className="text-sm mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
        配置 OpenAI 兼容大模型后，首页一句话快记将自动归类到健康/账单/成长/时光/提醒/待办等模块；不配置也可正常使用（记录保存为原始流水）
      </p>
      {loading ? (
        <p className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
          加载中…
        </p>
      ) : (
        <div className="space-y-4 max-w-xl">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              服务商
            </label>
            <Select
              value={provider}
              options={AI_PRESETS.map((p) => ({ key: p.key, label: p.label }))}
              onChange={pickPreset}
            />
            {preset?.desc && (
              <p className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                {preset.desc}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              接口地址 base_url
            </label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              模型
            </label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-v4-flash" />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              API Key
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…（本地 Ollama 可留空）"
              allowClear
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch size="small" checked={enabled} onChange={setEnabled} checkedChildren="启用" unCheckedChildren="停用" />
            <span className="text-sm">启用：快记提交后自动调用 AI 归类</span>
          </div>
          <div className="flex gap-3">
            <Button type="primary" loading={saving} onClick={save}>
              保存
            </Button>
            <Button loading={testing} onClick={test}>
              测试连接
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
