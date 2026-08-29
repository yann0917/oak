// 学习园地活动注册表：卡片列表、阶段筛选、难度说明都从这里派生
import type { ActivityKey, Difficulty } from "./types";

export interface ActivityMeta {
  key: ActivityKey;
  name: string;
  desc: string;
  glyph: string; // 卡片大字图形
  color: string; // animal-island-ui 色名（CardColor/TagColor 取值）
  stages: string[]; // 目标阶段：仅 幼儿园/小学
  mode: "choice" | "flashcard";
  difficultyInfo: Record<Difficulty, string>;
}

export const GARDEN_ACTIVITIES: ActivityMeta[] = [
  {
    key: "characters",
    name: "识字卡",
    desc: "翻卡片认汉字，读一读再组个词",
    glyph: "字",
    color: "app-green",
    stages: ["幼儿园", "小学"],
    mode: "flashcard",
    difficultyInfo: { 简单: "启蒙高频字", 中等: "常用字", 困难: "进阶字" },
  },
  {
    key: "math",
    name: "数学闯关",
    desc: "加减乘除小关卡，算对了才通过",
    glyph: "数",
    color: "app-blue",
    stages: ["幼儿园", "小学"],
    mode: "choice",
    difficultyInfo: { 简单: "10 以内加减法", 中等: "20 以内进位退位", 困难: "表内乘除法" },
  },
  {
    key: "pinyin",
    name: "拼音乐园",
    desc: "声母韵母手拉手，读准音节不迷路",
    glyph: "拼",
    color: "purple",
    stages: ["幼儿园", "小学"],
    mode: "choice",
    difficultyInfo: { 简单: "声母韵母分类", 中等: "汉字选拼音", 困难: "声调辨析" },
  },
  {
    key: "letters",
    name: "字母天地",
    desc: "26 个字母朋友，和单词做游戏",
    glyph: "A",
    color: "app-orange",
    stages: ["幼儿园", "小学"],
    mode: "choice",
    difficultyInfo: { 简单: "大小写配对", 中等: "字母找单词", 困难: "补全单词" },
  },
  {
    key: "poems",
    name: "唐诗宋词",
    desc: "诗词接龙，把名句补充完整",
    glyph: "诗",
    color: "brown",
    stages: ["幼儿园", "小学"],
    mode: "choice",
    difficultyInfo: { 简单: "补全名句", 中等: "作者配对", 困难: "倒背如流" },
  },
  {
    key: "colors",
    name: "颜色认知",
    desc: "红橙黄绿蓝靛紫，中英文都说得出",
    glyph: "色",
    color: "app-pink",
    stages: ["幼儿园"],
    mode: "choice",
    difficultyInfo: { 简单: "看色块认颜色", 中等: "中文变英文", 困难: "英文变中文" },
  },
  {
    key: "words",
    name: "英语单词",
    desc: "看图猜单词，一步一步往上跳",
    glyph: "词",
    color: "app-teal",
    stages: ["幼儿园", "小学"],
    mode: "choice",
    difficultyInfo: { 简单: "看图认词（英译中）", 中等: "中译英", 困难: "进阶词汇" },
  },
];

export const ACTIVITY_MAP: Record<string, ActivityMeta> = Object.fromEntries(
  GARDEN_ACTIVITIES.map((a) => [a.key, a])
);

// 阶段筛选选项由活动标签派生（当前只有 幼儿园/小学）
export const GARDEN_STAGES: string[] = Array.from(
  new Set(GARDEN_ACTIVITIES.flatMap((a) => a.stages))
);

// animal-island-ui CardColor 官方色板（活动图形底色与组件库卡片同源）
export const ACTIVITY_PALETTE: Record<string, string> = {
  "app-pink": "#f8a6b2",
  purple: "#b77dee",
  "app-blue": "#889df0",
  "app-yellow": "#f7cd67",
  "app-orange": "#e59266",
  "app-teal": "#82d5bb",
  "app-green": "#8ac68a",
  brown: "#9a835a",
};
