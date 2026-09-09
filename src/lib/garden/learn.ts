// 学习园地「学一学」层：把各活动的学习内容整理成可点读的卡片组，
// 并生成「听一听」辨认小游戏的题目（蒙氏三阶段：命名 → 辨认 → 回忆）。
// 纯函数、无副作用，音频文本只描述"读什么、用哪个音色"，播放交给 speech.ts。
import { BUILTIN_CHARACTERS } from "@/data/garden/characters";
import { COLORS } from "@/data/garden/colors";
import { LETTERS } from "@/data/garden/letters";
import { NUMBERS } from "@/data/garden/numbers";
import { PINYIN_FINALS, PINYIN_INITIALS, PINYIN_READ, PINYIN_WHOLE } from "@/data/garden/pinyin";
import { POEMS } from "@/data/garden/poems";
import { WORDS } from "@/data/garden/words";
import type { TtsVoice } from "@/lib/tts/voices";
import { tierOf, type ActivityKey, type CustomCharacter, type Difficulty } from "./types";

/** 语气参数（与 speech.ts 的 SpeakTone 结构一致，纯函数层不引客户端模块） */
export interface LearnTone {
  rate?: string;
  pitch?: string;
  volume?: string;
}

/** 一段要读的语音：文本 + 音色 + 语气 */
export interface LearnSpeech {
  text: string;
  voice: TtsVoice;
  tone?: LearnTone;
}

/** 卡面（认一认卡墙与听一听选项共用一套渲染分支） */
export type LearnFace =
  | { kind: "char"; char: string; pinyin: string; word: string }
  | { kind: "letter"; upper: string; lower: string; word: string; zh: string; emoji: string }
  | { kind: "pinyin"; symbol: string; read: string }
  | { kind: "number"; n: number; cn: string; en: string }
  | { kind: "color"; hex: string; zh: string; en: string }
  | { kind: "word"; emoji: string; en: string; zh: string }
  | { kind: "poem"; title: string; author: string; lines: { text: string; pinyin: string }[] };

export interface LearnCard {
  key: string;
  label: string; // 无障碍名 + 听一听答案名
  face: LearnFace;
  speak: LearnSpeech[]; // 点读内容（依次播放）
  listen?: LearnSpeech[]; // 听一听播放内容（缺省用 speak）
  listenVariants?: LearnSpeech[][]; // 多个可选播放内容（古诗：随机取一联）
  group?: string; // 分组（拼音：声母/韵母/整体认读音节）
}

export interface LearnSpec {
  wall: string; // 第 1 步名称（认一认 / 读一读 / 认数字 / 学一学）
  wallHint: string;
  listen: string; // 第 2 步名称
  listenPrompt: string; // 听一听题干
}

export const LEARN_SPEC: Record<ActivityKey, LearnSpec> = {
  characters: {
    wall: "认一认",
    wallHint: "点一点字卡，听听它怎么念，再看看它能组什么词",
    listen: "听一听",
    listenPrompt: "刚才念的是哪个字？",
  },
  letters: {
    wall: "认一认",
    wallHint: "点一点字母卡，先听字母的名字，再听它在单词里的声音",
    listen: "听一听",
    listenPrompt: "刚才听到的是哪个字母？",
  },
  pinyin: {
    wall: "认一认",
    wallHint: "点一点拼音卡，跟着呼读音读一读，记住它们的样子",
    listen: "听一听",
    listenPrompt: "刚才读的是哪个拼音？",
  },
  poems: {
    wall: "读一读",
    wallHint: "点每一句诗听一听，再点「跟读 3 遍」大声念出来",
    listen: "听一听",
    listenPrompt: "这两句诗是哪首古诗里的？",
  },
  math: {
    wall: "认数字",
    wallHint: "点一点数字卡，听一听它的名字（可以切换中文/英文）",
    listen: "听一听",
    listenPrompt: "刚才听到的是哪个数字？",
  },
  colors: {
    wall: "认一认",
    wallHint: "点一点色卡，听一听它的名字，看准颜色再记一记",
    listen: "听一听",
    listenPrompt: "刚才说的是哪个颜色？",
  },
  words: {
    wall: "学一学",
    wallHint: "点一点单词卡，先听英文，再听中文意思",
    listen: "听一听",
    listenPrompt: "刚才听到的是哪个单词？",
  },
  idioms: {
    wall: "认一认",
    wallHint: "点一点成语卡，听一听它怎么读",
    listen: "听一听",
    listenPrompt: "刚才念的是哪个成语？",
  },
};

