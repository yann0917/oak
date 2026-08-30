/** 前端可安全引用的纯数据/纯函数（无 db 依赖），避免服务端代码被打进客户端 bundle */

export type ChannelType = "wxpusher" | "serverchan" | "email" | "inapp";

export const CHANNEL_TYPES: ChannelType[] = ["wxpusher", "serverchan", "email", "inapp"];

export const CHANNEL_META: Record<ChannelType, { label: string; desc: string }> = {
  wxpusher: { label: "WxPusher", desc: "通过 WxPusher App 接收消息，个人主力渠道" },
  serverchan: { label: "Server酱", desc: "免费 5 条/天，一个 SendKey 即用，适合做兜底" },
  email: { label: "邮件", desc: "Resend：免费 3000 封/月，适合学期报告等长内容" },
  inapp: { label: "站内通知", desc: "应用内通知铃铛红点，无需任何外部配置" },
};

export const CHANNEL_FIELDS: Record<ChannelType, { name: string; label: string; placeholder: string }[]> = {
  wxpusher: [
    { name: "appToken", label: "AppToken", placeholder: "WxPusher 应用里生成" },
    { name: "uid", label: "用户 UID", placeholder: "WxPusher App 中订阅后获取的 uid" },
  ],
  serverchan: [
    { name: "sendKey", label: "SendKey", placeholder: "sct. 开头的企业微信推送密钥" },
  ],
  email: [
    { name: "apiKey", label: "Resend API Key", placeholder: "re_ 开头" },
    { name: "from", label: "发件地址", placeholder: "Oak <onboarding@resend.dev>" },
    { name: "to", label: "收件邮箱", placeholder: "your@email.com" },
  ],
  inapp: [],
};

export type ScheduleType = "once" | "daily" | "weekly" | "monthly" | "cron";

export const SCHEDULE_TYPES: { key: ScheduleType; label: string }[] = [
  { key: "once", label: "一次性" },
  { key: "daily", label: "每天" },
  { key: "weekly", label: "每周" },
  { key: "monthly", label: "每月" },
  { key: "cron", label: "自定义 Cron" },
];

export const WEEKDAY_OPTIONS = [
  { key: "1", label: "一" },
  { key: "2", label: "二" },
  { key: "3", label: "三" },
  { key: "4", label: "四" },
  { key: "5", label: "五" },
  { key: "6", label: "六" },
  { key: "7", label: "日" },
];

export interface ScheduleShape {
  scheduleType: ScheduleType;
  timeOfDay: string;
  weekdays: string;
  monthDays: string;
  cronExpr: string;
  targetDate: string;
  advanceDays: string;
}

/** 频率描述，用于列表卡片展示 */
export function describeSchedule(s: ScheduleShape): string {
  if (s.scheduleType === "once") {
    const adv = (s.advanceDays || "").split(",").filter(Boolean);
    return `一次性${s.targetDate ? ` · ${s.targetDate}` : ""}${adv.length ? ` · 提前 ${adv.join("/")} 天预告` : ""}`;
  }
  if (s.scheduleType === "daily") return `每天 ${s.timeOfDay}`;
  if (s.scheduleType === "weekly") {
    const days = (s.weekdays || "1").split(",").map((n) => "一二三四五六日"[Number(n) - 1] ?? n);
    return `每周 ${days.join("、")} ${s.timeOfDay}`;
  }
  if (s.scheduleType === "monthly") return `每月 ${s.monthDays} 日 ${s.timeOfDay}`;
  return `Cron ${s.cronExpr}`;
}
