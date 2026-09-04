import fs from "fs";
import path from "path";
import { chatJSON, type ChatContentItem, type AiConfigInput } from "./client";
import { QUICK_TYPES, type QuickType } from "@/lib/quick/meta";

export interface ChildBrief {
  id: number;
  name: string;
  nickname: string;
  gender: string;
  birthday: string;
}

/** AI 归纳出的结构化意图（QuickNote 的 Information 层，一条输入可能拆出多条） */
export interface QuickIntent {
  type: QuickType;
  childId: number | null;
  date: string; // YYYY-MM-DD，空表示当天
  title: string;
  /** 记录内容摘要（5W1H 组织），不是分类动作说明 */
  summary: string;
  /** 图片上识别出的原始文字（无图为空），供追溯 */
  ocrText: string;
  fields: Record<string, any>;
}

/** AI 分类结果：多条意图 + 图片 OCR 原文 */
export interface ClassifyResult {
  ocrText: string;
  intents: QuickIntent[];
}

const SYSTEM_PROMPT = `你是家庭记录管家，负责把用户的一句话（或一段话/图片）拆解成一条或多条结构化记录，输出严格的 JSON 对象，不输出任何其他文字或 Markdown。

输出格式（唯一格式）：
{"ocrText": "图片识别出的原始文字（无图为空字符串）", "entries": [{"type": "...", "childId": 1, "date": "YYYY-MM-DD", "title": "短标题", "summary": "该条内容摘要", "fields": {...}}, ...]}

- entries 是数组：一句输入可能包含多个信息，必须拆成多条（如"今天带娃打百白破花了200，回来有点低烧"→ 一条 health（疫苗+低烧）+ 一条 fee（花费200））。实测至少包含一个条目。
- 一个活动的完整通知/长文往往同时含多个维度，允许拆 3 条以上：时间节点 → reminder，需要准备的事 → todo，值得纪念的片段（如开学报到打卡、第一次入园、领礼物）→ 不要漏掉 moment。
- 每条 entry 的 summary 与 title 只描述该条自身，summary 用 5W1H（谁 Who / 什么 What / 何时 When / 何地 Where / 为何 Why / 如何 How）组织该条内容本身（100 字内），如"小宝接种百白破疫苗（200元），接种后低烧"。⚠️ 不要写"已记入/已添加/归类为"之类的分类动作说明。
- 无法归类的内容用 other 条目保留，或直接省略。

目标模块 type 只能是以下之一：${QUICK_TYPES.join("|")}
- health（健康档案）：体检、疫苗、用药、生病、发烧、过敏等。fields: { "healthType": "体检|疫苗|用药|病历", "detail": "补充说明" }
- fee（账单）：交学费、电费、打车、买药、购物、收红包等收支。fields: { "feeType": "学费|餐费|校车费|兴趣班|医疗|购物|交通|水电|生活费|收入|其他", "direction": "支出|收入", "amount": 金额数字(元), "organization": "收款单位或留空", "status": "已缴|未缴" }
- growth（成长）：身高、体重等。fields: { "height": 身高数字(cm)或null, "weight": 体重数字(kg)或null }
- moment（时光）：值得记住的瞬间、开心好玩的事。fields: { "tags": "逗号分隔的标签" }
- learning（学习）：考试、成绩、作业、上课表现。fields: { "subject": "科目", "grade": "分数/评级", "evaluation": "great|good|ok|poor 或空", "content": "详细描述" }
- reminder（提醒）：以后要做、要缴费、要打针等带目标日期的事。fields: { "targetDate": "YYYY-MM-DD 或空（事件截止日期，如证件到期日）", "advanceDays": "提前提醒天数（原文提到'提前N天'填 N；'提前一个月'填 30；没提则空）" }
- todo（待办）：需要做但没有明确日期的任务、想法。fields: { "dueDate": "到期日 YYYY-MM-DD 或空（原文提到明天/下周一/月底等）", "priority": "是否重要（用户明确说重要/紧急/加急时 true，否则省略）" }
- cert（卡证档案）：个人/家庭**持有的文档本身**，需要保存原件照片的——身份证、居住证、户口本、房产证、出生证明、疫苗接种证明、病历、体检报告、化验单、检测单/检测报告、入学证明、合同协议、资格证书等。fields: { "category": "证件|证明|病历|检测单|检测报告|协议|证书|其他", "number": "证号/编号", "issuer": "签发/出具单位", "issueDate": "签发日期 YYYY-MM-DD 或空", "expireDate": "到期日期 YYYY-MM-DD 或空（无有效期则空）" }
- policy（政策动态）：**面向大众发布的政策/通知/公告**（如某市教育局招生入学政策、部门通告、收费依据文件），是"发布的信息"而不是"我持有的文档"。fields: { "category": "招生入学|升学政策|健康疫苗|减负规定|其他", "content": "公文原文摘录（来自图片时用图片上的文字）" }
- other：没有明确归属的琐事、灵感、碎碎念。fields: {}

判断口诀：证件/证明/报告/单据本人要留存原件 → cert；政府/学校公开发布的消息 → policy。

字段要求：
- date：事件发生日期 YYYY-MM-DD；"今天/昨天/前天"按用户消息中的 today 推导；没提日期也填 today。
- childId：用户提到某个孩子（按名字或昵称）时填该孩子的 id；明显不涉及孩子的（如交电费、待办）填 null；提到"娃/孩子"等泛指且只有 defaultChildId 时填 defaultChildId；多个孩子却未点名时填 null。
- title：15 字以内的简短标题（moment/todo 也必须有），如"百白破疫苗""2026秋季学费""居住证到期"。
- summary：用 5W1H（谁 Who / 什么 What / 何时 When / 何地 Where / 为何 Why / 如何 How）组织**记录内容本身的摘要**（100 字内），如"居住证（王小明）2027-03-15 到期，需提前一个月续签，续签材料：身份证与居住证"。⚠️ 不要写"已记入/已添加/归类为"之类的分类动作说明。
- ocrText：图片中识别出的原始文字（完整保留，用于追溯原文）；没有图片时为空字符串。
- 金额数字不要带千分位；无法确定的字段给默认值或空，不要编造。
- 用户可能附带图片（体检单、缴费凭证、成绩单、疫苗本、居住证、购物小票等），请结合图片内容理解：提取关键信息（号码、日期、金额、项目）写入 summary 与 ocrText。`;

