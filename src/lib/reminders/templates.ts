/** 预置提醒模板：家长零门槛创建。变量：{{member}} {{days_left}} {{target_date}} */
export interface ReminderTemplate {
  key: string;
  label: string;
  icon: string; // lucide 图标名，仅展示用（见 lucide.dev/icons）
  desc: string;
  title: string;
  content: string;
  scheduleType: "once" | "daily" | "weekly" | "monthly" | "cron";
  advanceDays?: string; // 提前预告天数，逗号分隔
}

export const REMINDER_TEMPLATES: ReminderTemplate[] = [
  {
    key: "vaccine",
    label: "疫苗接种",
    icon: "Syringe",
    desc: "下一针接种前 3 天开始提醒",
    title: "{{member}} 疫苗接种提醒",
    content:
      "{{member}} 距离疫苗接种还有 {{days_left}} 天（{{target_date}}），请按时到接种点接种，记得携带接种证。",
    scheduleType: "once",
    advanceDays: "3",
  },
  {
    key: "medication",
    label: "用药提醒",
    icon: "Pill",
    desc: "每日按时服药提醒",
    title: "{{member}} 用药提醒",
    content:
      "{{member}} 请记得按时服药，每日 {{target_date}} 遵照医嘱服用，不可自行增减剂量。",
    scheduleType: "daily",
  },
  {
    key: "fee",
    label: "缴费截止",
    icon: "Wallet",
    desc: "截止前 7/3/1 天三次预告 + 截止日",
    title: "{{member}} 缴费截止提醒",
    content:
      "{{member}} 距离缴费截止还有 {{days_left}} 天（{{target_date}}），请及时完成缴纳，避免影响正常就读。",
    scheduleType: "once",
    advanceDays: "7,3,1",
  },
  {
    key: "meeting",
    label: "家长会",
    icon: "School",
    desc: "一次性时间点提醒",
    title: "{{member}} 家长会提醒",
    content:
      "{{member}} 家长会将于 {{target_date}} 举行，请提前安排好时间。地点：班级教室。如无法到场请提前与老师沟通。",
    scheduleType: "once",
    advanceDays: "1",
  },
  {
    key: "custom",
    label: "自定义",
    icon: "Pencil",
    desc: "自由设置周期与内容",
    title: "",
    content: "",
    scheduleType: "once",
  },
];