/** 认读卡墙里会随难度换内容的（只有识字卡和英语单词分档） */
export const TIER_SENSITIVE: ActivityKey[] = ["characters", "words"];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- 各活动卡组 ----------

function characterCards(difficulty: Difficulty, custom: CustomCharacter[]): LearnCard[] {
  const tier = tierOf(difficulty);
  const map = new Map<string, { char: string; pinyin: string; word: string }>();
  for (const b of BUILTIN_CHARACTERS[tier]) {
    map.set(b.char, { char: b.char, pinyin: b.pinyin, word: b.word });
  }
  for (const c of custom) {
    if (c.tier === tier) map.set(c.char, { char: c.char, pinyin: c.pinyin, word: c.word || "" });
  }
  return Array.from(map.values()).map((item) => ({
    key: `char:${item.char}`,
    label: item.char,
    face: { kind: "char" as const, ...item },
    speak: [{ text: item.word ? `${item.char}，${item.word}` : item.char, voice: "xiaoyi" as const }],
  }));
}

function letterCards(): LearnCard[] {
  return LETTERS.map((l) => ({
    key: `letter:${l.letter}`,
    label: `字母 ${l.letter}`,
    face: {
      kind: "letter" as const,
      upper: l.letter,
      lower: l.lower,
      word: l.word,
      zh: l.zh,
      emoji: l.emoji,
    },
    // 字母名 → 例词：拼读课的第一课就是"先叫名字，再听它在单词里的声音"
    speak: [
      { text: l.letter, voice: "ana" as const },
      { text: l.word, voice: "ana" as const },
    ],
  }));
}

function pinyinCards(): LearnCard[] {
  const groups = [
    { name: "声母", values: PINYIN_INITIALS },
    { name: "韵母", values: PINYIN_FINALS },
    { name: "整体认读音节", values: PINYIN_WHOLE },
  ];
  return groups.flatMap((g) =>
    g.values.map((v) => {
      const read = PINYIN_READ[v] ?? v;
      return {
        key: `pinyin:${g.name}:${v}`,
        label: v,
        group: g.name,
        face: { kind: "pinyin" as const, symbol: v, read },
        // 拉丁音节直接读会被 TTS 按英文字母念，转成呼读音汉字再读
        speak: [{ text: read, voice: "yunxia" as const }],
      };
    })
  );
}

function numberCards(lang: "cn" | "en"): LearnCard[] {
  return NUMBERS.map((item) => ({
    key: `number:${item.n}`,
    label: String(item.n),
    face: { kind: "number" as const, n: item.n, cn: item.cn, en: item.en },
    speak: [
      { text: item.cn, voice: "xiaoyi" as const },
      { text: item.en, voice: "ana" as const },
    ],
    listen:
      lang === "cn"
        ? [{ text: item.cn, voice: "xiaoyi" as const }]
        : [{ text: item.en, voice: "ana" as const }],
  }));
}

function colorCards(): LearnCard[] {
  return COLORS.map((c) => ({
    key: `color:${c.en}`,
    label: c.zh,
    face: { kind: "color" as const, hex: c.hex, zh: c.zh, en: c.en },
    speak: [
      { text: c.zh, voice: "xiaoyi" as const },
      { text: c.en, voice: "ana" as const },
    ],
  }));
}

