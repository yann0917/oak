import { db } from "@/db";
import { pushChannels } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { ChannelType } from "./meta";

export type { ChannelType };

export interface SendResult {
  ok: boolean;
  error?: string;
}

interface ChannelConfig {
  appToken?: string;
  uid?: string;
  sendKey?: string;
  apiKey?: string;
  from?: string;
  to?: string;
  [key: string]: string | undefined;
}

/** 读取某用户某渠道的绑定配置（未配置/未启用返回 null） */
export function getChannelConfig(userId: number, type: string): ChannelConfig | null {
  const row = db
    .select()
    .from(pushChannels)
    .where(and(eq(pushChannels.userId, userId), eq(pushChannels.type, type)))
    .get();
  if (!row || !row.enabled) return null;
  try {
    return JSON.parse(row.config || "{}") as ChannelConfig;
  } catch {
    return null;
  }
}

function parseErr(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function sendWxpusher(cfg: ChannelConfig, title: string, body: string): Promise<SendResult> {
  if (!cfg.appToken || !cfg.uid) return { ok: false, error: "缺少 appToken / uid" };
  try {
    const res = await fetch("https://wxpusher.zjiecode.com/api/send/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appToken: cfg.appToken,
        content: body,
        summary: title,
        contentType: 1,
        uids: [cfg.uid],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (res.ok && data.code === 1000) return { ok: true };
    return { ok: false, error: data.msg || `WxPusher 返回 ${res.status}` };
  } catch (e) {
    return { ok: false, error: `WxPusher 请求失败: ${parseErr(e)}` };
  }
}

async function sendServerchan(cfg: ChannelConfig, title: string, body: string): Promise<SendResult> {
  if (!cfg.sendKey) return { ok: false, error: "缺少 sendKey" };
  try {
    const res = await fetch(`https://sctapi.ftqq.com/${cfg.sendKey}.send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, desp: body }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (res.ok && data.code === 0) return { ok: true };
    return { ok: false, error: data.message || `Server酱 返回 ${res.status}` };
  } catch (e) {
    return { ok: false, error: `Server酱 请求失败: ${parseErr(e)}` };
  }
}

async function sendEmail(cfg: ChannelConfig, title: string, body: string): Promise<SendResult> {
  if (!cfg.apiKey) return { ok: false, error: "缺少 Resend API Key" };
  const to = cfg.to || "";
  if (!to) return { ok: false, error: "缺少收件邮箱 to" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: cfg.from || "Oak <onboarding@resend.dev>",
        to: [to],
        subject: title,
        text: body,
      }),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as any;
    return { ok: false, error: data.message || `Resend 返回 ${res.status}` };
  } catch (e) {
    return { ok: false, error: `邮件发送失败: ${parseErr(e)}` };
  }
}

/** 站内通知无外部依赖，发送成功由 engine 落 push_logs（read=0）体现 */
async function sendInapp(): Promise<SendResult> {
  return { ok: true };
}

/** 按渠道类型与配置发送通知。渠道未配置时为失败（error 说明原因），供页面排障。 */
export async function sendChannel(
  userId: number,
  type: string,
  title: string,
  body: string
): Promise<SendResult> {
  switch (type) {
    case "wxpusher": {
      const cfg = getChannelConfig(userId, "wxpusher");
      if (!cfg) return { ok: false, error: "WxPusher 渠道未配置或未启用" };
      return sendWxpusher(cfg, title, body);
    }
    case "serverchan": {
      const cfg = getChannelConfig(userId, "serverchan");
      if (!cfg) return { ok: false, error: "Server酱渠道未配置或未启用" };
      return sendServerchan(cfg, title, body);
    }
    case "email": {
      const cfg = getChannelConfig(userId, "email");
      if (!cfg) return { ok: false, error: "邮件渠道未配置或未启用" };
      return sendEmail(cfg, title, body);
    }
    case "inapp":
      return sendInapp();
    default:
      return { ok: false, error: `未知渠道: ${type}` };
  }
}
