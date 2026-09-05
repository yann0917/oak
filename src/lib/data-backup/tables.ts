import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  bills,
  certArchives,
  chatMessages,
  chatSessions,
  childTeachers,
  children,
  enrollments,
  familyInsights,
  familySops,
  gardenCharacters,
  gardenMastery,
  gardenRecords,
  gardenSettings,
  growthRecords,
  healthRecords,
  learningRecords,
  moments,
  notebooks,
  notes,
  policyNotes,
  pushChannels,
  pushLogs,
  quickNotes,
  reminders,
  reminderRules,
  reviewCards,
  reviewLogs,
  schools,
  semesters,
  teachers,
  timetablePeriodOrder,
  timetableSlots,
  todoLists,
  todos,
  todoSteps,
} from "@/db/schema";

/**
 * 数据导出/导入的模块元数据（约 37 张业务表，不含配置/派生表）：
 * - excelColumns：Excel 展示列（业务字段，中文列头；id/userId/时间戳不展示）；
 * - sensitive：敏感列（导出脱敏为 ***，导入时 *** / 空值保留现有配置）；
 * - jsonCols：JSON 串列（Excel 里展开成可读文本，JSON 导出保持原文）；
 * - refs：外键引用（合并导入时重建新 id 映射）。
 * 排序即依赖顺序：父表在前（合并插入用），替换导入删除时反转。
 * 不导出：rag_chunks/rag_meta/rag_image_captions（派生数据，导入后重建）、
 * ai_settings/ai_providers/mcp_tokens（配置，apiKey 等不随数据走）、aiUsage（全局统计）。
 */

export interface BackupColumn {
  field: string;
  label: string;
}

export interface BackupTableDef {
  key: string;
  label: string;
  table: any; // drizzle sqlite table
  excelColumns: BackupColumn[];
  sensitive?: string[]; // 导出脱敏字段
  jsonCols?: string[]; // JSON 串列（Excel 展开）
  refs?: { column: string; refTable: string }[]; // 合并导入的外键映射
  /** 筛选行：默认 eq(table.userId, uid)；无 userId 的表用 byReminders（通过提醒归属） */
  noUserId?: boolean;
}

const tbl = (
  key: string,
  label: string,
  table: any,
  excelColumns: BackupColumn[],
  extra: Partial<Omit<BackupTableDef, "key" | "label" | "table" | "excelColumns">> = {}
): BackupTableDef => ({ key, label, table, excelColumns, ...extra });

