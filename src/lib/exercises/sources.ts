/**
 * 健身馆数据源：hasaneyldrm/exercises-dataset（1324 动作 + 缩略图 + 动图 + 中文步骤）。
 * 本文件保持纯净（不 import node 运行时），供同步器与客户端 UI（中文标签）共用。
 */

/**
 * 媒体公开 URL 前缀，对应 /media/exercises/[...path] 路由，文件落在 data/exercises/
 * （与 data/tts 同类：可重新拉取的运行时数据，不放用户上传目录 uploads/，
 * 也不进部署制品——服务器部署后由同步器自行拉取）。
 */
export const EXERCISE_MEDIA_URL = "/media/exercises";

export interface ExerciseSource {
  key: string;
  label: string;
  envRepo: string;
  defaultRepo: string;
  branch: string;
  zipTimeoutMs: number; // 仓库含 2600+ 媒体文件约 125MB
  parse: (entries: ZipEntry[]) => ParsedExercises;
}

export interface ZipEntry {
  entryName: string;
  isDirectory: boolean;
  getData(): Buffer;
}

export interface SourceExercise {
  sourceId: string; // 上游 "0001"
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  steps: string[];
  image: string; // 对外 URL /media/exercises/images/…
  gif: string;
  attribution: string;
}

export interface ParsedExercises {
  exercises: SourceExercise[];
  images: Map<string, Buffer>; // key = 落盘相对路径（images/xxx.jpg）
  gifs: Map<string, Buffer>;
  missingMedia: string[];
}

export const EXERCISE_SOURCE_LABELS: Record<string, string> = {
  exercises_dataset: "Exercises Dataset",
};

/** 部位英文 → 中文（列表筛选用；上游枚举固定 10 个） */
export const BODY_PART_LABELS: Record<string, string> = {
  back: "背部",
  cardio: "有氧",
  chest: "胸部",
  "lower arms": "小臂",
  "lower legs": "小腿",
  neck: "颈部",
  shoulders: "肩部",
  "upper arms": "大臂",
  "upper legs": "大腿",
  waist: "腰腹",
};

/** 器械英文 → 中文（对齐上游 equipment 全量枚举 28 项，新增值时同步补充） */
export const EQUIPMENT_LABELS: Record<string, string> = {
  "body weight": "自重",
  dumbbell: "哑铃",
  barbell: "杠铃",
  cable: "绳索",
  band: "弹力带",
  "resistance band": "弹力带",
  kettlebell: "壶铃",
  "smith machine": "史密斯机",
  "leverage machine": "器械",
  weighted: "负重",
  "stability ball": "健身球",
  "ez barbell": "曲杆杠铃",
  "olympic barbell": "奥杆",
  "trap bar": "六角杠铃",
  "medicine ball": "药球",
  "bosu ball": "波速球",
  tire: "轮胎",
  "sled machine": "雪橇机",
  rope: "战绳",
  "wheel roller": "健腹轮",
  roller: "滚轮",
  assisted: "助力",
  hammer: "锤式",
  "stationary bike": "动感单车",
  "elliptical machine": "椭圆机",
  "stepmill machine": "爬楼机",
  "skierg machine": "滑雪机",
  "upper body ergometer": "上肢功率车",
};

/** 目标肌英文 → 中文（对齐上游 target 全量枚举 19 项） */
export const TARGET_LABELS: Record<string, string> = {
  abs: "腹肌",
  biceps: "肱二头肌",
  triceps: "肱三头肌",
  quads: "股四头肌",
  hamstrings: "腘绳肌",
  glutes: "臀大肌",
  calves: "小腿三头肌",
  lats: "背阔肌",
  "upper back": "上背",
  spine: "竖脊肌",
  traps: "斜方肌",
  delts: "三角肌",
  pectorals: "胸大肌",
  forearms: "前臂",
  adductors: "内收肌",
  abductors: "外展肌",
  "serratus anterior": "前锯肌",
  "levator scapulae": "肩胛提肌",
  "cardiovascular system": "心肺",
};

