import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bills,
  certArchives,
  chatMessages,
  childTeachers,
  children,
  enrollments,
  familyInsights,
  familySops,
  growthRecords,
  healthRecords,
  learningRecords,
  moments,
  notes,
  policyNotes,
  quickNotes,
  reminders,
  schools,
  teachers,
} from "@/db/schema";
import { collectImagePaths, getCaption } from "./images";

/**
 * RAG 语料抽取：把该用户的自由文本数据展开成「文档」，metadata 带来源信息。
 * text 只放正文（不含来源前缀），module/title/date 由 metadata 承载，注入时再拼来源。
 * 全部只读、按 userId 过滤；结构化查询（数字/日期/金额）仍由 AI 数据工具负责，这里只做文本记忆检索。
 */

export interface CorpusDoc {
  docKey: string; // 来源标识，如 quick_notes:12
  childId: number | null;
  date: string; // 业务日期 YYYY-MM-DD，无则取创建日
  title: string; // 展示标题（可为空）
  module: string; // 中文字段名（注入标注用）
  text: string;
}

function dateOf(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s ? s.slice(0, 10) : "";
}

function joinText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim())
    .join("\n");
}

function tryParseJson<T = unknown>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** novel(TipTap) JSON → 纯文本；非 JSON 时粗暴去 HTML 标签兜底 */
function tiptapToText(json: string): string {
  try {
    const doc = JSON.parse(json);
    const walk = (node: any): string => {
      if (!node || typeof node !== "object") return "";
      const parts: string[] = [];
      if (typeof node.text === "string") parts.push(node.text);
      if (Array.isArray(node.content)) for (const c of node.content) parts.push(walk(c));
      return parts.join("");
    };
    return walk(doc).trim();
  } catch {
    return json.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

/** Markdown → 纯文本（去公式符号/链接保留文字/代码块/强调符号），公式 $...$ 内容保留 */
function mdToText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/^```\w*\n?/, "").replace(/\n```$/, ""))
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildCorpus(userId: number): CorpusDoc[] {
  const docs: CorpusDoc[] = [];

  // 快记：原始一句话 + AI 摘要 + 图片 OCR 原文（最长 2000 字保留）
  for (const r of db
    .select({
      id: quickNotes.id,
      childId: quickNotes.childId,
      content: quickNotes.content,
      result: quickNotes.result,
      createdAt: quickNotes.createdAt,
    })
    .from(quickNotes)
    .where(eq(quickNotes.userId, userId))
    .orderBy(desc(quickNotes.id))
    .all()) {
    const res = tryParseJson<{ summary?: string; ocrText?: string }>(r.result, {});
    const text = joinText([r.content, res.summary, res.ocrText]);
    if (text) docs.push({ docKey: `quick_notes:${r.id}`, childId: r.childId, date: dateOf(r.createdAt), title: "", module: "快记", text });
  }

  // 卡证档案：含图片识别原文（身份证等全文）、证号、签发单位
  for (const r of db
    .select({
      id: certArchives.id,
      childId: certArchives.childId,
      title: certArchives.title,
      number: certArchives.number,
      issuer: certArchives.issuer,
      issueDate: certArchives.issueDate,
      expireDate: certArchives.expireDate,
      content: certArchives.content,
      notes: certArchives.notes,
    })
    .from(certArchives)
    .where(eq(certArchives.userId, userId))
    .all()) {
    const meta = joinText([r.number && `证件号：${r.number}`, r.issuer && `签发单位：${r.issuer}`, r.issueDate && `签发日期：${r.issueDate}`, r.expireDate && `到期日期：${r.expireDate}`]);
    const text = joinText([meta, r.content, r.notes]);
    if (text) docs.push({ docKey: `cert_archives:${r.id}`, childId: r.childId, date: r.issueDate || "", title: r.title, module: "卡证档案", text });
  }

  // 时光相册：标题 + 描述 + 标签
  for (const r of db
    .select({
      id: moments.id,
      childId: moments.childId,
      date: moments.date,
      title: moments.title,
      description: moments.description,
      tags: moments.tags,
    })
    .from(moments)
    .where(eq(moments.userId, userId))
    .all()) {
    const text = joinText([r.tags && `标签：${r.tags}`, r.description]);
    if (text) docs.push({ docKey: `moments:${r.id}`, childId: r.childId, date: r.date, title: r.title, module: "时光相册", text });
  }

  // 笔记/错题：正文（TipTap JSON）+ 复习卡正反面（Markdown）
  for (const r of db
    .select({
      id: notes.id,
      title: notes.title,
      content: notes.content,
      question: notes.question,
      answer: notes.answer,
      tags: notes.tags,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(eq(notes.userId, userId))
    .all()) {
    const body = tiptapToText(r.content);
    const q = mdToText(r.question);
    const a = mdToText(r.answer);
    const text = joinText([r.tags && `标签：${mdToText(r.tags)}`, body && `正文：${body}`, q && `题目：${q}`, a && `答案：${a}`]);
    if (text) docs.push({ docKey: `notes:${r.id}`, childId: null, date: dateOf(r.updatedAt), title: r.title, module: "笔记/错题", text });
  }

  // 政策动态
  for (const r of db
    .select({ id: policyNotes.id, title: policyNotes.title, issuer: policyNotes.issuer, category: policyNotes.category, date: policyNotes.date, content: policyNotes.content, link: policyNotes.link })
    .from(policyNotes)
    .where(eq(policyNotes.userId, userId))
    .all()) {
    const text = joinText([r.issuer && `发布单位：${r.issuer}`, r.category && `类别：${r.category}`, r.content, r.link && `链接：${r.link}`]);
    if (text) docs.push({ docKey: `policy_notes:${r.id}`, childId: null, date: r.date, title: r.title, module: "政策动态", text });
  }

  // 健康档案
  for (const r of db
    .select({ id: healthRecords.id, childId: healthRecords.childId, type: healthRecords.type, date: healthRecords.date, title: healthRecords.title, detail: healthRecords.detail })
    .from(healthRecords)
    .where(eq(healthRecords.userId, userId))
    .all()) {
    const text = joinText([r.type && `类型：${r.type}`, r.detail]);
    if (text) docs.push({ docKey: `health_records:${r.id}`, childId: r.childId, date: r.date, title: r.title, module: "健康档案", text });
  }

  // 学习记录
  for (const r of db
    .select({ id: learningRecords.id, childId: learningRecords.childId, date: learningRecords.date, subject: learningRecords.subject, grade: learningRecords.grade, evaluation: learningRecords.evaluation, content: learningRecords.content })
    .from(learningRecords)
    .where(eq(learningRecords.userId, userId))
    .all()) {
    const text = joinText([r.subject && `学科：${r.subject}`, r.grade && `成绩/评级：${r.grade}`, r.evaluation && `评价：${r.evaluation}`, r.content]);
    if (text) docs.push({ docKey: `learning_records:${r.id}`, childId: r.childId, date: r.date, title: "", module: "学习记录", text });
  }

  // 成长记录
  for (const r of db
    .select({ id: growthRecords.id, childId: growthRecords.childId, date: growthRecords.date, height: growthRecords.height, weight: growthRecords.weight, notes: growthRecords.notes })
    .from(growthRecords)
    .where(eq(growthRecords.userId, userId))
    .all()) {
    const text = joinText([r.height ? `身高：${r.height}cm` : "", r.weight ? `体重：${r.weight}kg` : "", r.notes]);
    if (text) docs.push({ docKey: `growth_records:${r.id}`, childId: r.childId, date: r.date, title: "", module: "成长记录", text });
  }

  // 提醒
  for (const r of db
    .select({ id: reminders.id, childId: reminders.childId, title: reminders.title, content: reminders.content, scheduleType: reminders.scheduleType, targetDate: reminders.targetDate })
    .from(reminders)
    .where(eq(reminders.userId, userId))
    .all()) {
    const text = joinText([r.content, r.scheduleType && `类型：${r.scheduleType}`, r.targetDate && `事件日期：${r.targetDate}`]);
    if (text) docs.push({ docKey: `reminders:${r.id}`, childId: r.childId, date: r.targetDate, title: r.title, module: "提醒中心", text });
  }

  // 账单（金额/日期结构化信息一并入文本，便于"上次学费多少"这类语义召回）
  for (const r of db
    .select({ id: bills.id, childId: bills.childId, title: bills.title, type: bills.type, direction: bills.direction, amount: bills.amount, date: bills.date, organization: bills.organization, status: bills.status, notes: bills.notes })
    .from(bills)
    .where(eq(bills.userId, userId))
    .all()) {
    const text = joinText([
      `${r.direction || "支出"} ${r.amount || 0} 元`,
      r.type && `类型：${r.type}`,
      r.organization && `收费单位：${r.organization}`,
      r.status && `状态：${r.status}`,
      r.notes,
    ]);
    if (text) docs.push({ docKey: `bills:${r.id}`, childId: r.childId, date: r.date, title: r.title, module: "账单", text });
  }

  // 家庭脉搏复盘
  for (const r of db
    .select({ id: familyInsights.id, period: familyInsights.period, startDate: familyInsights.startDate, endDate: familyInsights.endDate, status: familyInsights.status, insights: familyInsights.insights })
    .from(familyInsights)
    .where(eq(familyInsights.userId, userId))
    .orderBy(desc(familyInsights.id))
    .all()) {
    const items = tryParseJson<{ type?: string; insight?: string; actionSop?: string }[]>(r.insights, []);
    const text = joinText([
      r.status === "done" ? `复盘窗口：${r.startDate} ~ ${r.endDate}` : "",
      ...items.map((it) => joinText([it.type && `[${it.type}]`, it.insight, it.actionSop && `行动：${it.actionSop}`])),
    ]);
    if (text) docs.push({ docKey: `family_insights:${r.id}`, childId: null, date: dateOf(r.endDate), title: `家庭脉搏${r.period === "weekly" ? "周" : "月"}复盘`, module: "家庭脉搏复盘", text });
  }

  // 家庭指南（SOP）
  for (const r of db.select({ id: familySops.id, type: familySops.type, insight: familySops.insight, actionSop: familySops.actionSop }).from(familySops).where(eq(familySops.userId, userId)).all()) {
    const text = joinText([r.insight, r.actionSop && `行动指南：${r.actionSop}`]);
    if (text) docs.push({ docKey: `family_sops:${r.id}`, childId: null, date: "", title: r.type || "家庭指南", module: "家庭指南", text });
  }

  // 历史对话（最近 50 条）：过去问过/答过的内容也是记忆
  for (const r of db
    .select({ id: chatMessages.id, role: chatMessages.role, content: chatMessages.content, createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(desc(chatMessages.id))
    .limit(50)
    .all()
    .reverse()) {
    if (!r.content.trim()) continue;
    const text = `${r.role === "user" ? "用户" : "助手"}：${r.content}`;
    docs.push({ docKey: `chat_messages:${r.id}`, childId: null, date: dateOf(r.createdAt), title: "", module: "历史对话", text });
  }

  // 教师 / 学校 / 就读阶段：结构性家庭数据的文本化
  const schoolNames = new Map(
    db
      .select({ id: schools.id, name: schools.name })
      .from(schools)
      .where(eq(schools.userId, userId))
      .all()
      .map((s) => [s.id, s.name])
  );
  for (const r of db
    .select({ id: teachers.id, name: teachers.name, subject: teachers.subject, phone: teachers.phone, notes: teachers.notes, schoolId: teachers.schoolId })
    .from(teachers)
    .where(eq(teachers.userId, userId))
    .all()) {
    const schoolName = r.schoolId ? schoolNames.get(r.schoolId) : "";
    const text = joinText([
      r.subject && `任教科目：${r.subject}`,
      r.phone && `联系电话：${r.phone}`,
      schoolName && `所在学校：${schoolName}`,
      r.notes,
    ]);
    if (text) docs.push({ docKey: `teachers:${r.id}`, childId: null, date: "", title: `${r.name}老师`, module: "教师", text });
  }

  for (const r of db
    .select({ id: childTeachers.id, childId: childTeachers.childId, teacherId: childTeachers.teacherId, stage: childTeachers.stage, notes: childTeachers.notes })
    .from(childTeachers)
    .where(eq(childTeachers.userId, userId))
    .all()) {
    const text = joinText([r.stage && `阶段：${r.stage}`, r.notes]);
    if (text) docs.push({ docKey: `child_teachers:${r.id}`, childId: r.childId, date: "", title: "", module: "教师", text });
  }

  for (const r of db
    .select({ id: schools.id, name: schools.name, type: schools.type, address: schools.address, phone: schools.phone, intro: schools.intro, notes: schools.notes })
    .from(schools)
    .where(eq(schools.userId, userId))
    .all()) {
    const text = joinText([
      r.type && `类型：${r.type}`,
      r.address && `地址：${r.address}`,
      r.phone && `联系电话：${r.phone}`,
      r.intro,
      r.notes,
    ]);
    if (text) docs.push({ docKey: `schools:${r.id}`, childId: null, date: "", title: r.name, module: "学校", text });
  }

  const childNames = new Map(
    db
      .select({ id: children.id, name: children.name })
      .from(children)
      .where(eq(children.userId, userId))
      .all()
      .map((c) => [c.id, c.name])
  );
  for (const r of db
    .select({
      id: enrollments.id,
      childId: enrollments.childId,
      schoolId: enrollments.schoolId,
      stage: enrollments.stage,
      className: enrollments.className,
      studentNo: enrollments.studentNo,
      startDate: enrollments.startDate,
      endDate: enrollments.endDate,
      notes: enrollments.notes,
    })
    .from(enrollments)
    .where(eq(enrollments.userId, userId))
    .all()) {
    const text = joinText([
      r.stage && `阶段：${r.stage}`,
      r.className && `班级：${r.className}`,
      r.studentNo && `学号：${r.studentNo}`,
      (r.startDate || r.endDate) && `就读期间：${r.startDate || "?"} ~ ${r.endDate || "在读"}`,
      r.notes,
    ]);
    if (text)
      docs.push({
        docKey: `enrollments:${r.id}`,
        childId: r.childId,
        date: r.startDate,
        title: `${childNames.get(r.childId) ?? "孩子"}在${schoolNames.get(r.schoolId) ?? "学校"}`,
        module: "就读阶段",
        text,
      });
  }

  // 照片描述：附件图片经视觉模型生成的语义描述（图片内容也可被检索）
  for (const img of collectImagePaths(userId)) {
    const caption = getCaption(userId, img.path);
    if (!caption) continue;
    docs.push({
      docKey: `image:${img.path}`,
      childId: img.childId,
      date: img.date,
      title: "照片",
      module: img.module,
      text: `${img.module}照片描述：${caption}`,
    });
  }

  return docs;
}
