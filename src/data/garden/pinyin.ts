// 拼音乐园内容：声母 / 韵母 / 整体认读音节 + 汉字选音 + 声调辨析
export const PINYIN_INITIALS = [
  "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h",
  "j", "q", "x", "zh", "ch", "sh", "r", "z", "c", "s", "y", "w",
];

export const PINYIN_FINALS = [
  "a", "o", "e", "i", "u", "ü", "ai", "ei", "ui", "ao", "ou", "iu",
  "ie", "üe", "er", "an", "en", "in", "un", "ün", "ang", "eng", "ing", "ong",
];

export const PINYIN_WHOLE = [
  "zhi", "chi", "shi", "ri", "zi", "ci", "si",
  "yi", "wu", "yu", "ye", "yue", "yuan", "yin", "yun", "ying",
];

// 中等难度：给汉字选拼音
export const PINYIN_CHARS: { char: string; pinyin: string }[] = [
  { char: "妈", pinyin: "mā" },
  { char: "爸", pinyin: "bà" },
  { char: "米", pinyin: "mǐ" },
  { char: "大", pinyin: "dà" },
  { char: "地", pinyin: "dì" },
  { char: "花", pinyin: "huā" },
  { char: "鸟", pinyin: "niǎo" },
  { char: "鱼", pinyin: "yú" },
  { char: "马", pinyin: "mǎ" },
  { char: "月", pinyin: "yuè" },
  { char: "火", pinyin: "huǒ" },
  { char: "车", pinyin: "chē" },
  { char: "书", pinyin: "shū" },
  { char: "笔", pinyin: "bǐ" },
  { char: "山", pinyin: "shān" },
  { char: "田", pinyin: "tián" },
  { char: "虫", pinyin: "chóng" },
  { char: "云", pinyin: "yún" },
  { char: "雨", pinyin: "yǔ" },
  { char: "电", pinyin: "diàn" },
  { char: "猫", pinyin: "māo" },
  { char: "狗", pinyin: "gǒu" },
  { char: "门", pinyin: "mén" },
  { char: "窗", pinyin: "chuāng" },
];

// 困难难度：同音不同调的四声组
export interface ToneQuad {
  syllables: [string, string, string, string]; // 同一声韵、四声各一
  chars: [string, string, string, string]; // 对应汉字
}

export const TONE_QUADS: ToneQuad[] = [
  { syllables: ["mā", "má", "mǎ", "mà"], chars: ["妈", "麻", "马", "骂"] },
  { syllables: ["bā", "bá", "bǎ", "bà"], chars: ["八", "拔", "把", "爸"] },
  { syllables: ["qiān", "qián", "qiǎn", "qiàn"], chars: ["千", "钱", "浅", "欠"] },
  { syllables: ["hū", "hú", "hǔ", "hù"], chars: ["呼", "湖", "虎", "户"] },
  { syllables: ["wū", "wú", "wǔ", "wù"], chars: ["屋", "无", "五", "物"] },
  { syllables: ["yī", "yí", "yǐ", "yì"], chars: ["一", "移", "已", "意"] },
];

// 拼音朗读注音表：拉丁音节交给 TTS 会被按英文字母读（b→bee），
// 转成小学"呼读音"汉字再朗读，中文 TTS 读汉字发音准确。
// 声母/韵母/整体认读音节的读音与表内汉字完全一一对应。
export const PINYIN_READ: Record<string, string> = {
  // 声母呼读音（b 波、p 坡、m 摸、f 佛 …）
  b: "波", p: "坡", m: "摸", f: "佛",
  d: "得", t: "特", n: "讷", l: "勒",
  g: "哥", k: "科", h: "喝",
  j: "基", q: "欺", x: "希",
  zh: "知", ch: "吃", sh: "诗", r: "日",
  z: "资", c: "疵", s: "思",
  y: "医", w: "屋",
  // 韵母呼读音
  a: "啊", o: "喔", e: "鹅", i: "衣", u: "乌", ü: "迂",
  ai: "哀", ei: "诶", ui: "威",
  ao: "熬", ou: "欧", iu: "优",
  ie: "耶", üe: "约", er: "儿",
  an: "安", en: "恩", in: "因", un: "温", ün: "晕",
  ang: "昂", eng: "鞥", ing: "英", ong: "翁",
  // 整体认读音节
  zhi: "知", chi: "吃", shi: "诗", ri: "日",
  zi: "资", ci: "疵", si: "思",
  yi: "医", wu: "屋", yu: "迂",
  ye: "耶", yue: "约", yuan: "渊",
  yin: "因", yun: "晕", ying: "英",
};
