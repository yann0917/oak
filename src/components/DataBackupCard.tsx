"use client";

import { useRef, useState } from "react";
import { Button, Card, Input, Select, Switch } from "animal-island-ui";
import { Notification } from "@/lib/toast";

interface ImportSummary {
  ok: boolean;
  mode: string;
  imported: Record<string, number>;
  skipped: Record<string, number>;
  backupFile?: string;
  note: string;
  warning?: string;
}

function download(url: string, filename: string) {
  fetch(url)
    .then(async (res) => {
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "导出失败");
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a); // Safari 对未挂载元素的点击不可靠
      a.click();
      a.remove();
      // 下载是异步开始的：同步 revoke 会让 Safari 等浏览器拿到空文件（报 unsupported format）
      setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
    })
    .catch((e: any) => Notification.error(e.message || "导出失败"));
}

/** 数据管理：导出 Excel / JSON（可含附件）+ JSON 导入（合并/替换） */
export default function DataBackupCard() {
  const [withAttachments, setWithAttachments] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [confirmWord, setConfirmWord] = useState("");
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [lastSummary, setLastSummary] = useState<ImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = (format: "excel" | "json") => {
    const suffix = withAttachments ? ".zip" : format === "excel" ? ".xlsx" : ".json";
    setExporting(true);
    download(
      `/api/data-backup/export?format=${format}${withAttachments ? "&attachments=1" : ""}`,
      `oak_export_${new Date().toISOString().slice(0, 10)}${suffix}`
    );
    // download() 内部异步完成，这里简单延时恢复按钮
    setTimeout(() => setExporting(false), 1500);
  };

  const doImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      Notification.warning("请先选择导出的 JSON（或 zip 备份包）");
      return;
    }
    if (mode === "replace" && confirmWord !== "替换") {
      Notification.warning("替换模式需输入确认词「替换」");
      return;
    }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("mode", mode);
      fd.append("file", file);
      const res = await fetch("/api/data-backup/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "导入失败");
      setLastSummary(data);
      Notification.success("导入完成");
      setConfirmWord("");
    } catch (err: any) {
      Notification.error(err.message || "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const totalImported = lastSummary ? Object.entries(lastSummary.imported).reduce((s, [, v]) => s + v, 0) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="font-bold mb-2">导出</h3>
        <p className="text-sm mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
          导出的 Excel 为人工可读报表（每类数据一个 sheet）；JSON 为完整备份（含 id，可再导入）。
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={withAttachments} onChange={(v) => setWithAttachments(!!v)} />
            包含附件照片（打包为 zip）
          </label>
          <Button type="primary" loading={exporting} onClick={() => doExport("excel")}>
            导出 Excel
          </Button>
          <Button loading={exporting} onClick={() => doExport("json")}>
            {withAttachments ? "导出 JSON+附件 zip" : "导出 JSON 备份"}
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold mb-2">导入</h3>
        <p className="text-sm mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
          上传本系统导出的 JSON 备份（或含附件的 zip 包）。合并 = 追加为新记录（id 重新生成、外键自动映射）；
          替换 = 清空本账号业务数据后还原（自动先备份一份到 data/backups/）。
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="block text-sm">
            <span className="block mb-1" style={{ color: "var(--animal-text-color-secondary)" }}>
              备份文件
            </span>
            <Input
              readOnly
              placeholder="选择 .json / .zip 文件"
              value={fileName}
              onClick={() => fileRef.current?.click()}
              allowClear
            />
            <input
              ref={fileRef}
              type="file"
              accept=".json,.zip"
              className="hidden"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            />
          </label>
          <label className="block text-sm">
            <span className="block mb-1" style={{ color: "var(--animal-text-color-secondary)" }}>
              导入模式
            </span>
            <Select
              value={mode}
              onChange={(v) => setMode(v as "merge" | "replace")}
              options={[
                { key: "merge", label: "合并（追加）" },
                { key: "replace", label: "替换（清空后还原）" },
              ]}
            />
          </label>
          {mode === "replace" && (
            <label className="block text-sm">
              <span className="block mb-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                输入「替换」确认
              </span>
              <Input value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)} placeholder="替换" className="w-24" />
            </label>
          )}
          <Button type="primary" loading={importing} onClick={doImport}>
            开始导入
          </Button>
        </div>

        {lastSummary && (
          <div className="mt-4 p-3 rounded-lg text-sm space-y-1" style={{ background: "rgba(0,0,0,0.03)" }}>
            <p className="font-semibold">
              导入完成：{lastSummary.mode === "replace" ? "替换" : "合并"} 模式 · 共写入 {totalImported} 条
            </p>
            <p>{lastSummary.note}</p>
            {lastSummary.warning && <p style={{ color: "var(--animal-error-color, #ff4d4f)" }}>{lastSummary.warning}</p>}
          </div>
        )}

        <ul className="mt-4 text-xs list-disc pl-4 space-y-1" style={{ color: "var(--animal-text-color-secondary)" }}>
          <li>敏感配置不随备份走：模型 API Key、AnySearch key、推送渠道密钥导出为 ***，导入时保留现有配置。</li>
          <li>不导出/不还原：AI 会话智能无关的 RAG 索引（导入后由记忆检索自动重建）、模型与推送配置、MCP 令牌、AI 用量统计。</li>
          <li>替换导入会先自动备份（JSON）到 data/backups/ 目录，再进行清空与还原。</li>
        </ul>
      </Card>
    </div>
  );
}
