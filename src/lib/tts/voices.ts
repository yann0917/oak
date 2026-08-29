// 通用音色映射（client / server 共用，无任何依赖）：短名 → Edge TTS 音色
// 学习园地的入口分配：
//   xiaoyi  女·卡通·活泼 → 猫头鹰台词 / 识字卡跟读（默认音色）
//   yunxia  男·卡通风   → 拼音跟读
//   xiaoxiao 女·温暖    → 诗文朗读（讲故事 / 家长端播报也用它）
//   ana     英文童声    → 字母 / 单词发音
export const TTS_VOICES = {
  xiaoyi: "zh-CN-XiaoyiNeural",
  yunxia: "zh-CN-YunxiaNeural",
  xiaoxiao: "zh-CN-XiaoxiaoNeural",
  ana: "en-US-AnaNeural",
} as const;

export type TtsVoice = keyof typeof TTS_VOICES;