export const BACKUP_TABLES: BackupTableDef[] = [
  // ===== 成员与教育 =====
  tbl("children", "成员", children, [
    { field: "name", label: "姓名" },
    { field: "nickname", label: "昵称" },
    { field: "gender", label: "性别" },
    { field: "birthday", label: "生日" },
    { field: "studentId", label: "学籍号" },
    { field: "photo", label: "照片路径" },
    { field: "notes", label: "备注" },
  ]),
  tbl("schools", "学校", schools, [
    { field: "name", label: "名称" },
    { field: "type", label: "类型" },
    { field: "address", label: "地址" },
    { field: "website", label: "网站" },
    { field: "phone", label: "电话" },
    { field: "intro", label: "简介" },
    { field: "notes", label: "备注" },
  ]),
  tbl("enrollments", "就读阶段", enrollments, [
    { field: "childId", label: "成员" },
    { field: "schoolId", label: "学校" },
    { field: "stage", label: "阶段" },
    { field: "className", label: "班级" },
    { field: "studentNo", label: "学号" },
    { field: "startDate", label: "开始日期" },
    { field: "endDate", label: "结束日期" },
    { field: "notes", label: "备注" },
  ], { refs: [{ column: "childId", refTable: "children" }, { column: "schoolId", refTable: "schools" }] }),
  tbl("teachers", "教师", teachers, [
    { field: "name", label: "姓名" },
    { field: "avatar", label: "头像路径" },
    { field: "gender", label: "性别" },
    { field: "age", label: "年龄" },
    { field: "subject", label: "科目" },
    { field: "schoolId", label: "学校" },
    { field: "phone", label: "电话" },
    { field: "notes", label: "备注" },
  ], { refs: [{ column: "schoolId", refTable: "schools" }] }),
  tbl("child_teachers", "师生关联", childTeachers, [
    { field: "childId", label: "成员" },
    { field: "teacherId", label: "教师" },
    { field: "stage", label: "阶段" },
    { field: "startDate", label: "开始日期" },
    { field: "endDate", label: "结束日期" },
    { field: "notes", label: "备注" },
  ], { refs: [{ column: "childId", refTable: "children" }, { column: "teacherId", refTable: "teachers" }] }),
  tbl("semesters", "学期", semesters, [
    { field: "childId", label: "成员" },
    { field: "name", label: "名称" },
    { field: "year", label: "年份" },
    { field: "startDate", label: "开始日期" },
    { field: "endDate", label: "结束日期" },
    { field: "stage", label: "阶段" },
    { field: "notes", label: "备注" },
  ], { refs: [{ column: "childId", refTable: "children" }] }),
  tbl("timetable_slots", "课程表", timetableSlots, [
    { field: "childId", label: "成员" },
    { field: "semesterId", label: "学期" },
    { field: "day", label: "星期" },
    { field: "period", label: "节次" },
    { field: "subject", label: "科目" },
    { field: "timeRange", label: "时间" },
    { field: "teacherName", label: "教师" },
    { field: "notes", label: "备注" },
  ], { refs: [{ column: "childId", refTable: "children" }, { column: "semesterId", refTable: "semesters" }] }),
  tbl("timetable_period_order", "节次排序", timetablePeriodOrder, [
    { field: "childId", label: "成员" },
    { field: "term", label: "学期名" },
    { field: "period", label: "节次" },
    { field: "idx", label: "顺序" },
  ], { refs: [{ column: "childId", refTable: "children" }] }),
  tbl("learning_records", "学习记录", learningRecords, [
    { field: "childId", label: "成员" },
    { field: "date", label: "日期" },
    { field: "semesterId", label: "学期" },
    { field: "subject", label: "学科" },
    { field: "grade", label: "成绩/评级" },
    { field: "evaluation", label: "评价" },
    { field: "content", label: "内容" },
  ], { refs: [{ column: "childId", refTable: "children" }, { column: "semesterId", refTable: "semesters" }] }),
  tbl("growth_records", "成长记录", growthRecords, [
    { field: "childId", label: "成员" },
    { field: "date", label: "日期" },
    { field: "height", label: "身高(cm)" },
    { field: "weight", label: "体重(kg)" },
    { field: "notes", label: "备注" },
  ], { refs: [{ column: "childId", refTable: "children" }] }),
  tbl("health_records", "健康档案", healthRecords, [
    { field: "childId", label: "成员" },
    { field: "type", label: "类型" },
    { field: "date", label: "日期" },
    { field: "title", label: "标题" },
    { field: "detail", label: "详情" },
    { field: "attachments", label: "附件" },
  ], { refs: [{ column: "childId", refTable: "children" }], jsonCols: ["attachments"] }),
  tbl("activities", "兴趣班", activities, [
    { field: "childId", label: "成员" },
    { field: "name", label: "名称" },
    { field: "category", label: "类别" },
    { field: "organization", label: "机构" },
    { field: "teacherName", label: "教师" },
    { field: "startDate", label: "开始日期" },
    { field: "endDate", label: "结束日期" },
    { field: "status", label: "状态" },
    { field: "progress", label: "进度" },
  ], { refs: [{ column: "childId", refTable: "children" }] }),
  tbl("moments", "时光", moments, [
    { field: "childId", label: "成员" },
    { field: "date", label: "日期" },
    { field: "title", label: "标题" },
    { field: "description", label: "描述" },
    { field: "photos", label: "照片" },
    { field: "tags", label: "标签" },
  ], { refs: [{ column: "childId", refTable: "children" }], jsonCols: ["photos", "tags"] }),
  tbl("bills", "账单", bills, [
    { field: "childId", label: "成员" },
    { field: "title", label: "标题" },
    { field: "type", label: "类型" },
    { field: "direction", label: "方向" },
    { field: "amount", label: "金额(元)" },
    { field: "date", label: "日期" },
    { field: "semesterId", label: "学期" },
    { field: "organization", label: "收费单位" },
    { field: "status", label: "状态" },
    { field: "notes", label: "备注" },
    { field: "attachments", label: "凭证" },
  ], { refs: [{ column: "childId", refTable: "children" }, { column: "semesterId", refTable: "semesters" }], jsonCols: ["attachments"] }),
  tbl("cert_archives", "卡证档案", certArchives, [
    { field: "childId", label: "成员" },
    { field: "category", label: "类别" },
    { field: "title", label: "标题" },
    { field: "number", label: "证号" },
    { field: "issuer", label: "签发单位" },
    { field: "issueDate", label: "签发日期" },
    { field: "expireDate", label: "到期日期" },
    { field: "content", label: "说明/识别原文" },
    { field: "notes", label: "备注" },
    { field: "attachments", label: "原件照片" },
  ], { refs: [{ column: "childId", refTable: "children" }], jsonCols: ["attachments"] }),
  tbl("policy_notes", "政策动态", policyNotes, [
    { field: "title", label: "标题" },
    { field: "issuer", label: "发布单位" },
    { field: "category", label: "类别" },
    { field: "date", label: "发布日期" },
    { field: "content", label: "内容" },
    { field: "link", label: "原文链接" },
    { field: "attachments", label: "附件" },
  ], { jsonCols: ["attachments"] }),
  tbl("quick_notes", "一句话快记", quickNotes, [
    { field: "childId", label: "成员" },
    { field: "content", label: "内容" },
    { field: "photos", label: "照片" },
    { field: "status", label: "归类状态" },
    { field: "aiType", label: "归类类型" },
    { field: "result", label: "归类结果" },
    { field: "processedAt", label: "归类时间" },
  ], { refs: [{ column: "childId", refTable: "children" }], jsonCols: ["photos", "result"] }),
  // ===== 提醒中心 =====
  tbl("reminders", "提醒", reminders, [
    { field: "childId", label: "成员" },
    { field: "title", label: "标题" },
    { field: "content", label: "内容" },
    { field: "attachments", label: "附件" },
    { field: "scheduleType", label: "周期类型" },
    { field: "cronExpr", label: "Cron 表达式" },
    { field: "timeOfDay", label: "触发时刻" },
    { field: "weekdays", label: "星期(周)" },
    { field: "monthDays", label: "日期(月)" },
    { field: "targetDate", label: "目标日期" },
    { field: "advanceDays", label: "提前天数" },
    { field: "nextRunAt", label: "下次触发" },
    { field: "timezone", label: "时区" },
    { field: "enabled", label: "启用" },
    { field: "retryCount", label: "重试次数" },
  ], { refs: [{ column: "childId", refTable: "children" }], jsonCols: ["attachments"] }),
  tbl("reminder_rules", "提醒规则", reminderRules, [
    { field: "reminderId", label: "提醒" },
    { field: "channels", label: "渠道" },
    { field: "quietHours", label: "静默期" },
    { field: "minIntervalMinutes", label: "最小间隔(分)" },
    { field: "maxRetries", label: "最大重试" },
    { field: "fallbackChannel", label: "兜底渠道" },
  ], { refs: [{ column: "reminderId", refTable: "reminders" }], noUserId: true }),
  tbl("push_channels", "推送渠道", pushChannels, [
    { field: "type", label: "类型" },
    { field: "config", label: "配置" },
    { field: "enabled", label: "启用" },
  ], { sensitive: ["config"] }),
  tbl("push_logs", "发送日志", pushLogs, [
    { field: "reminderId", label: "提醒" },
    { field: "channel", label: "渠道" },
    { field: "status", label: "状态" },
    { field: "content", label: "内容" },
    { field: "error", label: "错误" },
    { field: "read", label: "已读" },
    { field: "createdAt", label: "时间" },
  ], { refs: [{ column: "reminderId", refTable: "reminders" }] }),
  // ===== 笔记/待办 =====
  tbl("notebooks", "笔记本", notebooks, [
    { field: "name", label: "名称" },
    { field: "icon", label: "图标" },
  ]),
  tbl("notes", "笔记/错题", notes, [
    { field: "notebookId", label: "笔记本" },
    { field: "title", label: "标题" },
    { field: "content", label: "正文" },
    { field: "question", label: "复习卡问题" },
    { field: "answer", label: "复习卡答案" },
    { field: "tags", label: "标签" },
    { field: "source", label: "来源" },
    { field: "enabled", label: "参与复习" },
    { field: "kind", label: "类型" },
    { field: "contentFormat", label: "正文格式" },
  ], { refs: [{ column: "notebookId", refTable: "notebooks" }], jsonCols: ["tags"] }),
  tbl("review_cards", "复习卡", reviewCards, [
    { field: "noteId", label: "笔记" },
    { field: "due", label: "下次复习" },
    { field: "stability", label: "稳定性" },
    { field: "difficulty", label: "难度" },
    { field: "elapsedDays", label: "经过天数" },
    { field: "scheduledDays", label: "计划天数" },
    { field: "reps", label: "复习次数" },
    { field: "lapses", label: "遗忘次数" },
    { field: "state", label: "状态" },
    { field: "learningSteps", label: "学习步骤" },
    { field: "lastReview", label: "上次复习" },
  ], { refs: [{ column: "noteId", refTable: "notes" }] }),
  tbl("review_logs", "复习流水", reviewLogs, [
    { field: "noteId", label: "笔记" },
    { field: "rating", label: "评分" },
    { field: "state", label: "状态" },
    { field: "due", label: "下次复习" },
    { field: "stability", label: "稳定性" },
    { field: "difficulty", label: "难度" },
    { field: "elapsedDays", label: "经过天数" },
    { field: "scheduledDays", label: "计划天数" },
    { field: "reviewedAt", label: "复习时间" },
  ], { refs: [{ column: "noteId", refTable: "notes" }] }),
  tbl("todo_lists", "待办清单", todoLists, [
    { field: "name", label: "名称" },
    { field: "color", label: "颜色" },
  ]),
  tbl("todos", "待办", todos, [
    { field: "listId", label: "清单" },
    { field: "title", label: "标题" },
    { field: "note", label: "备注" },
    { field: "dueDate", label: "到期日" },
    { field: "remindAt", label: "提醒时间" },
    { field: "repeatRule", label: "重复规则" },
    { field: "priority", label: "重要标记" },
    { field: "myDayDate", label: "我的一天" },
    { field: "reminderId", label: "关联提醒" },
    { field: "done", label: "完成" },
    { field: "completedAt", label: "完成时间" },
  ], { refs: [{ column: "listId", refTable: "todo_lists" }, { column: "reminderId", refTable: "reminders" }] }),
  tbl("todo_steps", "待办步骤", todoSteps, [
    { field: "todoId", label: "待办" },
    { field: "title", label: "标题" },
    { field: "done", label: "完成" },
    { field: "sort", label: "排序" },
  ], { refs: [{ column: "todoId", refTable: "todos" }] }),
  // ===== 家庭洞察/学习园地 =====
  tbl("family_insights", "家庭洞察", familyInsights, [
    { field: "period", label: "周期" },
    { field: "startDate", label: "开始日期" },
    { field: "endDate", label: "结束日期" },
    { field: "status", label: "状态" },
    { field: "insights", label: "洞察结果" },
    { field: "error", label: "错误" },
  ], { jsonCols: ["insights"] }),
  tbl("family_sops", "家庭指南", familySops, [
    { field: "insightId", label: "来源洞察" },
    { field: "type", label: "类型" },
    { field: "insight", label: "经验" },
    { field: "actionSop", label: "行动 SOP" },
  ], { refs: [{ column: "insightId", refTable: "family_insights" }] }),
  tbl("garden_records", "练习记录", gardenRecords, [
    { field: "childId", label: "成员" },
    { field: "activity", label: "活动" },
    { field: "difficulty", label: "难度" },
    { field: "total", label: "题数" },
    { field: "correct", label: "答对" },
    { field: "durationSec", label: "用时(秒)" },
    { field: "wrongItems", label: "错题项" },
  ], { refs: [{ column: "childId", refTable: "children" }], jsonCols: ["wrongItems"] }),
  tbl("garden_settings", "练习配置", gardenSettings, [
    { field: "childId", label: "成员" },
    { field: "activity", label: "活动" },
    { field: "difficulty", label: "难度" },
    { field: "config", label: "配置" },
  ], { refs: [{ column: "childId", refTable: "children" }], jsonCols: ["config"] }),
  tbl("garden_mastery", "知识掌握度", gardenMastery, [
    { field: "childId", label: "成员" },
    { field: "activity", label: "活动" },
    { field: "itemKey", label: "知识点键" },
    { field: "label", label: "知识点" },
    { field: "correctCount", label: "答对次数" },
    { field: "wrongCount", label: "答错次数" },
    { field: "lastCorrect", label: "最近答对" },
  ], { refs: [{ column: "childId", refTable: "children" }] }),
  tbl("garden_characters", "识字字库", gardenCharacters, [
    { field: "childId", label: "成员" },
    { field: "char", label: "汉字" },
    { field: "pinyin", label: "拼音" },
    { field: "word", label: "组词" },
    { field: "tier", label: "难度档" },
  ], { refs: [{ column: "childId", refTable: "children" }] }),
  // ===== AI 对话 =====
  tbl("chat_sessions", "AI 会话", chatSessions, [
    { field: "title", label: "标题" },
  ]),
  tbl("chat_messages", "AI 消息", chatMessages, [
    { field: "sessionId", label: "会话" },
    { field: "role", label: "角色" },
    { field: "content", label: "内容" },
    { field: "data", label: "工具调用摘要" },
  ], { refs: [{ column: "sessionId", refTable: "chat_sessions" }], jsonCols: ["data"] }),
];

