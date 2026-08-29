// 学习园地出题引擎：按活动 + 难度 + 个性化配置生成一轮题目
// 薄弱项加权：约一半名额优先选答错过的知识点，其余从未练过/随机补足
import { BUILTIN_CHARACTERS } from "@/data/garden/characters";
import {
  PINYIN_CHARS,
  PINYIN_FINALS,
  PINYIN_INITIALS,
  PINYIN_WHOLE,
  TONE_QUADS,
} from "@/data/garden/pinyin";
import { LETTERS } from "@/data/garden/letters";
import { POEMS, POET_POOL } from "@/data/garden/poems";
import { COLORS } from "@/data/garden/colors";
import { WORDS } from "@/data/garden/words";
import {
  MATH_OP_LABEL,
  tierOf,
  type ActivityConfig,
  type ActivityKey,
  type CustomCharacter,
  type Difficulty,
  type MasteryItem,
  type MathOp,
  type MathTierConfig,
  type Question,
  type Tier,
} from "./types";

// ---------- 通用工具 ----------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, Math.max(0, n));
}

function makeChoiceQuestion(
  base: Omit<Question, "mode" | "options">,
  options: string[]
): Question {
  const unique = Array.from(new Set(options));
  return {
    ...base,
    mode: "choice",
    options: shuffle(unique),
  };
}

// ---------- 数学默认参数 ----------

export const DEFAULT_MATH_CONFIG: Record<Tier, MathTierConfig> = {
  1: { ops: ["add", "sub"], max: 10 },
  2: { ops: ["add", "sub"], max: 20 },
  3: { ops: ["mul", "div"], max: 9 },
};

