/** 预置提醒模板：家长零门槛创建。变量：{{child}} {{days_left}} {{target_date}} */
export interface ReminderTemplate {
  key: string;
  label: string;
  icon: string; // emoji，仅展示用
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
    icon: "💉",
    desc: "下一针接种前 3 天开始提醒",
    title: "{{child}} 疫苗接种提醒",
    content:
      "{{child}} 距离疫苗接种还有 {{days_left}} 天（{{target_date}}），请按时到接种点接种，记得携带接种证。",
    scheduleType: "once",
    advanceDays: "3",
  },
  {
    key: "vision",
    label: "视力检查",
    icon: "👀",
    desc: "每年 1 次定期视力检查",
    title: "{{child}} 视力检查提醒",
    content:
      "{{child}} 距离视力检查还有 {{days_left}} 天（{{target_date}}），晚上适当减少电子屏幕时间，为检查做好准备。",
    scheduleType: "once",
    advanceDays: "7,3,1",
  },
  {
    key: "fee",
    label: "缴费截止",
    icon: "💰",
    desc: "截止前 7/3/1 天三次预告 + 截止日",
    title: "{{child}} 缴费截止提醒",
    content:
      "{{child}} 距离缴费截止还有 {{days_left}} 天（{{target_date}}），请及时完成缴纳，避免影响正常就读。",
    scheduleType: "once",
    advanceDays: "7,3,1",
  },
  {
    key: "meeting",
    label: "家长会",
    icon: "🏫",
    desc: "一次性时间点提醒",
    title: "{{child}} 家长会提醒",
    content:
      "{{child}} 家长会将于 {{target_date}} 举行，请提前安排好时间。地点：班级教室。如无法到场请提前与老师沟通。",
    scheduleType: "once",
    advanceDays: "1",
  },
  {
    key: "custom",
    label: "自定义",
    icon: "✏️",
    desc: "自由设置周期与内容",
    title: "",
    content: "",
    scheduleType: "once",
  },
];
