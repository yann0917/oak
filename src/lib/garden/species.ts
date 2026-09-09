// 花园物种表：活动 → 物种的唯一映射来源
import type { ActivityKey, GameKey } from "./types";

export interface SpeciesMeta {
  key: string;
  /** 中文名（气泡与 TTS 用） */
  name: string;
  emoji: string;
  /** 构件 GLB 文件名（不含扩展名），对应 public/models/garden/<file>.glb */
  file: string;
  /** 成株高度（米），three.js 里按格子缩放用 */
  height: number;
}

export const SPECIES: Record<string, SpeciesMeta> = {
  bamboo: { key: "bamboo", name: "竹子", emoji: "🎋", file: "bamboo", height: 1.2 },
  sunflower: { key: "sunflower", name: "向日葵", emoji: "🌻", file: "sunflower", height: 1.0 },
  bluebell: { key: "bluebell", name: "风铃草", emoji: "🪻", file: "bluebell", height: 0.6 },
  tulip: { key: "tulip", name: "郁金香", emoji: "🌷", file: "tulip", height: 0.6 },
  plum: { key: "plum", name: "梅树", emoji: "🌸", file: "plum", height: 1.2 },
  hydrangea: { key: "hydrangea", name: "绣球", emoji: "💠", file: "hydrangea", height: 0.7 },
  osmanthus: { key: "osmanthus", name: "桂花树", emoji: "🌼", file: "osmanthus", height: 1.1 },
  daisy: { key: "daisy", name: "雏菊", emoji: "🌼", file: "daisy", height: 0.5 },
};

export const DEFAULT_SPECIES = "daisy";

/** 活动 → 物种（多对一）；未知活动回退到雏菊 */
export const ACTIVITY_SPECIES: Record<ActivityKey | GameKey, string> = {
  characters: "bamboo",
  words: "bamboo",
  math: "sunflower",
  pinyin: "bluebell",
  letters: "tulip",
  poems: "plum",
  colors: "hydrangea",
  idioms: "osmanthus",
  "fruit-slice": "daisy",
  "gesture-magic": "daisy",
  "gesture-dance": "daisy",
  "rock-paper-scissors": "daisy",
  "bubble-pop": "daisy",
  "jump-score": "daisy",
  "magic-wand": "daisy",
  "traffic-commander": "daisy",
};

export function speciesForActivity(activity: string): string {
  return ACTIVITY_SPECIES[activity as ActivityKey | GameKey] ?? DEFAULT_SPECIES;
}

export function speciesMeta(key: string): SpeciesMeta {
  return SPECIES[key] ?? SPECIES[DEFAULT_SPECIES];
}
