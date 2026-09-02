// 由 scripts/gen-api-perms.mjs 自动生成（npm run build 前执行），请勿手改。
// 接口权限点清单：角色分配权限时按「接口权限」目录勾选生效。

export interface ApiPermDef {
  resource: string;
  perms: string;
  label: string;
}

export const API_PERMS: ApiPermDef[] = [
  {
    "resource": "activities",
    "perms": "api:activities:create",
    "label": "兴趣班·新增"
  },
  {
    "resource": "activities",
    "perms": "api:activities:delete",
    "label": "兴趣班·删除"
  },
  {
    "resource": "activities",
    "perms": "api:activities:detail",
    "label": "兴趣班·查看详情"
  },
  {
    "resource": "activities",
    "perms": "api:activities:list",
    "label": "兴趣班·查看列表"
  },
  {
    "resource": "activities",
    "perms": "api:activities:update",
    "label": "兴趣班·修改"
  },
  {
    "resource": "ai-chat",
    "perms": "api:ai-chat:create",
    "label": "AI 助手·新增"
  },
  {
    "resource": "ai-chat-sessions",
    "perms": "api:ai-chat-sessions:create",
    "label": "AI 会话·新增"
  },
  {
    "resource": "ai-chat-sessions",
    "perms": "api:ai-chat-sessions:delete",
    "label": "AI 会话·删除"
  },
  {
    "resource": "ai-chat-sessions",
    "perms": "api:ai-chat-sessions:detail",
    "label": "AI 会话·查看详情"
  },
  {
    "resource": "ai-chat-sessions",
    "perms": "api:ai-chat-sessions:list",
    "label": "AI 会话·查看列表"
  },
  {
    "resource": "ai-providers",
    "perms": "api:ai-providers:create",
    "label": "模型配置·新增"
  },
  {
    "resource": "ai-providers",
    "perms": "api:ai-providers:delete",
    "label": "模型配置·删除"
  },
  {
    "resource": "ai-providers",
    "perms": "api:ai-providers:update",
    "label": "模型配置·修改"
  },
  {
    "resource": "ai-settings",
    "perms": "api:ai-settings:balance-get",
    "label": "AI 设置·balance-get"
  },
  {
    "resource": "ai-settings",
    "perms": "api:ai-settings:create",
    "label": "AI 设置·新增"
  },
  {
    "resource": "ai-settings",
    "perms": "api:ai-settings:list",
    "label": "AI 设置·查看列表"
  },
  {
    "resource": "ai-settings",
    "perms": "api:ai-settings:rag-get",
    "label": "AI 设置·rag-get"
  },
  {
    "resource": "ai-settings",
    "perms": "api:ai-settings:rag-post",
    "label": "AI 设置·rag-post"
  },
  {
    "resource": "ai-settings",
    "perms": "api:ai-settings:test-post",
    "label": "AI 设置·测试推送"
  },
  {
    "resource": "bills",
    "perms": "api:bills:create",
    "label": "账单·新增"
  },
  {
    "resource": "bills",
    "perms": "api:bills:delete",
    "label": "账单·删除"
  },
  {
    "resource": "bills",
    "perms": "api:bills:detail",
    "label": "账单·查看详情"
  },
  {
    "resource": "bills",
    "perms": "api:bills:list",
    "label": "账单·查看列表"
  },
  {
    "resource": "bills",
    "perms": "api:bills:update",
    "label": "账单·修改"
  },
  {
    "resource": "cert-archives",
    "perms": "api:cert-archives:create",
    "label": "卡证档案·新增"
  },
  {
    "resource": "cert-archives",
    "perms": "api:cert-archives:delete",
    "label": "卡证档案·删除"
  },
  {
    "resource": "cert-archives",
    "perms": "api:cert-archives:detail",
    "label": "卡证档案·查看详情"
  },
  {
    "resource": "cert-archives",
    "perms": "api:cert-archives:list",
    "label": "卡证档案·查看列表"
  },
  {
    "resource": "cert-archives",
    "perms": "api:cert-archives:update",
    "label": "卡证档案·修改"
  },
  {
    "resource": "child-teachers",
    "perms": "api:child-teachers:create",
    "label": "师生关联·新增"
  },
  {
    "resource": "child-teachers",
    "perms": "api:child-teachers:delete",
    "label": "师生关联·删除"
  },
  {
    "resource": "child-teachers",
    "perms": "api:child-teachers:detail",
    "label": "师生关联·查看详情"
  },
  {
    "resource": "child-teachers",
    "perms": "api:child-teachers:list",
    "label": "师生关联·查看列表"
  },
  {
    "resource": "child-teachers",
    "perms": "api:child-teachers:update",
    "label": "师生关联·修改"
  },
  {
    "resource": "children",
    "perms": "api:children:create",
    "label": "成员·新增"
  },
  {
    "resource": "children",
    "perms": "api:children:delete",
    "label": "成员·删除"
  },
  {
    "resource": "children",
    "perms": "api:children:detail",
    "label": "成员·查看详情"
  },
  {
    "resource": "children",
    "perms": "api:children:list",
    "label": "成员·查看列表"
  },
  {
    "resource": "children",
    "perms": "api:children:update",
    "label": "成员·修改"
  },
  {
    "resource": "enrollments",
    "perms": "api:enrollments:create",
    "label": "就读阶段·新增"
  },
  {
    "resource": "enrollments",
    "perms": "api:enrollments:delete",
    "label": "就读阶段·删除"
  },
  {
    "resource": "enrollments",
    "perms": "api:enrollments:detail",
    "label": "就读阶段·查看详情"
  },
  {
    "resource": "enrollments",
    "perms": "api:enrollments:list",
    "label": "就读阶段·查看列表"
  },
  {
    "resource": "enrollments",
    "perms": "api:enrollments:update",
    "label": "就读阶段·修改"
  },
  {
    "resource": "family-sops",
    "perms": "api:family-sops:create",
    "label": "家庭指南·新增"
  },
  {
    "resource": "family-sops",
    "perms": "api:family-sops:delete",
    "label": "家庭指南·删除"
  },
  {
    "resource": "family-sops",
    "perms": "api:family-sops:detail",
    "label": "家庭指南·查看详情"
  },
  {
    "resource": "family-sops",
    "perms": "api:family-sops:update",
    "label": "家庭指南·修改"
  },
  {
    "resource": "garden-characters",
    "perms": "api:garden-characters:create",
    "label": "识字字库·新增"
  },
  {
    "resource": "garden-characters",
    "perms": "api:garden-characters:delete",
    "label": "识字字库·删除"
  },
  {
    "resource": "garden-characters",
    "perms": "api:garden-characters:detail",
    "label": "识字字库·查看详情"
  },
  {
    "resource": "garden-characters",
    "perms": "api:garden-characters:list",
    "label": "识字字库·查看列表"
  },
  {
    "resource": "garden-characters",
    "perms": "api:garden-characters:update",
    "label": "识字字库·修改"
  },
  {
    "resource": "garden-mastery",
    "perms": "api:garden-mastery:list",
    "label": "知识掌握度·查看列表"
  },
  {
    "resource": "garden-records",
    "perms": "api:garden-records:create",
    "label": "练习记录·新增"
  },
  {
    "resource": "garden-records",
    "perms": "api:garden-records:list",
    "label": "练习记录·查看列表"
  },
  {
    "resource": "garden-settings",
    "perms": "api:garden-settings:create",
    "label": "练习配置·新增"
  },
  {
    "resource": "garden-settings",
    "perms": "api:garden-settings:list",
    "label": "练习配置·查看列表"
  },
  {
    "resource": "growth-records",
    "perms": "api:growth-records:create",
    "label": "成长记录·新增"
  },
  {
    "resource": "growth-records",
    "perms": "api:growth-records:delete",
    "label": "成长记录·删除"
  },
  {
    "resource": "growth-records",
    "perms": "api:growth-records:detail",
    "label": "成长记录·查看详情"
  },
  {
    "resource": "growth-records",
    "perms": "api:growth-records:list",
    "label": "成长记录·查看列表"
  },
  {
    "resource": "growth-records",
    "perms": "api:growth-records:update",
    "label": "成长记录·修改"
  },
  {
    "resource": "health-records",
    "perms": "api:health-records:create",
    "label": "健康档案·新增"
  },
  {
    "resource": "health-records",
    "perms": "api:health-records:delete",
    "label": "健康档案·删除"
  },
  {
    "resource": "health-records",
    "perms": "api:health-records:detail",
    "label": "健康档案·查看详情"
  },
  {
    "resource": "health-records",
    "perms": "api:health-records:list",
    "label": "健康档案·查看列表"
  },
  {
    "resource": "health-records",
    "perms": "api:health-records:update",
    "label": "健康档案·修改"
  },
  {
    "resource": "insights",
    "perms": "api:insights:generate-post",
    "label": "家庭洞察·generate-post"
  },
  {
    "resource": "insights",
    "perms": "api:insights:list",
    "label": "家庭洞察·查看列表"
  },
  {
    "resource": "learning-records",
    "perms": "api:learning-records:create",
    "label": "学习记录·新增"
  },
  {
    "resource": "learning-records",
    "perms": "api:learning-records:delete",
    "label": "学习记录·删除"
  },
  {
    "resource": "learning-records",
    "perms": "api:learning-records:detail",
    "label": "学习记录·查看详情"
  },
  {
    "resource": "learning-records",
    "perms": "api:learning-records:list",
    "label": "学习记录·查看列表"
  },
  {
    "resource": "learning-records",
    "perms": "api:learning-records:update",
    "label": "学习记录·修改"
  },
  {
    "resource": "moments",
    "perms": "api:moments:create",
    "label": "时光相册·新增"
  },
  {
    "resource": "moments",
    "perms": "api:moments:delete",
    "label": "时光相册·删除"
  },
  {
    "resource": "moments",
    "perms": "api:moments:detail",
    "label": "时光相册·查看详情"
  },
  {
    "resource": "moments",
    "perms": "api:moments:list",
    "label": "时光相册·查看列表"
  },
  {
    "resource": "moments",
    "perms": "api:moments:update",
    "label": "时光相册·修改"
  },
  {
    "resource": "notebooks",
    "perms": "api:notebooks:create",
    "label": "笔记本·新增"
  },
  {
    "resource": "notebooks",
    "perms": "api:notebooks:delete",
    "label": "笔记本·删除"
  },
  {
    "resource": "notebooks",
    "perms": "api:notebooks:list",
    "label": "笔记本·查看列表"
  },
  {
    "resource": "notebooks",
    "perms": "api:notebooks:update",
    "label": "笔记本·修改"
  },
  {
    "resource": "notes",
    "perms": "api:notes:create",
    "label": "错题/笔记·新增"
  },
  {
    "resource": "notes",
    "perms": "api:notes:delete",
    "label": "错题/笔记·删除"
  },
  {
    "resource": "notes",
    "perms": "api:notes:detail",
    "label": "错题/笔记·查看详情"
  },
  {
    "resource": "notes",
    "perms": "api:notes:list",
    "label": "错题/笔记·查看列表"
  },
  {
    "resource": "notes",
    "perms": "api:notes:update",
    "label": "错题/笔记·修改"
  },
  {
    "resource": "policy-notes",
    "perms": "api:policy-notes:create",
    "label": "政策动态·新增"
  },
  {
    "resource": "policy-notes",
    "perms": "api:policy-notes:delete",
    "label": "政策动态·删除"
  },
  {
    "resource": "policy-notes",
    "perms": "api:policy-notes:detail",
    "label": "政策动态·查看详情"
  },
  {
    "resource": "policy-notes",
    "perms": "api:policy-notes:list",
    "label": "政策动态·查看列表"
  },
  {
    "resource": "policy-notes",
    "perms": "api:policy-notes:update",
    "label": "政策动态·修改"
  },
  {
    "resource": "push-channels",
    "perms": "api:push-channels:create",
    "label": "推送渠道·新增"
  },
  {
    "resource": "push-channels",
    "perms": "api:push-channels:delete",
    "label": "推送渠道·删除"
  },
  {
    "resource": "push-channels",
    "perms": "api:push-channels:list",
    "label": "推送渠道·查看列表"
  },
  {
    "resource": "push-channels",
    "perms": "api:push-channels:test-post",
    "label": "推送渠道·测试推送"
  },
  {
    "resource": "push-channels",
    "perms": "api:push-channels:update",
    "label": "推送渠道·修改"
  },
  {
    "resource": "quick-notes",
    "perms": "api:quick-notes:create",
    "label": "一句话快记·新增"
  },
  {
    "resource": "quick-notes",
    "perms": "api:quick-notes:delete",
    "label": "一句话快记·删除"
  },
  {
    "resource": "quick-notes",
    "perms": "api:quick-notes:list",
    "label": "一句话快记·查看列表"
  },
  {
    "resource": "quick-notes",
    "perms": "api:quick-notes:update",
    "label": "一句话快记·修改"
  },
  {
    "resource": "reminders",
    "perms": "api:reminders:create",
    "label": "提醒中心·新增"
  },
  {
    "resource": "reminders",
    "perms": "api:reminders:delete",
    "label": "提醒中心·删除"
  },
  {
    "resource": "reminders",
    "perms": "api:reminders:list",
    "label": "提醒中心·查看列表"
  },
  {
    "resource": "reminders",
    "perms": "api:reminders:logs-delete",
    "label": "提醒中心·logs-delete"
  },
  {
    "resource": "reminders",
    "perms": "api:reminders:logs-get",
    "label": "提醒中心·发送日志"
  },
  {
    "resource": "reminders",
    "perms": "api:reminders:logs-read-post",
    "label": "提醒中心·标记已读"
  },
  {
    "resource": "reminders",
    "perms": "api:reminders:notifications-get",
    "label": "提醒中心·站内通知"
  },
  {
    "resource": "reminders",
    "perms": "api:reminders:test-post",
    "label": "提醒中心·测试推送"
  },
  {
    "resource": "reminders",
    "perms": "api:reminders:toggle-post",
    "label": "提醒中心·开关"
  },
  {
    "resource": "reminders",
    "perms": "api:reminders:update",
    "label": "提醒中心·修改"
  },
  {
    "resource": "review",
    "perms": "api:review:create",
    "label": "错题复习·新增"
  },
  {
    "resource": "review",
    "perms": "api:review:list",
    "label": "错题复习·查看列表"
  },
  {
    "resource": "schools",
    "perms": "api:schools:create",
    "label": "学校·新增"
  },
  {
    "resource": "schools",
    "perms": "api:schools:delete",
    "label": "学校·删除"
  },
  {
    "resource": "schools",
    "perms": "api:schools:list",
    "label": "学校·查看列表"
  },
  {
    "resource": "semesters",
    "perms": "api:semesters:create",
    "label": "学期·新增"
  },
  {
    "resource": "semesters",
    "perms": "api:semesters:delete",
    "label": "学期·删除"
  },
  {
    "resource": "semesters",
    "perms": "api:semesters:detail",
    "label": "学期·查看详情"
  },
  {
    "resource": "semesters",
    "perms": "api:semesters:list",
    "label": "学期·查看列表"
  },
  {
    "resource": "semesters",
    "perms": "api:semesters:update",
    "label": "学期·修改"
  },
  {
    "resource": "stats",
    "perms": "api:stats:list",
    "label": "复习统计·查看列表"
  },
  {
    "resource": "teachers",
    "perms": "api:teachers:create",
    "label": "教师·新增"
  },
  {
    "resource": "teachers",
    "perms": "api:teachers:delete",
    "label": "教师·删除"
  },
  {
    "resource": "teachers",
    "perms": "api:teachers:detail",
    "label": "教师·查看详情"
  },
  {
    "resource": "teachers",
    "perms": "api:teachers:list",
    "label": "教师·查看列表"
  },
  {
    "resource": "teachers",
    "perms": "api:teachers:update",
    "label": "教师·修改"
  },
  {
    "resource": "timetable-period-order",
    "perms": "api:timetable-period-order:list",
    "label": "节次排序·查看列表"
  },
  {
    "resource": "timetable-slots",
    "perms": "api:timetable-slots:create",
    "label": "课程表·新增"
  },
  {
    "resource": "timetable-slots",
    "perms": "api:timetable-slots:delete",
    "label": "课程表·删除"
  },
  {
    "resource": "timetable-slots",
    "perms": "api:timetable-slots:detail",
    "label": "课程表·查看详情"
  },
  {
    "resource": "timetable-slots",
    "perms": "api:timetable-slots:list",
    "label": "课程表·查看列表"
  },
  {
    "resource": "timetable-slots",
    "perms": "api:timetable-slots:update",
    "label": "课程表·修改"
  },
  {
    "resource": "todo-lists",
    "perms": "api:todo-lists:create",
    "label": "待办清单·新增"
  },
  {
    "resource": "todo-lists",
    "perms": "api:todo-lists:delete",
    "label": "待办清单·删除"
  },
  {
    "resource": "todo-lists",
    "perms": "api:todo-lists:list",
    "label": "待办清单·查看列表"
  },
  {
    "resource": "todo-lists",
    "perms": "api:todo-lists:update",
    "label": "待办清单·修改"
  },
  {
    "resource": "todo-steps",
    "perms": "api:todo-steps:create",
    "label": "待办步骤·新增"
  },
  {
    "resource": "todo-steps",
    "perms": "api:todo-steps:delete",
    "label": "待办步骤·删除"
  },
  {
    "resource": "todo-steps",
    "perms": "api:todo-steps:update",
    "label": "待办步骤·修改"
  },
  {
    "resource": "todos",
    "perms": "api:todos:create",
    "label": "待办·新增"
  },
  {
    "resource": "todos",
    "perms": "api:todos:delete",
    "label": "待办·删除"
  },
  {
    "resource": "todos",
    "perms": "api:todos:list",
    "label": "待办·查看列表"
  },
  {
    "resource": "todos",
    "perms": "api:todos:toggle-post",
    "label": "待办·开关"
  },
  {
    "resource": "todos",
    "perms": "api:todos:update",
    "label": "待办·修改"
  },
  {
    "resource": "tts",
    "perms": "api:tts:synthesize",
    "label": "语音朗读·语音合成"
  },
  {
    "resource": "upload",
    "perms": "api:upload:upload",
    "label": "文件上传·上传文件"
  }
];
