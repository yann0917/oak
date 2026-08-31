/**
 * 快记归类类型元信息：首页 feed 展示与 AI/手动归类共用。
 * childScoped=true 的类型必须落到具体成员，否则只保留原始流水。
 */
export const QUICK_TYPES = [
  "health",
  "fee",
  "growth",
  "moment",
  "learning",
  "reminder",
  "todo",
  "cert",
  "policy",
  "other",
] as const;

export type QuickType = (typeof QUICK_TYPES)[number];

export interface QuickTypeMeta {
  label: string;
  color: string;
  /** 目标模块路径（未落库时为空） */
  path: string;
  childScoped: boolean;
}

export const QUICK_TYPE_META: Record<QuickType, QuickTypeMeta> = {
  health: { label: "健康档案", color: "app-green", path: "/health", childScoped: true },
  fee: { label: "账单", color: "app-blue", path: "/bills", childScoped: true },
  growth: { label: "成长记录", color: "app-teal", path: "/growth", childScoped: true },
  moment: { label: "时光相册", color: "app-yellow", path: "/moments", childScoped: true },
  learning: { label: "学习记录", color: "app-orange", path: "/learning", childScoped: true },
  reminder: { label: "提醒中心", color: "purple", path: "/reminders", childScoped: false },
  todo: { label: "待办", color: "warm-peach-pink", path: "/tools/todo", childScoped: false },
  cert: { label: "卡证档案", color: "app-blue", path: "/certs", childScoped: false },
  policy: { label: "政策动态", color: "app-blue", path: "/policies", childScoped: false },
  other: { label: "原始记录", color: "default", path: "", childScoped: false },
};

/** 手动归类可选的类型（未配置 AI 的降级路径；reminder 需目标日期，手动暂不支持） */
export const MANUAL_TYPES: QuickType[] = [
  "health",
  "fee",
  "growth",
  "moment",
  "learning",
  "todo",
  "cert",
  "policy",
  "other",
];