export function parseConfig(raw: string | undefined | null): ActivityConfig {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export function resolveMathConfig(config: ActivityConfig, tier: Tier): MathTierConfig {
  const custom = config.math?.[tier];
  if (custom && Array.isArray(custom.ops) && custom.ops.length > 0) {
    return { ops: custom.ops, max: clampMax(custom.max) };
  }
  return DEFAULT_MATH_CONFIG[tier];
}

function clampMax(max: unknown): number {
  const n = Number(max);
  if (!Number.isFinite(n)) return 10;
  return Math.min(100, Math.max(5, Math.round(n)));
}

// ---------- 薄弱项加权选题 ----------

interface PoolItem<T> {
  itemKey: string;
  item: T;
}

export function pickWeighted<T>(pool: PoolItem<T>[], mastery: MasteryItem[], count: number): T[] {
  if (pool.length === 0) return [];
  const weak = mastery
    .filter((m) => m.wrongCount > 0)
    .sort((a, b) => a.lastCorrect - b.lastCorrect || b.wrongCount - a.wrongCount);
  const poolByKey = new Map(pool.map((p) => [p.itemKey, p]));
  const chosen: T[] = [];
  const chosenKeys = new Set<string>();

  // 一半名额给薄弱项（最久没答对的优先）
  const weakQuota = Math.ceil(count / 2);
  for (const m of weak) {
    if (chosen.length >= weakQuota || chosen.length >= count) break;
    const item = poolByKey.get(m.itemKey);
    if (item && !chosenKeys.has(m.itemKey)) {
      chosen.push(item.item);
      chosenKeys.add(m.itemKey);
    }
  }
  // 其余随机补足
  const rest = pool.filter((p) => !chosenKeys.has(p.itemKey));
  for (const item of sample(rest, count - chosen.length)) {
    chosen.push(item.item);
    chosenKeys.add(item.itemKey);
  }
  return chosen;
}

// ---------- 各活动题库 ----------

interface CharItem {
  char: string;
  pinyin: string;
  word: string;
}

function characterPool(difficulty: Difficulty, config: ActivityConfig, custom: CustomCharacter[]): PoolItem<CharItem>[] {
  const tier = tierOf(difficulty);
  const useBuiltin = config.characters?.builtin?.[String(tier)] !== false;
  const map = new Map<string, CharItem>();
  if (useBuiltin) {
    for (const b of BUILTIN_CHARACTERS[tier]) {
      map.set(b.char, { char: b.char, pinyin: b.pinyin, word: b.word });
    }
  }
  for (const c of custom) {
    if (c.tier === tier) {
      map.set(c.char, { char: c.char, pinyin: c.pinyin, word: c.word || "" });
    }
  }
  return Array.from(map.values()).map((item) => ({
    itemKey: `char:${item.char}`,
    item,
  }));
}

interface MathProblem {
  op: MathOp;
  a: number;
  b: number;
  answer: number;
}

function genMathProblem(op: MathOp, max: number): MathProblem {
  switch (op) {
    case "add": {
      const a = randInt(1, max - 1);
      const b = randInt(1, max - a);
      return { op, a, b, answer: a + b };
    }
    case "sub": {
      const a = randInt(2, max);
      const b = randInt(1, a - 1);
      return { op, a, b, answer: a - b };
    }
    case "mul": {
      const m = Math.min(max, 9);
      const a = randInt(2, m);
      const b = randInt(2, m);
      return { op, a, b, answer: a * b };
    }
    case "div": {
      const m = Math.min(max, 9);
      const b = randInt(2, m);
      const q = randInt(2, m);
      return { op, a: b * q, b, answer: q };
    }
  }
}

function weightedOp(ops: MathOp[], mastery: MasteryItem[]): MathOp {
  // 答错过的题型给 3 倍权重，引导多练薄弱题型
  const tickets: MathOp[] = [];
  for (const op of ops) {
    const m = mastery.find((x) => x.itemKey === `math:${op}`);
    const weight = m && m.wrongCount > 0 ? 3 : 1;
    for (let i = 0; i < weight; i++) tickets.push(op);
  }
  return tickets[Math.floor(Math.random() * tickets.length)];
}

// ---------- 主入口 ----------

export interface BuildOptions {
  activity: ActivityKey;
  difficulty: Difficulty;
  count: number;
  mastery: MasteryItem[];
  config?: ActivityConfig;
  customCharacters?: CustomCharacter[];
}

export function buildQuestions(opts: BuildOptions): Question[] {
  const { activity, difficulty, mastery } = opts;
  const count = Math.min(20, Math.max(5, Math.round(opts.count || 10)));
  const cfg = opts.config ?? {};
  const tier = tierOf(difficulty);

  switch (activity) {
    case "characters": {
      const pool = characterPool(difficulty, cfg, opts.customCharacters ?? []);
      const items = pickWeighted(pool, mastery, Math.min(count, pool.length));
      return shuffle(
        items.map((item) => ({
          mode: "flashcard" as const,
          itemKey: `char:${item.char}`,
          label: `${item.char}（${item.pinyin}）`,
          prompt: "这个字念什么？和它打个招呼吧",
          display: { kind: "text" as const, value: item.char },
          options: [],
          answer: item.pinyin,
          flip: { pinyin: item.pinyin, word: item.word },
        }))
      );
    }

    case "math": {
      const mathCfg = resolveMathConfig(cfg, tier);
      const problems: MathProblem[] = [];
      const seen = new Set<string>();
      let guard = 0;
      while (problems.length < count && guard++ < count * 20) {
        const op = weightedOp(mathCfg.ops, mastery);
        const p = genMathProblem(op, mathCfg.max);
        const key = `${p.op}:${p.a}:${p.b}`;
        if (!seen.has(key)) {
          seen.add(key);
          problems.push(p);
        }
      }
      return problems.map((p) => {
        const text = `${p.a} ${p.op === "add" ? "+" : p.op === "sub" ? "−" : p.op === "mul" ? "×" : "÷"} ${p.b} =`;
        return {
          mode: "keypad" as const,
          itemKey: `math:${p.op}`,
          label: MATH_OP_LABEL[p.op],
          prompt: "算一算，点数字写出答案",
          display: { kind: "formula" as const, value: text },
          options: [],
          answer: String(p.answer),
        };
      });
    }

    case "pinyin": {
      if (tier === 1) {
        // 声母 / 韵母 / 整体认读音节分类
        const cats = [
          { name: "声母", values: PINYIN_INITIALS },
          { name: "韵母", values: PINYIN_FINALS },
          { name: "整体认读音节", values: PINYIN_WHOLE },
        ];
        const pool: PoolItem<{ value: string; cat: string }>[] = cats.flatMap((c) =>
          c.values.map((v) => ({ itemKey: `pinyin:sy:${v}`, item: { value: v, cat: c.name } }))
        );
        const items = pickWeighted(pool, mastery, Math.min(count, pool.length));
        return shuffle(
          items.map((item) => {
            const others = cats.filter((c) => c.name !== item.cat).flatMap((c) => c.values);
            return makeChoiceQuestion(
              {
                itemKey: `pinyin:sy:${item.value}`,
                label: `${item.value}（${item.cat}）`,
                prompt: `下面哪一个是${item.cat}？`,
                display: { kind: "text", value: item.value },
                answer: item.value,
              },
              [item.value, ...sample(others, 3)]
            );
          })
        );
      }
      if (tier === 2) {
        // 汉字选拼音
        const pool: PoolItem<{ char: string; pinyin: string }>[] = PINYIN_CHARS.map((c) => ({
          itemKey: `pinyin:char:${c.char}`,
          item: c,
        }));
        const items = pickWeighted(pool, mastery, Math.min(count, pool.length));
        return shuffle(
          items.map((item) => {
            const others = PINYIN_CHARS.filter((c) => c.pinyin !== item.pinyin).map((c) => c.pinyin);
            return makeChoiceQuestion(
              {
                itemKey: `pinyin:char:${item.char}`,
                label: `${item.char}（${item.pinyin}）`,
                prompt: `「${item.char}」的拼音是哪个？`,
                display: { kind: "text", value: item.char },
                answer: item.pinyin,
              },
              [item.pinyin, ...sample(others, 3)]
            );
          })
        );
      }
      // 声调辨析
      const pool: PoolItem<{ syllable: string; char: string; quad: (typeof TONE_QUADS)[number] }>[] =
        TONE_QUADS.flatMap((quad) =>
          quad.syllables.map((syllable, i) => ({
            itemKey: `pinyin:tone:${syllable}`,
            item: { syllable, char: quad.chars[i], quad },
          }))
        );
      const items = pickWeighted(pool, mastery, Math.min(count, pool.length));
      return shuffle(
        items.map((item) => ({
          mode: "choice" as const,
          itemKey: `pinyin:tone:${item.syllable}`,
          label: `${item.syllable}（${item.char}）`,
          prompt: "哪个字读这个音？注意声调哦",
          display: { kind: "text", value: item.syllable },
          options: shuffle([...item.quad.chars]),
          answer: item.char,
        }))
      );
    }

    case "letters": {
      const pool: PoolItem<(typeof LETTERS)[number]>[] = LETTERS.map((l) => ({
        itemKey: `letter:${l.letter}`,
        item: l,
      }));
      const items = pickWeighted(pool, mastery, Math.min(count, pool.length));
      return shuffle(
        items.map((item) => {
          if (tier === 1) {
            // 大小写配对：随机大找小 / 小找大
            const upper = Math.random() < 0.5;
            const correct = upper ? item.lower : item.letter;
            const others = LETTERS.filter((l) => l.letter !== item.letter).map((l) =>
              upper ? l.lower : l.letter
            );
            return makeChoiceQuestion(
              {
                itemKey: `letter:${item.letter}`,
                label: `字母 ${item.letter}${item.lower}`,
                prompt: `和「${upper ? item.letter : item.lower}」配对的是哪个？`,
                display: { kind: "text", value: upper ? item.letter : item.lower },
                answer: correct,
              },
              [correct, ...sample(others, 3)]
            );
          }
          if (tier === 2) {
            const others = LETTERS.filter((l) => l.letter !== item.letter).map((l) => l.word);
            return makeChoiceQuestion(
              {
                itemKey: `letter:${item.letter}`,
                label: `字母 ${item.letter} → ${item.word}`,
                prompt: item.endsWith
                  ? `哪个单词里有字母「${item.lower}」？`
                  : `哪个单词以字母「${item.letter}」开头？`,
                display: { kind: "text", value: item.letter, sub: `${item.emoji} ${item.zh}` },
                answer: item.word,
              },
              [item.word, ...sample(others, 3)]
            );
          }
          // 补全单词（X 挖掉末尾字母，其余挖掉首字母）
          const blanked = item.endsWith
            ? item.word.slice(0, -1) + "_"
            : "_" + item.word.slice(1);
          const correct = item.lower;
          const others = LETTERS.filter((l) => l.lower !== correct).map((l) => l.lower);
          return makeChoiceQuestion(
            {
              itemKey: `letter:${item.letter}`,
              label: `补全 ${item.word}`,
              prompt: "缺少的字母是哪个？",
              display: { kind: "text", value: blanked, sub: `${item.emoji} ${item.zh}` },
              answer: correct,
            },
            [correct, ...sample(others, 3)]
          );
        })
      );
    }

    case "poems": {
      const allLower = POEMS.flatMap((p) => p.couplets.map((c) => c.split("，")[1]?.replace("。", "") ?? ""));
      const allUpper = POEMS.flatMap((p) => p.couplets.map((c) => c.split("，")[0] ?? ""));
      if (tier === 1 || tier === 3) {
        // 补全名句（简单：给上句选下句；困难：给下句选上句）
        const pool: PoolItem<{ poem: (typeof POEMS)[number]; couplet: string; idx: number }>[] =
          POEMS.flatMap((poem) =>
            poem.couplets.map((couplet, idx) => ({
              itemKey: `poem:${poem.title}#${idx}`,
              item: { poem, couplet, idx },
            }))
          );
        const items = pickWeighted(pool, mastery, Math.min(count, pool.length));
        const forward = tier === 1;
        return shuffle(
          items.map((item) => {
            const [upper, lower] = item.couplet.split("，").map((s) => s.replace("。", ""));
            const displayText = forward ? `${upper}，` : `${lower}。`;
            const correct = forward ? `${lower}。` : `${upper}，`;
            const distractPool = forward ? allLower : allUpper;
            return makeChoiceQuestion(
              {
                itemKey: `poem:${item.poem.title}#${item.idx}`,
                label: `《${item.poem.title}》${forward ? "下句" : "上句"}`,
                prompt: forward ? "下一句是什么？" : "上一句是什么？",
                display: { kind: "text", value: displayText, sub: `《${item.poem.title}》` },
                answer: correct,
              },
              [correct, ...sample(distractPool.filter((s) => s && s !== (forward ? lower : upper)), 3)]
            );
          })
        );
      }
      // 作者配对
      const pool: PoolItem<(typeof POEMS)[number]>[] = POEMS.map((poem) => ({
        itemKey: `poem:author:${poem.title}`,
        item: poem,
      }));
      const items = pickWeighted(pool, mastery, Math.min(count, pool.length));
      return shuffle(
        items.map((item) => {
          const others = POET_POOL.filter((a) => a !== item.author);
          return makeChoiceQuestion(
            {
              itemKey: `poem:author:${item.title}`,
              label: `《${item.title}》作者`,
              prompt: `《${item.title}》的作者是谁？`,
              display: { kind: "text", value: `《${item.title}》`, sub: item.couplets[0] },
              answer: item.author,
            },
            [item.author, ...sample(others, 3)]
          );
        })
      );
    }

    case "colors": {
      const pool: PoolItem<(typeof COLORS)[number]>[] = COLORS.map((c) => ({
        itemKey: tier === 1 ? `color:${c.en}` : `color:en:${c.en}`,
        item: c,
      }));
      const items = pickWeighted(pool, mastery, Math.min(count, pool.length));
      return shuffle(
        items.map((item) => {
          if (tier === 1) {
            const others = COLORS.filter((c) => c.zh !== item.zh).map((c) => c.zh);
            return makeChoiceQuestion(
              {
                itemKey: `color:${item.en}`,
                label: item.zh,
                prompt: "这是什么颜色？",
                display: { kind: "color", value: item.hex },
                answer: item.zh,
              },
              [item.zh, ...sample(others, 3)]
            );
          }
          if (tier === 2) {
            const others = COLORS.filter((c) => c.en !== item.en).map((c) => c.en);
            return makeChoiceQuestion(
              {
                itemKey: `color:en:${item.en}`,
                label: `${item.zh} → ${item.en}`,
                prompt: `「${item.zh}」的英文是哪个？`,
                display: { kind: "color", value: item.hex, sub: item.zh },
                answer: item.en,
              },
              [item.en, ...sample(others, 3)]
            );
          }
          const others = COLORS.filter((c) => c.zh !== item.zh).map((c) => c.zh);
          return makeChoiceQuestion(
            {
              itemKey: `color:en:${item.en}`,
              label: `${item.zh} → ${item.en}`,
              prompt: `「${item.en}」是什么颜色？`,
              display: { kind: "text", value: item.en },
              answer: item.zh,
            },
            [item.zh, ...sample(others, 3)]
          );
        })
      );
    }

    case "words": {
      const list = WORDS[tier];
      const pool: PoolItem<(typeof list)[number]>[] = list.map((w) => ({
        itemKey: `word:${w.en}`,
        item: w,
      }));
      const items = pickWeighted(pool, mastery, Math.min(count, pool.length));
      return shuffle(
        items.map((item) => {
          if (tier === 1) {
            const others = list.filter((w) => w.zh !== item.zh).map((w) => w.zh);
            return makeChoiceQuestion(
              {
                itemKey: `word:${item.en}`,
                label: `${item.en}（${item.zh}）`,
                prompt: "这个单词是什么意思？",
                display: { kind: "emoji", value: item.emoji, sub: item.en },
                answer: item.zh,
              },
              [item.zh, ...sample(others, 3)]
            );
          }
          const others = list.filter((w) => w.en !== item.en).map((w) => w.en);
          return makeChoiceQuestion(
            {
              itemKey: `word:${item.en}`,
              label: `${item.en}（${item.zh}）`,
              prompt:
                tier === 2
                  ? `「${item.zh}」的英文是哪个？`
                  : "哪个单词和图片是好朋友？",
              display: tier === 2 ? { kind: "text", value: item.zh } : { kind: "emoji", value: item.emoji },
              answer: item.en,
            },
            [item.en, ...sample(others, 3)]
          );
        })
      );
    }
  }
}
