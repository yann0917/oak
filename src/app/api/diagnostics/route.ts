import { NextRequest, NextResponse } from "next/server";
import { and, between, desc, eq, gte, sql } from "drizzle-orm";
import fs from "fs";
import os from "os";
import path from "path";
import { db } from "@/db";
import { aiUsage, pushChannels, pushLogs, reminders } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { getRagStatus } from "@/lib/rag/store";
import { getEmbeddingSetup } from "@/lib/rag/embeddings";
import { CHANNEL_TYPES } from "@/lib/reminders/meta";

/** 系统诊断（廉价静态状态 + 可点击的真实探针，探针见 /api/diagnostics/probe） */

export interface DiagItem {
  key: string;
  label: string;
  status: "ok" | "warn" | "error" | "na";
  detail: string;
  probe?: string; // 可运行的真实探针 target
}

function beijingToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function dirStats(dir: string): { count: number; size: number } {
  let count = 0;
  let size = 0;
  const walk = (d: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        count++;
        try {
          size += fs.statSync(p).size;
        } catch {}
      }
    }
  };
  walk(dir);
  return { count, size };
}

export async function GET(req: NextRequest) {
  const { user, denied } = await requirePerm("diagnostics", "list", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const uid = user.id;
  const items: DiagItem[] = [];

  // 1. 数据库：quick_check + 文件大小
  try {
    const check = db.$client.prepare("PRAGMA quick_check").get() as Record<string, string>;
    const ok = Object.values(check).every((v) => v === "ok");
    const dbFile = path.join(process.cwd(), "data", "oak.db");
    const sizeMb = fs.existsSync(dbFile) ? (fs.statSync(dbFile).size / 1024 / 1024).toFixed(1) : "-";
    items.push({
      key: "db",
      label: "数据库",
      status: ok ? "ok" : "error",
      detail: ok ? `完整性检查通过 · ${sizeMb} MB` : `完整性检查异常：${JSON.stringify(check)}`,
      probe: "db",
    });
  } catch (e: any) {
    items.push({ key: "db", label: "数据库", status: "error", detail: e?.message ?? "检查失败", probe: "db" });
  }

  // 2. uploads 上传目录
  try {
    const dir = path.join(process.cwd(), "uploads");
    fs.accessSync(dir, fs.constants.W_OK);
    const { count, size } = dirStats(dir);
    items.push({
      key: "uploads",
      label: "上传目录",
      status: "ok",
      detail: `可写 · ${count} 个文件 · ${(size / 1024 / 1024).toFixed(1)} MB`,
      probe: "uploads",
    });
  } catch (e: any) {
    items.push({ key: "uploads", label: "上传目录", status: "error", detail: e?.message ?? "不可写", probe: "uploads" });
  }

  // 3. 提醒调度器：最近一次 next_run_at（调度基于库内预计算，重启零丢失）
  const nextRun = db
    .select({ nextRunAt: reminders.nextRunAt, title: reminders.title })
    .from(reminders)
    .where(and(eq(reminders.userId, uid), eq(reminders.enabled, 1)))
    .orderBy(reminders.nextRunAt)
    .limit(1)
    .get();
  if (nextRun?.nextRunAt) {
    const deltaMin = Math.round((new Date(nextRun.nextRunAt).getTime() - Date.now()) / 60000);
    items.push({
      key: "scheduler",
      label: "提醒调度",
      status: "ok",
      detail: `最近提醒「${nextRun.title}」将于 ${nextRun.nextRunAt} 触发（${deltaMin} 分钟后）`,
    });
  } else {
    items.push({ key: "scheduler", label: "提醒调度", status: "na", detail: "没有已启用的提醒（调度器空闲）" });
  }

  // 4. AI 主模型：配置 + 当日调用/错误
  const cfg = getAiRuntimeConfig(uid);
  if (!cfg.enabled || !cfg.provider) {
    items.push({ key: "ai_model", label: "AI 主模型", status: "na", detail: "未配置或未启用（设置 → AI 大模型）", probe: "ai" });
  } else {
    const usage = db
      .select({ calls: aiUsage.calls, errors: aiUsage.errors })
      .from(aiUsage)
      .where(eq(aiUsage.date, beijingToday()))
      .all();
    const calls = usage.reduce((s, u) => s + (u.calls ?? 0), 0);
    const errors = usage.reduce((s, u) => s + (u.errors ?? 0), 0);
    items.push({
      key: "ai_model",
      label: "AI 主模型",
      status: errors > 0 ? "warn" : "ok",
      detail: `${cfg.provider.name || cfg.provider.provider} · ${cfg.provider.model} · 今日调用 ${calls} 次（错误 ${errors}）`,
      probe: "ai",
    });
  }

  // 5. 记忆检索（RAG）
  const rag = getRagStatus(uid);
  if (!rag.configured) {
    items.push({ key: "rag", label: "记忆检索 (RAG)", status: "na", detail: rag.embeddingHint, probe: "embedding" });
  } else if (rag.status === "error") {
    items.push({ key: "rag", label: "记忆检索 (RAG)", status: "error", detail: `上次索引失败：${rag.lastError}`, probe: "embedding" });
  } else if (rag.status === "syncing") {
    items.push({ key: "rag", label: "记忆检索 (RAG)", status: "warn", detail: "索引同步进行中…", probe: "embedding" });
  } else {
    items.push({
      key: "rag",
      label: "记忆检索 (RAG)",
      status: "ok",
      detail: `已索引 ${rag.chunkCount} 条记忆${rag.lastSyncAt ? ` · 上次同步 ${new Date(rag.lastSyncAt).toLocaleString("zh-CN")}` : ""}`,
      probe: "embedding",
    });
  }

  // 6. Embedding / 重排 / 联网搜索 配置态
  const emb = getEmbeddingSetup(uid);
  items.push({
    key: "embedding",
    label: "Embedding 服务",
    status: emb.ok ? "ok" : "na",
    detail: emb.ok ? `已配置（${emb.model || "预设默认"}）` : emb.message,
    probe: "embedding",
  });
  items.push({
    key: "rerank",
    label: "Rerank 重排",
    status: rag.rerankEnabled ? (rag.configured ? "ok" : "na") : "na",
    detail: rag.rerankEnabled ? `已启用（${rag.rerankModel}，复用 embedding 服务商）` : "未启用（可选）",
    probe: rag.rerankEnabled ? "rerank" : undefined,
  });
  items.push({
    key: "search",
    label: "联网搜索",
    status: cfg.searchApiKey ? "ok" : "na",
    detail: cfg.searchApiKey ? "AnySearch key 已配置" : "未配置 AnySearch（DeepSeek 原生 web_search 不受影响）",
    probe: cfg.searchApiKey ? "search" : undefined,
  });

  // 7. 推送渠道：配置 + 近 7 天发送日志
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400e3).toISOString();
  const channelRows = db.select().from(pushChannels).where(eq(pushChannels.userId, uid)).all();
  for (const type of CHANNEL_TYPES) {
    const ch = channelRows.find((c) => c.type === type);
    let logs = { sent: 0, failed: 0 };
    try {
      const l = db
        .select({ status: pushLogs.status, c: sql`COUNT(*)` })
        .from(pushLogs)
        .where(and(eq(pushLogs.userId, uid), eq(pushLogs.channel, type), gte(pushLogs.createdAt, sevenDaysAgo)))
        .groupBy(pushLogs.status)
        .all();
      logs = {
        sent: l.reduce((s, x) => s + Number(x.status === "sent" ? x.c : 0), 0),
        failed: l.reduce((s, x) => s + Number(x.status === "failed" ? x.c : 0), 0),
      };
    } catch {}
    items.push({
      key: `push:${type}`,
      label: `推送渠道 · ${type}`,
      status: ch && ch.enabled ? (logs.failed > 0 ? "warn" : "ok") : "na",
      detail: `${ch?.enabled ? "已启用" : "未启用"}${ch ? "" : "（未配置）"} · 近 7 天发送 ${logs.sent} 次，失败 ${logs.failed} 次`,
      probe: ch?.enabled ? `push:${type}` : undefined,
    });
  }

  const summary = items.some((i) => i.status === "error") ? "error" : items.some((i) => i.status === "warn") ? "warn" : "ok";
  return NextResponse.json({ summary, items, checkedAt: new Date().toISOString(), host: os.hostname() });
}