/** 肌群英文 → 中文（muscle_group + secondary_muscles 两个字段共用） */
export const MUSCLE_LABELS: Record<string, string> = {
  abdominals: "腹直肌",
  "lower abs": "下腹",
  obliques: "腹斜肌",
  core: "核心",
  back: "背部",
  "lower back": "下背",
  "upper back": "上背",
  lats: "背阔肌",
  "latissimus dorsi": "背阔肌",
  traps: "斜方肌",
  trapezius: "斜方肌",
  rhomboids: "菱形肌",
  "rear deltoids": "三角肌后束",
  deltoids: "三角肌",
  shoulders: "肩部",
  chest: "胸大肌",
  "upper chest": "上胸",
  biceps: "肱二头肌",
  brachialis: "肱肌",
  triceps: "肱三头肌",
  forearms: "前臂",
  "grip muscles": "握力肌群",
  "wrist flexors": "腕屈肌",
  "wrist extensors": "腕伸肌",
  wrists: "手腕",
  hands: "手部",
  "rotator cuff": "肩袖",
  sternocleidomastoid: "胸锁乳突肌",
  glutes: "臀大肌",
  "hip flexors": "髋屈肌",
  quadriceps: "股四头肌",
  hamstrings: "腘绳肌",
  "inner thighs": "大腿内侧",
  groin: "腹股沟",
  calves: "小腿三头肌",
  soleus: "比目鱼肌",
  shins: "小腿前侧",
  ankles: "踝关节",
  "ankle stabilizers": "踝部稳定肌",
  feet: "足部",
};

export function bodyPartLabel(en: string): string {
  return BODY_PART_LABELS[en] ?? en;
}

export function equipmentLabel(en: string): string {
  return EQUIPMENT_LABELS[en] ?? en;
}

export function targetLabel(en: string): string {
  return TARGET_LABELS[en] ?? en;
}

export function muscleLabel(en: string): string {
  return MUSCLE_LABELS[en.toLowerCase()] ?? en;
}

/**
 * 中文口语 → 上游英文名/肌群关键词。动作名与字段值都是英文，中文只能靠
 * steps 全文命中（而 steps 的中译是直译，不含「卧推/硬拉」这类行话，实测 0 命中），
 * 所以这里补一层同义词展开，让「卧推」「二头」这类词也能搜到。
 */
export const KEYWORD_SYNONYMS: Record<string, string[]> = {
  卧推: ["bench press"],
  深蹲: ["squat"],
  硬拉: ["deadlift"],
  引体: ["pull up", "pull"],
  臂屈伸: ["dip"],
  划船: ["row"],
  弯举: ["curl"],
  推举: ["press"],
  飞鸟: ["fly"],
  卷腹: ["crunch", "sit-up"],
  平板支撑: ["plank"],
  提踵: ["calf raise", "calf press"],
  拉伸: ["stretch"],
  二头: ["biceps"],
  三头: ["triceps"],
  腹肌: ["abs"],
  胸: ["chest", "pectorals"],
  背: ["lats", "back"],
  肩: ["delts", "shoulders"],
  腿: ["leg", "quads"],
  臀: ["glutes"],
  小腿: ["calves"],
  有氧: ["cardio"],
};

