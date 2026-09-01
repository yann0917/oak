import { tool } from "ai";
import { z } from "zod";
import { and, desc, eq, gte, like, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { anysearchExtract, anysearchSearch } from "./anysearch";
import {
  bills,
  certArchives,
  children,
  familyInsights,
  gardenMastery,
  gardenRecords,
  growthRecords,
  healthRecords,
  learningRecords,
  moments,
  notes,
  policyNotes,
  quickNotes,
  reminders,
  reviewCards,
  todos,
} from "@/db/schema";

/** 工具执行记录：随 assistant 消息入库，前端展示「查询了什么」 */
export interface ToolRecord {
  name: string;
  input: unknown;
  result: unknown;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function normLimit(limit?: number) {
  const n = Math.floor(Number(limit) || 0);
  return Math.max(1, Math.min(MAX_LIMIT, n || DEFAULT_LIMIT));
}

function clip(v: unknown, max = 120) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function tryParseJson<T = unknown>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** 包一层执行记录：工具返回前把 输入/结果摘要 收进 records（schema 由 zod 运行时校验） */
function define(
  name: string,
  description: string,
  inputSchema: z.ZodTypeAny,
  execute: (input: any) => unknown | Promise<unknown>,
  records: ToolRecord[]
) {
  return tool({
    description,
    inputSchema,
    execute: async (input) => {
      try {
        const result = await execute(input);
        records.push({ name, input, result });
        return result;
      } catch (err) {
        records.push({ name, input, result: { error: err instanceof Error ? err.message : String(err) } });
        throw err;
      }
    },
  });
}

/**
 * 只读查询工具集：全部强制按 userId 过滤，禁止任何写操作。
 * 用法：const { tools, records } = buildAgentTools(uid)
 */
export function buildAgentTools(uid: number, opts: { searchApiKey?: string } = {}) {
  const records: ToolRecord[] = [];
  const byUser = (t: any) => eq(t.userId, uid);
  const searchApiKey = (opts.searchApiKey ?? "").trim();

  const common = {
    childId: z.string().optional().describe("孩子 id（字符串），不传查全部"),
    startDate: z.string().optional().describe("起始日期 YYYY-MM-DD，按业务日期过滤"),
    endDate: z.string().optional().describe("结束日期 YYYY-MM-DD"),
    limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(String(`最大 ${MAX_LIMIT} 条，默认 ${DEFAULT_LIMIT}`)),
  };

  function cond(
    table: { [k: string]: unknown },
    v: { childId?: string; startDate?: string; endDate?: string },
    dateField: string
  ) {
    const list = [byUser(table)];
    if (v.childId) list.push(eq(table.childId as any, Number(v.childId)));
    if (v.startDate) list.push(gte(table[dateField] as any, v.startDate));
    if (v.endDate) list.push(lte(table[dateField] as any, v.endDate));
    return and(...list);
  }

  const tools: any = {
    // 1. 成员档案
    getChildren: define(
      "getChildren",
      "获取本家庭的孩子档案列表（名字、昵称、性别、生日、学籍号等）",
      z.object({ limit: common.limit }),
      async ({ limit }) => {
        const rows = db
          .select({
            id: children.id,
            name: children.name,
            nickname: children.nickname,
            gender: children.gender,
            birthday: children.birthday,
            studentId: children.studentId,
            notes: children.notes,
          })
          .from(children)
          .where(byUser(children))
          .orderBy(desc(children.id))
          .limit(normLimit(limit))
          .all();
        return { rows };
      },
      records
    ),

    // 2. 成长（身高体重）
    queryGrowth: define(
      "queryGrowth",
      "查询孩子成长记录（身高 cm、体重 kg），按日期倒序；支持 childId/日期范围过滤",
      z.object({ ...common }),
      async ({ childId, startDate, endDate, limit }) => {
        const rows = db
          .select({
            id: growthRecords.id,
            childId: growthRecords.childId,
            date: growthRecords.date,
            height: growthRecords.height,
            weight: growthRecords.weight,
            notes: growthRecords.notes,
          })
          .from(growthRecords)
          .where(cond(growthRecords as any, { childId, startDate, endDate }, "date"))
          .orderBy(desc(growthRecords.id))
          .limit(normLimit(limit))
          .all();
        return { rows };
      },
      records
    ),

    // 3. 健康档案
    queryHealth: define(
      "queryHealth",
      "查询孩子健康档案（体检/疫苗/用药/病历）",
      z.object({ ...common, type: z.string().optional().describe("健康类型：体检/疫苗/用药/病历") }),
      async ({ childId, startDate, endDate, type, limit }) => {
        const where = and(
          eq(healthRecords.userId, uid),
          childId ? eq(healthRecords.childId, Number(childId)) : undefined,
          type ? eq(healthRecords.type, type) : undefined,
          startDate ? gte(healthRecords.date, startDate) : undefined,
          endDate ? lte(healthRecords.date, endDate) : undefined
        );
        const rows = db
          .select({
            id: healthRecords.id,
            childId: healthRecords.childId,
            type: healthRecords.type,
            date: healthRecords.date,
            title: healthRecords.title,
            detail: healthRecords.detail,
          })
          .from(healthRecords)
          .where(where)
          .orderBy(desc(healthRecords.id))
          .limit(normLimit(limit))
          .all();
        return { rows };
      },
      records
    ),

    // 4. 账单
    queryBills: define(
      "queryBills",
      "查询账单（金额单位：元），支持按收支方向/类型/缴费状态/日期范围过滤",
      z.object({
        ...common,
        direction: z.string().optional().describe("收支方向：支出/收入"),
        type: z.string().optional().describe("账单类型：学费/餐费/校车费/兴趣班/医疗/购物/交通/水电/生活费/收入/其他"),
        status: z.string().optional().describe("缴费状态：已缴/未缴"),
      }),
      async ({ childId, startDate, endDate, direction, type, status, limit }) => {
        const where = and(
          eq(bills.userId, uid),
          childId ? eq(bills.childId, Number(childId)) : undefined,
          direction ? eq(bills.direction, direction) : undefined,
          type ? eq(bills.type, type) : undefined,
          status ? eq(bills.status, status) : undefined,
          startDate ? gte(bills.date, startDate) : undefined,
          endDate ? lte(bills.date, endDate) : undefined
        );
        const rows = db
          .select({
            id: bills.id,
            childId: bills.childId,
            title: bills.title,
            type: bills.type,
            direction: bills.direction,
            amount: bills.amount,
            date: bills.date,
            organization: bills.organization,
            status: bills.status,
            notes: bills.notes,
          })
          .from(bills)
          .where(where)
          .orderBy(desc(bills.id))
          .limit(normLimit(limit))
          .all();
        return { rows };
      },
      records
    ),

    // 5. 学习记录
    queryLearning: define(
      "queryLearning",
      "查询孩子学习记录（学科、成绩/评级、评价、内容）",
      z.object({ ...common, subject: z.string().optional().describe("学科，如 数学/语文/英语") }),
      async ({ childId, startDate, endDate, subject, limit }) => {
        const where = and(
          eq(learningRecords.userId, uid),
          childId ? eq(learningRecords.childId, Number(childId)) : undefined,
          subject ? eq(learningRecords.subject, subject) : undefined,
          startDate ? gte(learningRecords.date, startDate) : undefined,
          endDate ? lte(learningRecords.date, endDate) : undefined
        );
        const rows = db
          .select({
            id: learningRecords.id,
            childId: learningRecords.childId,
            date: learningRecords.date,
            subject: learningRecords.subject,
            grade: learningRecords.grade,
            evaluation: learningRecords.evaluation,
            content: learningRecords.content,
          })
          .from(learningRecords)
          .where(where)
          .orderBy(desc(learningRecords.id))
          .limit(normLimit(limit))
          .all();
        return { rows };
      },
      records
    ),

    // 6. 时光
    queryMoments: define(
      "queryMoments",
      "查询时光相册记录（标题、描述、标签）",
      z.object({ ...common, keyword: z.string().optional().describe("标题/描述关键字") }),
      async ({ childId, startDate, endDate, keyword, limit }) => {
        const where = and(
          eq(moments.userId, uid),
          childId ? eq(moments.childId, Number(childId)) : undefined,
          keyword ? or(like(moments.title, `%${keyword}%`), like(moments.description, `%${keyword}%`)) : undefined,
          startDate ? gte(moments.date, startDate) : undefined,
          endDate ? lte(moments.date, endDate) : undefined
        );
        const rows = db
          .select({
            id: moments.id,
            childId: moments.childId,
            date: moments.date,
            title: moments.title,
            description: moments.description,
            tags: moments.tags,
          })
          .from(moments)
          .where(where)
          .orderBy(desc(moments.id))
          .limit(normLimit(limit))
          .all();
        return { rows: rows.map((r) => ({ ...r, description: clip(r.description, 200), tags: clip(r.tags, 120) })) };
      },
      records
    ),

    // 7. 提醒
    queryReminders: define(
      "queryReminders",
      "查询提醒中心（标题、内容、类型、下次触发时间、是否启用）",
      z.object({
        ...common,
        enabledOnly: z.boolean().optional().describe("只查已启用的提醒"),
        keyword: z.string().optional().describe("标题/内容关键字"),
      }),
      async ({ childId, keyword, enabledOnly, limit }) => {
        const where = and(
          eq(reminders.userId, uid),
          childId ? eq(reminders.childId, Number(childId)) : undefined,
          enabledOnly ? eq(reminders.enabled, 1) : undefined,
          keyword ? or(like(reminders.title, `%${keyword}%`), like(reminders.content, `%${keyword}%`)) : undefined
        );
        const rows = db
          .select({
            id: reminders.id,
            childId: reminders.childId,
            title: reminders.title,
            content: reminders.content,
            scheduleType: reminders.scheduleType,
            timeOfDay: reminders.timeOfDay,
            targetDate: reminders.targetDate,
            nextRunAt: reminders.nextRunAt,
            enabled: reminders.enabled,
          })
          .from(reminders)
          .where(where)
          .orderBy(desc(reminders.id))
          .limit(normLimit(limit))
          .all();
        return { rows: rows.map((r) => ({ ...r, content: clip(r.content, 200) })) };
      },
      records
    ),

    // 8. 待办
    queryTodos: define(
      "queryTodos",
      "查询待办事项（标题、到期日、重复规则、重要标记、完成状态）",
      z.object({
        ...common,
        status: z.string().optional().describe("完成状态：未完成/已完成"),
        keyword: z.string().optional().describe("标题/备注关键字"),
      }),
      async ({ startDate, endDate, status, keyword, limit }) => {
        const where = and(
          eq(todos.userId, uid),
          status ? eq(todos.done, status === "已完成" ? 1 : 0) : undefined,
          keyword ? or(like(todos.title, `%${keyword}%`), like(todos.note, `%${keyword}%`)) : undefined,
          startDate ? gte(todos.dueDate, startDate) : undefined,
          endDate ? lte(todos.dueDate, endDate) : undefined
        );
        const rows = db
          .select({
            id: todos.id,
            title: todos.title,
            note: todos.note,
            dueDate: todos.dueDate,
            repeatRule: todos.repeatRule,
            priority: todos.priority,
            done: todos.done,
            completedAt: todos.completedAt,
          })
          .from(todos)
          .where(where)
          .orderBy(desc(todos.id))
          .limit(normLimit(limit))
          .all();
        return { rows };
      },
      records
    ),

    // 9. 笔记/错题（含复习卡状态）
    queryNotes: define(
      "queryNotes",
      "查询错题本/笔记（标题、标签、来源、复习卡正反面、下次复习时间）",
      z.object({
        ...common,
        keyword: z.string().optional().describe("标题/标签关键字"),
        enabledOnly: z.boolean().optional().describe("只查参与复习的笔记"),
      }),
      async ({ keyword, enabledOnly, limit }) => {
        const where = and(
          eq(notes.userId, uid),
          enabledOnly ? eq(notes.enabled, 1) : undefined,
          keyword ? or(like(notes.title, `%${keyword}%`), like(notes.tags, `%${keyword}%`)) : undefined
        );
        const rows = db
          .select({
            id: notes.id,
            title: notes.title,
            tags: notes.tags,
            source: notes.source,
            enabled: notes.enabled,
            question: notes.question,
            answer: notes.answer,
            due: reviewCards.due,
            state: reviewCards.state,
          })
          .from(notes)
          .leftJoin(reviewCards, eq(notes.id, reviewCards.noteId))
          .where(where)
          .orderBy(desc(notes.id))
          .limit(normLimit(limit))
          .all();
        return { rows: rows.map((r) => ({ ...r, question: clip(r.question, 300), answer: clip(r.answer, 300) })) };
      },
      records
    ),

    // 10. 学习园地练习
    queryGarden: define(
      "queryGarden",
      "查询学习园地练习记录（活动、难度、题数/答对数、用时、错题项）",
      z.object({ ...common, activity: z.string().optional().describe("活动 key，如 characters/math/pinyin/letters/poems/colors/words") }),
      async ({ childId, activity, startDate, endDate, limit }) => {
        const where = and(
          eq(gardenRecords.userId, uid),
          childId ? eq(gardenRecords.childId, Number(childId)) : undefined,
          activity ? eq(gardenRecords.activity, activity) : undefined,
          startDate ? gte(gardenRecords.createdAt, startDate) : undefined,
          endDate ? lte(gardenRecords.createdAt, endDate) : undefined
        );
        const rows = db
          .select({
            id: gardenRecords.id,
            childId: gardenRecords.childId,
            activity: gardenRecords.activity,
            difficulty: gardenRecords.difficulty,
            total: gardenRecords.total,
            correct: gardenRecords.correct,
            durationSec: gardenRecords.durationSec,
            wrongItems: gardenRecords.wrongItems,
            createdAt: gardenRecords.createdAt,
          })
          .from(gardenRecords)
          .where(where)
          .orderBy(desc(gardenRecords.id))
          .limit(normLimit(limit))
          .all();
        return {
          rows: rows.map((r) => ({
            ...r,
            wrongItems: tryParseJson<string[]>(r.wrongItems, []).slice(0, 10),
          })),
        };
      },
      records
    ),

    // 11. 学习园地掌握度
    queryGardenMastery: define(
      "queryGardenMastery",
      "查询学习园地知识点掌握度（答对/答错次数，薄弱项）",
      z.object({ childId: z.string(), activity: z.string().optional(), limit: common.limit }),
      async ({ childId, activity, limit }) => {
        const where = and(
          eq(gardenMastery.userId, uid),
          eq(gardenMastery.childId, Number(childId)),
          activity ? eq(gardenMastery.activity, activity) : undefined
        );
        const rows = db
          .select({
            id: gardenMastery.id,
            childId: gardenMastery.childId,
            activity: gardenMastery.activity,
            itemKey: gardenMastery.itemKey,
            label: gardenMastery.label,
            correctCount: gardenMastery.correctCount,
            wrongCount: gardenMastery.wrongCount,
            lastCorrect: gardenMastery.lastCorrect,
          })
          .from(gardenMastery)
          .where(where)
          .orderBy(desc(gardenMastery.wrongCount))
          .limit(normLimit(limit))
          .all();
        return { rows };
      },
      records
    ),

    // 12. 卡证档案
    queryCertArchives: define(
      "queryCertArchives",
      "查询卡证档案（证件/证明/病历/检测单/检测报告/协议/证书），含证号、签发/到期日",
      z.object({
        ...common,
        category: z.string().optional().describe("类别：证件/证明/病历/检测单/检测报告/协议/证书/其他"),
        keyword: z.string().optional().describe("标题/证号关键字"),
      }),
      async ({ childId, category, keyword, limit }) => {
        const where = and(
          eq(certArchives.userId, uid),
          childId ? eq(certArchives.childId, Number(childId)) : undefined,
          category ? eq(certArchives.category, category) : undefined,
          keyword ? or(like(certArchives.title, `%${keyword}%`), like(certArchives.number, `%${keyword}%`)) : undefined
        );
        const rows = db
          .select({
            id: certArchives.id,
            childId: certArchives.childId,
            category: certArchives.category,
            title: certArchives.title,
            number: certArchives.number,
            issuer: certArchives.issuer,
            issueDate: certArchives.issueDate,
            expireDate: certArchives.expireDate,
            content: certArchives.content,
          })
          .from(certArchives)
          .where(where)
          .orderBy(desc(certArchives.id))
          .limit(normLimit(limit))
          .all();
        return { rows: rows.map((r) => ({ ...r, content: clip(r.content, 200) })) };
      },
      records
    ),

    // 13. 政策动态
    queryPolicyNotes: define(
      "queryPolicyNotes",
      "查询政策动态（招生入学/升学政策/健康疫苗/减负规定等）",
      z.object({
        ...common,
        category: z.string().optional().describe("类别：招生入学/升学政策/健康疫苗/减负规定/其他"),
        keyword: z.string().optional().describe("标题/内容关键字"),
      }),
      async ({ category, keyword, startDate, endDate, limit }) => {
        const where = and(
          eq(policyNotes.userId, uid),
          category ? eq(policyNotes.category, category) : undefined,
          keyword ? or(like(policyNotes.title, `%${keyword}%`), like(policyNotes.content, `%${keyword}%`)) : undefined,
          startDate ? gte(policyNotes.date, startDate) : undefined,
          endDate ? lte(policyNotes.date, endDate) : undefined
        );
        const rows = db
          .select({
            id: policyNotes.id,
            title: policyNotes.title,
            issuer: policyNotes.issuer,
            category: policyNotes.category,
            date: policyNotes.date,
            content: policyNotes.content,
            link: policyNotes.link,
          })
          .from(policyNotes)
          .where(where)
          .orderBy(desc(policyNotes.id))
          .limit(normLimit(limit))
          .all();
        return { rows: rows.map((r) => ({ ...r, content: clip(r.content, 300) })) };
      },
      records
    ),

    // 14. 快记原始流水
    queryQuickNotes: define(
      "queryQuickNotes",
      "查询一句话快记流水（用户随手记下的话 + AI 归类结果），最能反映近期全家动态",
      z.object({ ...common, status: z.string().optional().describe("归类状态：pending/processed/failed") }),
      async ({ childId, status, startDate, endDate, limit }) => {
        const where = and(
          eq(quickNotes.userId, uid),
          childId ? eq(quickNotes.childId, Number(childId)) : undefined,
          status ? eq(quickNotes.status, status) : undefined,
          startDate ? gte(quickNotes.createdAt, startDate) : undefined,
          endDate ? lte(quickNotes.createdAt, endDate) : undefined
        );
        const rows = db
          .select({
            id: quickNotes.id,
            childId: quickNotes.childId,
            content: quickNotes.content,
            status: quickNotes.status,
            aiType: quickNotes.aiType,
            result: quickNotes.result,
            processedAt: quickNotes.processedAt,
            createdAt: quickNotes.createdAt,
          })
          .from(quickNotes)
          .where(where)
          .orderBy(desc(quickNotes.id))
          .limit(normLimit(limit))
          .all();
        return {
          rows: rows.map((r) => {
            const result = tryParseJson<{ summary?: string; entries?: unknown[] }>(r.result, {});
            return {
              id: r.id,
              childId: r.childId,
              content: clip(r.content, 200),
              status: r.status,
              aiType: r.aiType,
              summary: result.summary ? clip(result.summary, 200) : "",
              entries: result.entries ?? [],
              createdAt: r.createdAt,
            };
          }),
        };
      },
      records
    ),

    // 15. 家庭脉搏洞察
    queryInsights: define(
      "queryInsights",
      "查询家庭脉搏 AI 复盘结果（周/月报的洞察与行动建议）",
      z.object({ period: z.string().optional().describe("weekly/monthly"), limit: common.limit }),
      async ({ period, limit }) => {
        const where = and(
          eq(familyInsights.userId, uid),
          period ? eq(familyInsights.period, period) : undefined
        );
        const rows = db
          .select({
            id: familyInsights.id,
            period: familyInsights.period,
            startDate: familyInsights.startDate,
            endDate: familyInsights.endDate,
            status: familyInsights.status,
            insights: familyInsights.insights,
            createdAt: familyInsights.createdAt,
          })
          .from(familyInsights)
          .where(where)
          .orderBy(desc(familyInsights.id))
          .limit(normLimit(limit))
          .all();
        return {
          rows: rows.map((r) => ({ ...r, insights: tryParseJson<unknown[]>(r.insights, []).slice(0, 10) })),
        };
      },
      records
    ),

    // 16. 跨模块全文搜索
    searchAll: define(
      "searchAll",
      "跨模块关键词搜索：账单/快记/时光/健康/学习/待办/提醒/笔记/卡证/政策/孩子档案",
      z.object({ keyword: z.string().describe("搜索关键字"), limit: common.limit }),
      async ({ keyword, limit }) => {
        const kw = `%${keyword}%`;
        const n = normLimit(limit);
        const cap = Math.min(Math.max(1, Math.floor(n / 2)), 10);
        const results: { module: string; label: string; rows: unknown[] }[] = [];

        const q = (module: string, label: string, rows: unknown[]) => {
          if (rows.length) results.push({ module, label, rows });
        };

        q("bills", "账单", db.select({ id: bills.id, title: bills.title, type: bills.type, amount: bills.amount, date: bills.date }).from(bills).where(and(eq(bills.userId, uid), like(bills.title, kw))).limit(cap).all());
        q("quick_notes", "快记", db.select({ id: quickNotes.id, content: quickNotes.content, createdAt: quickNotes.createdAt }).from(quickNotes).where(and(eq(quickNotes.userId, uid), like(quickNotes.content, kw))).limit(cap).all());
        q("moments", "时光", db.select({ id: moments.id, title: moments.title, date: moments.date }).from(moments).where(and(eq(moments.userId, uid), or(like(moments.title, kw), like(moments.description, kw)))).limit(cap).all());
        q("health", "健康", db.select({ id: healthRecords.id, title: healthRecords.title, type: healthRecords.type }).from(healthRecords).where(and(eq(healthRecords.userId, uid), or(like(healthRecords.title, kw), like(healthRecords.detail, kw)))).limit(cap).all());
        q("learning", "学习", db.select({ id: learningRecords.id, subject: learningRecords.subject, content: learningRecords.content }).from(learningRecords).where(and(eq(learningRecords.userId, uid), like(learningRecords.content, kw))).limit(cap).all());
        q("todos", "待办", db.select({ id: todos.id, title: todos.title, done: todos.done }).from(todos).where(and(eq(todos.userId, uid), like(todos.title, kw))).limit(cap).all());
        q("reminders", "提醒", db.select({ id: reminders.id, title: reminders.title }).from(reminders).where(and(eq(reminders.userId, uid), or(like(reminders.title, kw), like(reminders.content, kw)))).limit(cap).all());
        q("notes", "笔记", db.select({ id: notes.id, title: notes.title, tags: notes.tags }).from(notes).where(and(eq(notes.userId, uid), or(like(notes.title, kw), like(notes.question, kw)))).limit(cap).all());
        q("cert_archives", "卡证", db.select({ id: certArchives.id, title: certArchives.title, number: certArchives.number }).from(certArchives).where(and(eq(certArchives.userId, uid), or(like(certArchives.title, kw), like(certArchives.number, kw)))).limit(cap).all());
        q("policy_notes", "政策", db.select({ id: policyNotes.id, title: policyNotes.title, category: policyNotes.category }).from(policyNotes).where(and(eq(policyNotes.userId, uid), like(policyNotes.title, kw))).limit(cap).all());
        q("children", "孩子", db.select({ id: children.id, name: children.name, nickname: children.nickname }).from(children).where(and(eq(children.userId, uid), or(like(children.name, kw), like(children.nickname, kw)))).limit(cap).all());

        return { keyword, results };
      },
      records
    ),
  };

  // AnySearch 通用联网搜索（配置了 key 才注册；DeepSeek 原生 web_search 走服务端工具，见 chat.ts）
  if (searchApiKey) {
    tools.webSearch = define(
      "webSearch",
      "通用联网搜索（AnySearch）：查新闻/政策/百科/最新信息等家庭数据之外的问题。已提供 url 的结果可用 webExtract 深读。",
      z.object({
        query: z.string().describe("搜索关键词"),
        maxResults: z.number().int().min(1).max(10).optional().describe("返回条数，默认 5"),
        language: z.string().optional().describe("结果语言，如 zh-CN / en"),
        tag: z.string().optional().describe("子域能力标签，如 code.doc / finance.quote"),
      }),
      async ({ query, maxResults, language, tag }) => {
        try {
          const { results } = await anysearchSearch(searchApiKey, query, { maxResults, language, tag });
          return results.length ? { results } : { results: [], note: "未搜索到结果，换个关键词试试" };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
      records
    );
    tools.webExtract = define(
      "webExtract",
      "提取指定网址的正文内容（AnySearch /v1/extract），用于深入阅读搜索结果里的链接",
      z.object({ url: z.string().describe("公开可访问的 HTTP/HTTPS 网址") }),
      async ({ url }) => {
        try {
          return await anysearchExtract(searchApiKey, url);
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
      records
    );
  }

  return { tools, records };
}

export type AgentTools = ReturnType<typeof buildAgentTools>;
