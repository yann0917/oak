// 学习园地共享类型（client / server 通用）
export type Difficulty = "简单" | "中等" | "困难";
export const DIFFICULTIES: Difficulty[] = ["简单", "中等", "困难"];

export const ACTIVITY_KEYS = [
  "characters", "math", "pinyin", "letters", "poems", "colors", "words",
] as const;
export type ActivityKey = (typeof ACTIVITY_KEYS)[number];

export type MathOp = "add" | "sub" | "mul" | "div";

// 数学某档难度的参数：题型 + 数值上限（乘除法自动限制在九九口诀内）
export interface MathTierConfig {
  ops: MathOp[];
  max: number;
}

export type Tier = 1 | 2 | 3;

// 每孩子每活动的个性化配置（garden_settings.config JSON）
export interface ActivityConfig {
  roundSize?: number; // 每轮题量 5~20
  math?: Record<Tier, MathTierConfig>;
  characters?: { builtin?: Record<string, boolean> }; // 各档是否含内置字库，key "1"|"2"|"3"
}

export interface MasteryItem {
  itemKey: string;
  label?: string;
  correctCount: number;
  wrongCount: number;
  lastCorrect: number; // 最近一次是否答对 0|1
}

// 识字卡自定义字库条目（来自 /api/garden-characters）
export interface CustomCharacter {
  id: number;
  char: string;
  pinyin: string;
  word: string;
  tier: number;
}

export type QuestionDisplay =
  | { kind: "text"; value: string; sub?: string } // 大号文字（汉字/拼音/单词）
  | { kind: "emoji"; value: string; sub?: string } // 例词配图
  | { kind: "color"; value: string; sub?: string } // 色块（hex）
  | { kind: "formula"; value: string }; // 算式

export interface Question {
  mode: "choice" | "keypad" | "flashcard"; // keypad：数字键盘输入（数学）
  itemKey: string; // 知识点唯一键（掌握度统计用）
  label: string; // 知识点展示名（错题回顾）
  prompt: string; // 题干
  display: QuestionDisplay; // 卡面主体
  options: string[]; // choice 模式的选项（已打乱）
  answer: string; // choice 的正确选项 / keypad 的正确数值
  flip?: { pinyin: string; word: string }; // flashcard 翻面内容
}

export const MATH_OP_LABEL: Record<MathOp, string> = {
  add: "加法",
  sub: "减法",
  mul: "乘法",
  div: "除法",
};

export const MATH_OP_SYMBOL: Record<MathOp, string> = {
  add: "+",
  sub: "−",
  mul: "×",
  div: "÷",
};

export function tierOf(difficulty: Difficulty): Tier {
  return difficulty === "简单" ? 1 : difficulty === "中等" ? 2 : 3;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}