/** 读取本地 uploads 文件并转成 base64 data URL（DeepSeek 视觉要求内联 base64 或公网 URL） */
export function photoPathToDataUrl(p: string): string {
  const clean = p.replace(/^\/+/, "");
  // 只允许读取本应用自己的 uploads 目录，防止任意文件读取
  if (!clean.startsWith("uploads/")) throw new Error(`非法照片路径：${p}`);
  // 静态限定在 uploads 子目录（仅文件名动态），避免 turbopack 把整个项目纳入追踪
  const filePath = path.join(process.cwd(), "uploads", clean.slice("uploads/".length));
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const buf = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** 多模态消息：文字 + 图片（DeepSeek 视觉支持公网 URL 直传或内联 base64，图片仅随 user 消息） */
export function buildTextWithPhotos(text: string, photos: string[]): ChatContentItem[] {
  return [
    { type: "text", text },
    ...photos.map((p) => ({
      type: "image_url" as const,
      // 公网 http(s) URL 直传（文档推荐，省 base64 膨胀）；本地 /uploads 路径转 data URL
      image_url: { url: /^https?:\/\//i.test(p) ? p : photoPathToDataUrl(p) },
    })),
  ];
}

/** 北京时间今天，YYYY-MM-DD（与提醒中心的默认时区一致） */
export function todayString(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
}

export function buildChildBriefs(children: { id: number; name: string; nickname: string; gender: string; birthday: string }[]): ChildBrief[] {
  return children.map((c) => ({ id: c.id, name: c.name, nickname: c.nickname ?? "", gender: c.gender ?? "", birthday: c.birthday ?? "" }));
}

/** 调用大模型并按约定校验/归一化输出（多模型输出不可控，这里兜底） */
export async function classifyQuickNote(
  cfg: AiConfigInput,
  input: { content: string; today: string; children: ChildBrief[]; defaultChildId: number | null; photos?: string[] }
): Promise<ClassifyResult> {
  const photos = (input.photos ?? []).filter((p) => typeof p === "string" && p.length > 0);
  const userText = JSON.stringify({
    today: input.today,
    defaultChildId: input.defaultChildId,
    children: input.children,
    content: input.content,
    photos: photos.length ? `附 ${photos.length} 张图片，请结合图片内容理解` : [],
  });
  const raw = await chatJSON<any>(cfg, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: photos.length ? buildTextWithPhotos(userText, photos) : userText,
      },
    ],
    temperature: 0.1,
    maxTokens: 4096,
  });
  return normalizeResult(raw);
}

