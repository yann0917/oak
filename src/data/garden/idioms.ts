// 成语卡片内置词库：成语 + 拼音（带声调）+ 儿童向解释与例句。
// 拼音/解释/例句离线内置，保证准确稳定不依赖模型；
// 故事由 AI 按年龄组生成（结果缓存于 garden_idiom_stories 表）。
export interface BuiltinIdiom {
  word: string;
  pinyin: string; // 带声调，如 huà shé tiān zú
  meaning: string; // 儿童向解释
  example: string; // 儿童向例句（含成语）
}

/** 故事年龄组：AI 按年龄段调整讲法；切换年龄组会重新生成故事 */
export const AGE_GROUPS = [
  { key: "3-6", label: "3-6 岁" },
  { key: "7-9", label: "7-9 岁" },
  { key: "10-12", label: "10-12 岁" },
] as const;
export type AgeGroupKey = (typeof AGE_GROUPS)[number]["key"];

export function ageGroupOfAge(years: number): AgeGroupKey {
  if (years <= 6) return "3-6";
  if (years <= 9) return "7-9";
  return "10-12";
}

export const BUILTIN_IDIOMS: BuiltinIdiom[] = [
  { word: "画蛇添足", pinyin: "huà shé tiān zú", meaning: "做了多余的事，反而把好事弄坏了。", example: "作文已经写完，又加了一句废话，真是画蛇添足。" },
  { word: "亡羊补牢", pinyin: "wáng yáng bǔ láo", meaning: "羊丢了马上修补羊圈还不晚，出了错赶紧补救就来得及。", example: "上次忘了复习，这次亡羊补牢，把课文多读了两遍。" },
  { word: "守株待兔", pinyin: "shǒu zhū dài tù", meaning: "守着树桩等兔子撞上来，比喻不努力、只想靠运气。", example: "捡过一次便宜就天天守株待兔，可不是好办法。" },
  { word: "拔苗助长", pinyin: "bá miáo zhù zhǎng", meaning: "把禾苗往上拔帮它长，禾苗反而死了；比喻太着急反而坏事。", example: "学习要一步一步来，可不能拔苗助长。" },
  { word: "井底之蛙", pinyin: "jǐng dǐ zhī wā", meaning: "井底的青蛙以为天只有井口大，比喻眼光小、见识少。", example: "多出去走走看看，才不会做井底之蛙。" },
  { word: "刻舟求剑", pinyin: "kè zhōu qiú jiàn", meaning: "在船上刻记号找掉进江里的剑，船走了剑不会跟着走；比喻不会变通。", example: "用去年的老办法对付新问题，等于刻舟求剑。" },
  { word: "掩耳盗铃", pinyin: "yǎn ěr dào líng", meaning: "捂住耳朵偷铃铛，以为自己听不见别人也不知道；比喻自己骗自己。", example: "作业没写完就藏起来，掩耳盗铃可不行。" },
  { word: "狐假虎威", pinyin: "hú jiǎ hǔ wēi", meaning: "狐狸借老虎的威风吓唬其他动物，比喻仗着别人的势力吓唬人。", example: "小猴子拿着大象的旗子在森林里狐假虎威。" },
  { word: "滥竽充数", pinyin: "làn yú chōng shù", meaning: "不会吹竽的人混在乐队里充人数，比喻没有真本事混在里面。", example: "唱歌时要大胆唱，可不要滥竽充数哦。" },
  { word: "自相矛盾", pinyin: "zì xiāng máo dùn", meaning: "自己说的话、做的事前后打架，互相冲突。", example: "一会儿说喜欢下雨，一会儿又说讨厌下雨，太自相矛盾了吧。" },
  { word: "塞翁失马", pinyin: "sài wēng shī mǎ", meaning: "丢了马不一定坏事，坏事有时会变成好事。", example: "比赛输了别灰心，塞翁失马，焉知非福。" },
  { word: "愚公移山", pinyin: "yú gōng yí shān", meaning: "愚公决心把门前的大山搬走，比喻有毅力、肯坚持就能成功。", example: "背单词就像愚公移山，坚持下去一定能记住。" },
  { word: "铁杵磨针", pinyin: "tiě chǔ mó zhēn", meaning: "把铁棒磨成绣花针，比喻只要有恒心，再难的事也能做成。", example: "跳绳天天练，铁杵磨针，总有一天能连跳一百个。" },
  { word: "精卫填海", pinyin: "jīng wèi tián hǎi", meaning: "小鸟精卫每天衔石头填大海，比喻做事有毅力、坚持到底。", example: "错题一道一道弄懂，就像精卫填海。" },
  { word: "画龙点睛", pinyin: "huà lóng diǎn jīng", meaning: "画好龙最后点上眼睛，龙就活了起来；比喻关键一笔让内容更精彩。", example: "你的画加上一只小蝴蝶收尾，真是画龙点睛。" },
  { word: "对牛弹琴", pinyin: "duì niú tán qín", meaning: "对着牛弹琴，牛听不懂；比喻对听不懂的人讲道理，白费力气。", example: "跟听不懂音符的小朋友讲乐谱，像对牛弹琴。" },
  { word: "惊弓之鸟", pinyin: "jīng gōng zhī niǎo", meaning: "被弓箭吓过的鸟，听到弓弦响就怕，比喻受了惊吓就特别胆怯。", example: "被小猫吓过的小白兔，听到脚步声就逃跑，成了惊弓之鸟。" },
  { word: "望梅止渴", pinyin: "wàng méi zhǐ kě", meaning: "想到前面有梅林就流酸水解了渴，比喻用想象安慰自己。", example: "饿了只能看美食图片，真是望梅止渴。" },
  { word: "纸上谈兵", pinyin: "zhǐ shàng tán bīng", meaning: "只在纸上下棋、讲打仗，比喻只会说不会做。", example: "背熟了游泳姿势却不下水，只是纸上谈兵。" },
  { word: "负荆请罪", pinyin: "fù jīng qǐng zuì", meaning: "背上荆条上门认错，比喻主动承认错误、诚恳道歉。", example: "弄坏同桌的橡皮后，我带着新橡皮去负荆请罪。" },
  { word: "完璧归赵", pinyin: "wán bì guī zhào", meaning: "把和氏璧完好地送回赵国，比喻把借的东西完好归还。", example: "借来的绘本看完就按时还，做到完璧归赵。" },
  { word: "一叶障目", pinyin: "yī yè zhàng mù", meaning: "一片叶子挡住眼睛就看不见世界，比喻被小事情蒙住、看不到大局。", example: "只盯着丢的一颗糖大哭，有点一叶障目了。" },
  { word: "朝三暮四", pinyin: "zhāo sān mù sì", meaning: "早上三个、晚上四个，主意一改再改；比喻反复无常。", example: "一会儿想学钢琴，一会儿想学吉他，别朝三暮四哦。" },
  { word: "爱不释手", pinyin: "ài bù shì shǒu", meaning: "喜欢得舍不得放下。", example: "新玩具小熊他爱不释手，连睡觉都抱着。" },
  { word: "笨鸟先飞", pinyin: "bèn niǎo xiān fēi", meaning: "笨鸟怕落后先飞，比喻能力差就比别人先下功夫。", example: "我背课文慢，那就笨鸟先飞，提前一天开始背。" },
  { word: "半途而废", pinyin: "bàn tú ér fèi", meaning: "事情做到一半就放弃。", example: "学游泳要坚持，可别半途而废。" },
  { word: "水滴石穿", pinyin: "shuǐ dī shí chuān", meaning: "水不停地滴，石头也能滴穿，比喻坚持到底就能成功。", example: "每天练十分钟字，水滴石穿，字会越来越漂亮。" },
  { word: "聚沙成塔", pinyin: "jù shā chéng tǎ", meaning: "沙子一点点聚起来能堆成塔，比喻积少成多。", example: "每天存一元，聚沙成塔，攒了满满一罐。" },
  { word: "目不转睛", pinyin: "mù bù zhuǎn jīng", meaning: "眼睛一动不动地盯着看，比喻十分专心。", example: "看动画片时他目不转睛，连妈妈喊都没听见。" },
  { word: "津津有味", pinyin: "jīn jīn yǒu wèi", meaning: "吃东西或看东西很有滋味，比喻非常有兴趣。", example: "弟弟听恐龙的绘本听得津津有味。" },
  { word: "手舞足蹈", pinyin: "shǒu wǔ zú dǎo", meaning: "高兴得手也舞、脚也跳。", example: "听说要去动物园，妹妹手舞足蹈地转起圈来。" },
  { word: "自言自语", pinyin: "zì yán zì yǔ", meaning: "自己一个人对自己说话。", example: "妹妹一边拼积木一边自言自语。" },
];

export const IDIOM_MAP: Record<string, BuiltinIdiom> = Object.fromEntries(
  BUILTIN_IDIOMS.map((i) => [i.word, i])
);