const byKey = new Map(BACKUP_TABLES.map((t) => [t.key, t]));

/** 附件/照片收集映射：表 key → 列名（JSON 数组列或单路径列） */
export const FILE_COLUMNS: { table: string; column: string; single?: boolean }[] = [
  { table: "children", column: "photo", single: true },
  { table: "teachers", column: "avatar", single: true },
  { table: "health_records", column: "attachments" },
  { table: "moments", column: "photos" },
  { table: "bills", column: "attachments" },
  { table: "cert_archives", column: "attachments" },
  { table: "policy_notes", column: "attachments" },
  { table: "reminders", column: "attachments" },
  { table: "quick_notes", column: "photos" },
];

export function getTableDef(key: string) {
  return byKey.get(key);
}

/** 读取某用户某表全部行（EXCLUDE userId；reminder_rules 无 user_id，按提醒归属过滤） */
export function getRows(uid: number, def: BackupTableDef): Record<string, unknown>[] {
  if (def.key === "reminder_rules") {
    const reminderIds = db
      .select({ id: reminders.id })
      .from(reminders)
      .where(eq(reminders.userId, uid))
      .all()
      .map((r) => r.id);
    if (!reminderIds.length) return [];
    return db
      .select()
      .from(def.table)
      .where(inArray(def.table.reminderId as any, reminderIds))
      .all()
      .map((r: any) => ({ ...r }));
  }
  return db
    .select()
    .from(def.table)
    .where(eq(def.table.userId, uid))
    .all()
    .map((r: any) => {
      const { userId: _u, ...row } = r;
      return row;
    });
}