function wordCards(difficulty: Difficulty): LearnCard[] {
  return WORDS[tierOf(difficulty)].map((w) => ({
    key: `word:${w.en}`,
    label: w.en,
    face: { kind: "word" as const, emoji: w.emoji, en: w.en, zh: w.zh },
    speak: [
      { text: w.en, voice: "ana" as const },
      { text: w.zh, voice: "xiaoyi" as const },
    ],
  }));
}

function poemCards(): LearnCard[] {
  return POEMS.map((p) => {
    const lines = p.lines;
    return {
      key: `poem:${p.title}`,
      label: `《${p.title}》`,
      face: { kind: "poem" as const, title: p.title, author: p.author, lines },
      speak: [
        {
          text: `《${p.title}》。${lines.map((l) => l.text).join("")}`,
          voice: "xiaoxiao" as const,
        },
      ],
      // 听句找诗：随机取一联（相邻两句）念出来，四张诗卡里选出处
      listenVariants: [lines.slice(0, 2), lines.slice(2, 4)].map((pair) => [
        {
          text: `${pair[0].text}${pair[1].text}`,
          voice: "xiaoxiao" as const,
        },
      ]),
    };
  });
}

export interface LearnDeckOptions {
  activity: ActivityKey;
  difficulty: Difficulty;
  customCharacters?: CustomCharacter[];
  numberLang?: "cn" | "en";
}

export function buildLearnDeck(opts: LearnDeckOptions): LearnCard[] {
  switch (opts.activity) {
    case "characters":
      return characterCards(opts.difficulty, opts.customCharacters ?? []);
    case "letters":
      return letterCards();
    case "pinyin":
      return pinyinCards();
    case "poems":
      return poemCards();
    case "math":
      return numberCards(opts.numberLang ?? "cn");
    case "colors":
      return colorCards();
    case "words":
      return wordCards(opts.difficulty);
    default:
      return [];
  }
}

// ---------- 听一听（辨认小游戏） ----------

export interface ListenOption {
  card: LearnCard;
  speak?: LearnSpeech[]; // 选项上的小喇叭（古诗卡可先听再选）
}

export interface ListenQuestion {
  answerKey: string;
  play: LearnSpeech[]; // 播放内容
  hint?: { lines: { text: string; pinyin: string }[] }; // 屏幕提示（古诗显示这两句，逐字注音）
  options: ListenOption[];
}

/** 选项小喇叭内容：古诗念「诗名 + 开头一联」，其余活动不加小喇叭 */
function optionPreview(card: LearnCard): LearnSpeech[] | undefined {
  if (card.face.kind !== "poem") return undefined;
  const first = card.face.lines.slice(0, 2).map((l) => l.text).join("");
  return [{ text: `《${card.face.title}》。${first}`, voice: "xiaoxiao" }];
}

export function buildListenRound(
  deck: LearnCard[],
  count: number,
  optionCount = 4
): ListenQuestion[] {
  if (deck.length < 2) return [];
  const targetCount = Math.min(count, deck.length);
  return shuffle(deck)
    .slice(0, targetCount)
    .map((target) => {
      const distractors = shuffle(deck.filter((c) => c.key !== target.key)).slice(
        0,
        Math.max(1, optionCount - 1)
      );
      const options = shuffle([target, ...distractors]).map((card) => ({
        card,
        speak: optionPreview(card),
      }));

      let play: LearnSpeech[];
      let hint: ListenQuestion["hint"];
      if (target.face.kind === "poem" && target.listenVariants?.length) {
        // 听句找诗：随机取一联念出来，屏幕同步显示这两句（逐字注音）
        const variant = Math.floor(Math.random() * target.listenVariants.length);
        play = target.listenVariants[variant];
        hint = { lines: target.face.lines.slice(variant * 2, variant * 2 + 2) };
      } else {
        play = target.listen ?? target.speak;
      }
      return { answerKey: target.key, play, hint, options };
    });
}
