"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Select, Switch } from "animal-island-ui";
import { Notification } from "@/lib/toast";
import { api } from "@/lib/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AI_PRESETS, EMBEDDING_SUPPORTED, presetByKey } from "@/lib/ai/presets";

interface ProviderRow {
  id: number;
  provider: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiMode: string;
  updatedAt?: string;
}

interface RagState {
  configured: boolean;
  status: string;
  chunkCount: number;
  lastSyncAt: string;
  lastError: string;
  embeddingProviderId: number | null;
  embeddingModel: string;
  rerankEnabled: boolean;
  rerankModel: string;
  embeddingHint: string;
}

const API_MODE_OPTIONS = [
  { key: "responses", label: "Responses API（推荐，Agent/工具友好）" },
  { key: "chat", label: "Chat Completions（仅兼容该协议的服务商）" },
];

/** 设置页：AI 助手（快记智能归类 + 悬浮对话）——左侧服务商列表，右侧该服务商的模型配置 */
export default function AiSettingsCard() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [searchApiKey, setSearchApiKey] = useState("");
  const [activeProviderId, setActiveProviderId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // 右侧表单：当前编辑的服务商类型 + 具体字段（模型名随时可改）
  const [selectedType, setSelectedType] = useState("deepseek");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formApiMode, setFormApiMode] = useState("responses");

  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [testing, setTesting] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ProviderRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // RAG 记忆检索
  const [rag, setRag] = useState<RagState | null>(null);
  const [embeddingProviderId, setEmbeddingProviderId] = useState<number | null>(null);
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [rerankEnabled, setRerankEnabled] = useState(false);
  const [rerankModel, setRerankModel] = useState("");
  const [savingRag, setSavingRag] = useState(false);

  const load = async () => {
    try {
      const res = await api<{
        enabled: boolean;
        searchApiKey: string;
        activeProviderId: number | null;
        providers: ProviderRow[];
      }>("/api/ai-settings");
      setProviders(res.providers ?? []);
      setEnabled(!!res.enabled);
      setSearchApiKey(res.searchApiKey ?? "");
      setActiveProviderId(res.activeProviderId ?? null);
      // 表单同步当前选中服务商的已保存配置（或预设默认值）
      const m: Record<string, ProviderRow> = {};
      for (const p of res.providers ?? []) m[p.provider] = p;
      const saved = m[selectedType];
      const preset = presetByKey(selectedType);
      setFormBaseUrl(saved?.baseUrl || preset?.baseUrl || "");
      setFormModel(saved?.model || preset?.model || "");
      setFormApiKey(saved?.apiKey ?? "");
      setFormApiMode(
        saved?.apiMode === "chat" || saved?.apiMode === "responses" ? saved.apiMode : (preset?.apiMode ?? "chat")
      );
    } catch {
      /* 保存操作会给出提示 */
    } finally {
      setLoading(false);
    }
    loadRag();
  };

  const loadRag = async () => {
    try {
      const r = await api<RagState>("/api/ai-settings/rag");
      setRag(r);
      setEmbeddingProviderId(r.embeddingProviderId);
      setEmbeddingModel(r.embeddingModel);
      setRerankEnabled(r.rerankEnabled);
      setRerankModel(r.rerankModel);
    } catch {
      /* 状态展示失败不打扰用户 */
    }
  };

  useEffect(() => {
    load();
  }, []);

  // 已保存配置按服务商 key 索引
  const rowsByType = useMemo(() => {
    const m: Record<string, ProviderRow> = {};
    for (const p of providers) m[p.provider] = p;
    return m;
  }, [providers]);

  const activeRowKey = useMemo(
    () => Object.keys(rowsByType).find((k) => rowsByType[k].id === activeProviderId) ?? null,
    [rowsByType, activeProviderId]
  );

  /** 选择左侧服务商：有保存的配置则回填，否则用预设默认值 */
  const pickType = (key: string) => {
    setSelectedType(key);
    const saved = rowsByType[key];
    const preset = presetByKey(key);
    setFormBaseUrl(saved?.baseUrl || preset?.baseUrl || "");
    setFormModel(saved?.model || preset?.model || "");
    setFormApiKey(saved?.apiKey ?? "");
    setFormApiMode(saved?.apiMode === "chat" || saved?.apiMode === "responses" ? saved.apiMode : (preset?.apiMode ?? "chat"));
  };

  const saveProvider = async () => {
    if (!formBaseUrl.trim() || !formModel.trim()) {
      Notification.warning("请填写接口地址与模型名称");
      return;
    }
    setSavingProvider(true);
    try {
      await api("/api/ai-providers", {
        method: "POST",
        body: JSON.stringify({
          provider: selectedType,
          baseUrl: formBaseUrl,
          model: formModel,
          apiKey: formApiKey,
          apiMode: formApiMode,
        }),
      });
      await load();
      Notification.success(`「${presetByKey(selectedType)?.label ?? selectedType}」配置已保存`);
    } catch (err: any) {
      Notification.error(err.message || "保存失败");
    } finally {
      setSavingProvider(false);
    }
  };

  const setActive = async () => {
    const row = rowsByType[selectedType];
    if (!row) return;
    setSavingGlobal(true);
    try {
      await api("/api/ai-settings", {
        method: "POST",
        body: JSON.stringify({ enabled, searchApiKey, activeProviderId: row.id }),
      });
      setActiveProviderId(row.id);
      Notification.success(`已切换为「${presetByKey(selectedType)?.label ?? selectedType}」`);
    } catch (err: any) {
      Notification.error(err.message || "切换失败");
    } finally {
      setSavingGlobal(false);
    }
  };

  const deleteProvider = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api(`/api/ai-providers/${confirmDelete.id}`, { method: "DELETE" });
      await load();
      // 删除后回到该服务商的空白表单（预设默认值）
      pickType(selectedType);
      Notification.success("配置已删除");
    } catch (err: any) {
      Notification.error(err.message || "删除失败");
    }
    setDeleting(false);
    setConfirmDelete(null);
  };

  const saveGlobal = async () => {
    setSavingGlobal(true);
    try {
      await api("/api/ai-settings", {
        method: "POST",
        body: JSON.stringify({ enabled, searchApiKey, activeProviderId }),
      });
      Notification.success(enabled ? "AI 助手已启用" : "AI 助手设置已保存（未启用）");
    } catch (err: any) {
      Notification.error(err.message || "保存失败");
    } finally {
      setSavingGlobal(false);
    }
  };

  const saveRag = async () => {
    setSavingRag(true);
    try {
      await api("/api/ai-settings/rag", {
        method: "POST",
        body: JSON.stringify({ embeddingProviderId, embeddingModel, rerankEnabled, rerankModel }),
      });
      Notification.success(
        embeddingProviderId == null ? "记忆检索已关闭" : "记忆检索配置已保存，索引在后台重建中"
      );
      setTimeout(loadRag, 2000);
    } catch (err: any) {
      Notification.error(err.message || "保存失败");
    } finally {
      setSavingRag(false);
    }
  };

  const checkBalance = async () => {
    if (!selectedSaved) return;
    setCheckingBalance(true);
    try {
      const res = await api<{ isAvailable: boolean; balances: { currency: string; totalBalance: string; grantedBalance: string; toppedUpBalance: string }[] }>(
        `/api/ai-settings/balance?id=${selectedSaved.id}`
      );
      if (!res.isAvailable) {
        Notification.warning("账户余额不足，API 调用暂不可用");
        return;
      }
      const parts = res.balances.map(
        (b) => `总 ${b.totalBalance} ${b.currency}（充值 ${b.toppedUpBalance} + 赠送 ${b.grantedBalance}）`
      );
      Notification.success(parts.length ? `DeepSeek 余额：${parts.join("；")}` : "查询成功，无余额信息");
    } catch (err: any) {
      Notification.error(err.message || "查询失败");
    } finally {
      setCheckingBalance(false);
    }
  };

  const test = async () => {
    if (!formBaseUrl.trim() || !formModel.trim()) {
      Notification.warning("请填写接口地址与模型名称");
      return;
    }
    setTesting(true);
    try {
      const res = await api<{ ok: boolean; reply?: string; error?: string }>("/api/ai-settings/test", {
        method: "POST",
        body: JSON.stringify({ provider: selectedType, baseUrl: formBaseUrl, model: formModel, apiKey: formApiKey }),
      });
      if (res.ok) Notification.success(`连接成功：${res.reply || "正常"}`);
      else Notification.error(res.error || "连接失败");
    } catch (err: any) {
      Notification.error(err.message || "连接失败");
    } finally {
      setTesting(false);
    }
  };

  const selectedSaved = rowsByType[selectedType];
  const selectedActive = !!selectedSaved && selectedSaved.id === activeProviderId;

  return (
    <Card>
      <h3 className="font-bold mb-1">AI 助手（快记智能归类 + 悬浮对话）</h3>
      <p className="text-sm mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
        左侧选服务商，右侧填配置（模型名随时可改）；「设为当前」后，快记归类与悬浮对话均切换到该服务商
      </p>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
          加载中…
        </p>
      ) : (
        <>
          <div className="grid md:grid-cols-[230px_1fr] gap-4">
            {/* 左侧：服务商类型列表（固定） */}
            <div>
              <div className="text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                服务商
              </div>
              <div className="space-y-1.5">
                {AI_PRESETS.map((preset) => {
                  const saved = rowsByType[preset.key];
                  const active = saved?.id === activeProviderId;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => pickType(preset.key)}
                      className="block w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors hover:opacity-85"
                      style={{
                        borderColor: active
                          ? "var(--animal-primary-color)"
                          : preset.key === selectedType
                            ? "var(--animal-border-color-hover)"
                            : "var(--animal-border-color-light)",
                        background: active ? "var(--animal-primary-color-bg)" : "var(--animal-bg-color-secondary)",
                        color: "var(--animal-text-color)",
                      }}
                    >
                      <span className="flex items-center justify-between">
                        <span className="truncate">{preset.label}</span>
                        {active && (
                          <span className="text-xs" style={{ color: "var(--animal-primary-color)" }}>
                            ✓ 当前
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs mt-0.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                        {saved?.model || "未配置"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 右侧：所选服务商的配置表单 */}
            <div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                    接口地址 base_url
                  </label>
                  <Input value={formBaseUrl} onChange={(e) => setFormBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" />
                </div>
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                    模型名
                  </label>
                  <Input value={formModel} onChange={(e) => setFormModel(e.target.value)} placeholder="deepseek-v4-flash" />
                  <p className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                    随时可换模型，如 deepseek-v4-pro / kimi-k3 / qwen3.7-plus，保存后立即生效
                  </p>
                </div>
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                    API Key
                  </label>
                  <Input type="password" value={formApiKey} onChange={(e) => setFormApiKey(e.target.value)} placeholder="sk-…" allowClear />
                </div>
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                    接口类型
                  </label>
                  <Select value={formApiMode} options={API_MODE_OPTIONS} onChange={(k) => setFormApiMode(k)} />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedSaved && !selectedActive && (
                    <Button type="primary" loading={savingGlobal} onClick={setActive}>
                      设为当前
                    </Button>
                  )}
                  <Button type={selectedActive ? "primary" : "default"} loading={savingProvider} onClick={saveProvider}>
                    保存配置
                  </Button>
                  <Button loading={testing} onClick={test}>
                    测试连接
                  </Button>
                  {selectedType === "deepseek" && selectedSaved && (
                    <Button loading={checkingBalance} onClick={checkBalance}>
                      查余额
                    </Button>
                  )}
                  {selectedSaved && (
                    <Button danger onClick={() => setConfirmDelete(selectedSaved)}>
                      删除配置
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 全局设置 */}
          <div className="mt-5 border-t pt-4 space-y-3" style={{ borderColor: "var(--animal-border-color-light)" }}>
            <div className="flex items-center gap-3">
              <Switch size="small" checked={enabled} onChange={setEnabled} checkedChildren="启用" unCheckedChildren="停用" />
              <span className="text-sm">启用：快记提交后自动调用 AI 归类，悬浮助手可对话</span>
            </div>
            <div className="max-w-xl">
              <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                AnySearch 联网搜索 Key（可选）
              </label>
              <Input
                type="password"
                value={searchApiKey}
                onChange={(e) => setSearchApiKey(e.target.value)}
                placeholder="anysearch_…（留空则无通用联网搜索；DeepSeek 原生搜索不受影响）"
                allowClear
              />
              <p className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                用于 AI 助手回答家庭数据之外的问题（新闻/政策/百科等），密钥在 anysearch.com 控制台免费创建
              </p>
            </div>
            <div>
              <Button type="primary" loading={savingGlobal} onClick={saveGlobal}>
                保存基本设置
              </Button>
            </div>
          </div>

          {/* RAG 记忆检索 */}
          <div className="mt-5 border-t pt-4 space-y-3" style={{ borderColor: "var(--animal-border-color-light)" }}>
            <div className="text-sm font-bold">记忆检索（RAG）</div>
            <p className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
              用于回答「我之前记过/我们聊过…」类问题：选择支持 embeddings 的服务商作为向量来源（DeepSeek/Kimi 不支持），
              对话时自动检索相关记忆片段注入上下文，并可在对话中调用 searchKnowledge 深挖
            </p>
            <div className="max-w-xl space-y-3">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                  Embedding 服务商（基于上方已保存的模型配置）
                </label>
                <Select
                  value={embeddingProviderId != null ? String(embeddingProviderId) : "__none"}
                  options={[
                    { key: "__none", label: "未配置（不启用记忆检索）" },
                    ...providers.map((p) => ({
                      key: String(p.id),
                      label: `${p.name || presetByKey(p.provider)?.label || p.provider} · ${p.model || "未填模型"}${
                        EMBEDDING_SUPPORTED[p.provider] === false ? "（无 embeddings）" : ""
                      }`,
                    })),
                  ]}
                  onChange={(k) => {
                    const id = k && k !== "__none" ? Number(k) : null;
                    setEmbeddingProviderId(id);
                    if (id != null && rag?.embeddingProviderId !== id) setEmbeddingModel("");
                  }}
                />
                {providers.length === 0 && (
                  <p className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                    还没有任何模型配置：先在上方保存一个支持 embeddings 的服务商（OpenAI / 通义 / 自定义）即可选择
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                  Embedding 模型名（可空 = 预设默认：OpenAI text-embedding-3-small / 通义 text-embedding-v4）
                </label>
                <Input
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  placeholder="留空用默认；自定义服务商必须填写"
                  allowClear
                />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Switch size="small" checked={rerankEnabled} onChange={setRerankEnabled} checkedChildren="重排" unCheckedChildren="关" />
                <span className="text-sm">精排（rerank）：把检索结果再重排一次，提升注入精度</span>
              </div>
              <div className="max-w-xl">
                <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                  重排模型名（可空 = qwen3-rerank；仅当服务商支持 /reranks 端点时生效，如通义）
                </label>
                <Input
                  value={rerankModel}
                  onChange={(e) => setRerankModel(e.target.value)}
                  placeholder="qwen3-rerank"
                  allowClear
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button type={embeddingProviderId != null ? "primary" : "default"} loading={savingRag} onClick={saveRag}>
                  {embeddingProviderId != null ? "保存并重建索引" : "关闭记忆检索"}
                </Button>
                {rag && (
                  <span className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                    {!rag.configured && rag.embeddingHint}
                    {rag.configured && rag.status === "syncing" && "索引重建中…"}
                    {rag.configured &&
                      rag.status === "ok" &&
                      `已索引 ${rag.chunkCount} 条记忆${rag.lastSyncAt ? ` · 上次同步 ${new Date(rag.lastSyncAt).toLocaleString("zh-CN")}` : ""}`}
                    {rag.configured && rag.status === "error" && `上次索引失败：${rag.lastError}`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="删除配置"
        content={`确定删除「${confirmDelete ? presetByKey(confirmDelete.provider)?.label : ""}」的模型配置吗？`}
        confirmText="删除"
        danger
        loading={deleting}
        onClose={() => setConfirmDelete(null)}
        onConfirm={deleteProvider}
      />
    </Card>
  );
}