function toStr(v: any, maxLen = 0): string {
  if (v == null) return "";
  const s = String(v).trim();
  return maxLen > 0 ? s.slice(0, maxLen) : s;
}

function toNum(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: any): string {
  const s = toStr(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function oneOf<T extends string>(v: any, options: T[], fallback: T): T {
  const s = toStr(v);
  return (options as string[]).includes(s) ? (s as T) : fallback;
}

export function normalizeIntent(raw: any): QuickIntent {
  const type: QuickType = (QUICK_TYPES as readonly string[]).includes(raw?.type) ? raw.type : "other";
  const f = raw?.fields && typeof raw.fields === "object" ? raw.fields : {};
  const fields: Record<string, any> = {};
  switch (type) {
    case "health":
      fields.healthType = oneOf(f.healthType, ["体检", "疫苗", "用药", "病历"], "体检");
      fields.detail = toStr(f.detail);
      break;
    case "fee":
      fields.feeType = oneOf(
        f.feeType,
        ["学费", "餐费", "校车费", "兴趣班", "医疗", "购物", "交通", "水电", "生活费", "收入", "其他"],
        "其他"
      );
      fields.direction = oneOf(f.direction, ["支出", "收入"], "支出");
      fields.amount = Math.max(0, toNum(f.amount) ?? 0);
      fields.organization = toStr(f.organization);
      fields.status = oneOf(f.status, ["已缴", "未缴"], "已缴");
      break;
    case "growth":
      fields.height = toNum(f.height);
      fields.weight = toNum(f.weight);
      break;
    case "moment":
      fields.tags = toStr(f.tags);
      break;
    case "learning":
      fields.subject = toStr(f.subject);
      fields.grade = toStr(f.grade);
      fields.evaluation = oneOf(f.evaluation, ["great", "good", "ok", "poor"], "");
      fields.content = toStr(f.content);
      break;
    case "reminder":
      fields.targetDate = toDate(f.targetDate);
      fields.advanceDays = /^\d+$/.test(toStr(f.advanceDays)) ? toStr(f.advanceDays) : "";
      break;
    case "todo":
      fields.dueDate = toDate(f.dueDate);
      fields.priority = f.priority ? 1 : 0;
      break;
    case "cert":
      fields.category = oneOf(f.category, ["证件", "证明", "病历", "检测单", "检测报告", "协议", "证书", "其他"], "证件");
      fields.number = toStr(f.number);
      fields.issuer = toStr(f.issuer);
      fields.issueDate = toDate(f.issueDate);
      fields.expireDate = toDate(f.expireDate);
      break;
    case "policy":
      fields.category = oneOf(f.category, ["招生入学", "升学政策", "健康疫苗", "减负规定", "其他"], "其他");
      fields.content = toStr(f.content);
      break;
  }
  return {
    type,
    childId: Number.isInteger(raw?.childId) ? Number(raw.childId) : null,
    date: toDate(raw?.date),
    title: toStr(raw?.title, 30),
    summary: toStr(raw?.summary, 120),
    ocrText: toStr(raw?.ocrText, 2000),
    fields,
  };
}

/** 归一化整个分类结果：兼容 single-object / array / {entries} 三种形态 */
export function normalizeResult(raw: any): ClassifyResult {
  let list: any[] = [];
  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.entries)) list = raw.entries;
    else if (Array.isArray(raw)) list = raw;
    else list = [raw];
  }
  const intents = list.map((e) => normalizeIntent(e));
  if (!intents.length) intents.push(normalizeIntent({ type: "other" }));
  const ocrText =
    toStr(raw?.ocrText, 2000) ||
    toStr(raw?.entries?.[0]?.ocrText, 2000) ||
    intents.reduce((acc, i) => acc || i.ocrText, "");
  return { ocrText, intents };
}