/** 关键词 → 候选检索词：原词 + 命中的同义词（英文小写） */
export function expandKeyword(kw: string): string[] {
  const q = kw.trim().toLowerCase();
  if (!q) return [];
  const out = [q];
  for (const [cn, ens] of Object.entries(KEYWORD_SYNONYMS)) {
    if (q.includes(cn)) out.push(...ens);
  }
  return [...new Set(out)];
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const GIF_EXTS = new Set([".gif"]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

/** 去掉 zip 根目录前缀（"exercises-dataset-main/xxx" → "xxx"），并拒绝路径穿越 */
function stripRoot(entryName: string): string {
  const parts = entryName.split("/");
  parts.shift();
  const rel = parts.join("/");
  return rel.includes("..") ? "" : rel;
}

/** 上游 instructions.zh / instruction_steps.zh → 有序步骤数组 */
function pickSteps(raw: any): string[] {
  const steps = raw?.instruction_steps?.zh;
  if (Array.isArray(steps) && steps.length) return steps.map((s: any) => String(s).trim()).filter(Boolean);
  const text = String(raw?.instructions?.zh ?? "").trim();
  if (!text) return [];
  // 中文说明常以句号/分号分句，按行或标点拆成步骤
  const byLine = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
  if (byLine.length >= 2) return byLine;
  return text
    .split(/(?<=[。；;])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
}

/** 解析 exercises-dataset zip：data/exercises.json + images/ + videos/ */
export function parseExercisesZip(entries: ZipEntry[]): ParsedExercises {
  const images = new Map<string, Buffer>();
  const gifs = new Map<string, Buffer>();
  let jsonBuf: Buffer | null = null;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const rel = stripRoot(entry.entryName);
    if (!rel) continue;
    const ext = extOf(rel);
    if (rel === "data/exercises.json") {
      jsonBuf = entry.getData();
    } else if (rel.startsWith("images/") && IMAGE_EXTS.has(ext)) {
      images.set(rel, entry.getData());
    } else if (rel.startsWith("videos/") && GIF_EXTS.has(ext)) {
      gifs.set(rel, entry.getData());
    }
  }

  if (!jsonBuf) throw new Error("zip 中未找到 data/exercises.json，上游目录结构可能已变化");

  let rawList: any[];
  try {
    rawList = JSON.parse(jsonBuf.toString("utf8"));
  } catch {
    throw new Error("exercises.json 解析失败");
  }
  if (!Array.isArray(rawList) || !rawList.length) throw new Error("exercises.json 为空或格式异常");

  const missingMedia: string[] = [];
  const exercises: SourceExercise[] = [];

  for (const raw of rawList) {
    const sourceId = String(raw?.id ?? "").trim();
    if (!sourceId) continue;
    const imageRel = String(raw?.image ?? "").trim();
    const gifRel = String(raw?.gif_url ?? "").trim();
    if (imageRel && !images.has(imageRel)) missingMedia.push(imageRel);
    if (gifRel && !gifs.has(gifRel)) missingMedia.push(gifRel);

    let secondary: string[] = [];
    if (Array.isArray(raw?.secondary_muscles)) secondary = raw.secondary_muscles.map((s: any) => String(s).trim()).filter(Boolean);

    exercises.push({
      sourceId,
      name: String(raw?.name ?? "").trim(),
      bodyPart: String(raw?.body_part ?? raw?.category ?? "").trim().toLowerCase(),
      equipment: String(raw?.equipment ?? "").trim().toLowerCase(),
      target: String(raw?.target ?? "").trim().toLowerCase(),
      muscleGroup: String(raw?.muscle_group ?? "").trim(),
      secondaryMuscles: secondary,
      steps: pickSteps(raw),
      image: imageRel ? `${EXERCISE_MEDIA_URL}/${imageRel}` : "",
      gif: gifRel ? `${EXERCISE_MEDIA_URL}/${gifRel}` : "",
      attribution: String(raw?.attribution ?? "© Gym visual — https://gymvisual.com/").trim(),
    });
  }

  if (!exercises.length) throw new Error("未解析到任何动作记录");
  return { exercises, images, gifs, missingMedia };
}

export const EXERCISE_SOURCES: ExerciseSource[] = [
  {
    key: "exercises_dataset",
    label: EXERCISE_SOURCE_LABELS.exercises_dataset,
    envRepo: "EXERCISES_REPO",
    defaultRepo: "hasaneyldrm/exercises-dataset",
    branch: "main",
    zipTimeoutMs: 1_500_000,
    parse: parseExercisesZip,
  },
];
