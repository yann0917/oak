// 古诗花园内容：幼儿园~小学段的蒙学经典，每首 4 个分句（五言/七言绝句），句末标点随句携带
// （第 1/3 句「，」、第 2/4 句「。」，与出题用的「上句，下句。」完全一致）。
// pinyin 逐字标注（按字以空格分隔，与 text 中的汉字顺序一一对应），由 pinyin-pro 生成后人工校对；
// 标点不占拼音位（渲染时按汉字依次取音节）。
export interface PoemLine {
  text: string;
  pinyin: string;
}

export interface Poem {
  title: string;
  author: string;
  lines: PoemLine[];
}

export const POEMS: Poem[] = [
  {
    title: "静夜思",
    author: "李白",
    lines: [
      { text: "床前明月光，", pinyin: "chuáng qián míng yuè guāng" },
      { text: "疑是地上霜。", pinyin: "yí shì dì shàng shuāng" },
      { text: "举头望明月，", pinyin: "jǔ tóu wàng míng yuè" },
      { text: "低头思故乡。", pinyin: "dī tóu sī gù xiāng" },
    ],
  },
  {
    title: "咏鹅",
    author: "骆宾王",
    lines: [
      { text: "鹅，鹅，鹅，", pinyin: "é é é" },
      { text: "曲项向天歌。", pinyin: "qū xiàng xiàng tiān gē" },
      { text: "白毛浮绿水，", pinyin: "bái máo fú lǜ shuǐ" },
      { text: "红掌拨清波。", pinyin: "hóng zhǎng bō qīng bō" },
    ],
  },
  {
    title: "春晓",
    author: "孟浩然",
    lines: [
      { text: "春眠不觉晓，", pinyin: "chūn mián bù jué xiǎo" },
      { text: "处处闻啼鸟。", pinyin: "chù chù wén tí niǎo" },
      { text: "夜来风雨声，", pinyin: "yè lái fēng yǔ shēng" },
      { text: "花落知多少。", pinyin: "huā luò zhī duō shǎo" },
    ],
  },
  {
    title: "悯农",
    author: "李绅",
    lines: [
      { text: "锄禾日当午，", pinyin: "chú hé rì dāng wǔ" },
      { text: "汗滴禾下土。", pinyin: "hàn dī hé xià tǔ" },
      { text: "谁知盘中餐，", pinyin: "shuí zhī pán zhōng cān" },
      { text: "粒粒皆辛苦。", pinyin: "lì lì jiē xīn kǔ" },
    ],
  },
  {
    title: "登鹳雀楼",
    author: "王之涣",
    lines: [
      { text: "白日依山尽，", pinyin: "bái rì yī shān jìn" },
      { text: "黄河入海流。", pinyin: "huáng hé rù hǎi liú" },
      { text: "欲穷千里目，", pinyin: "yù qióng qiān lǐ mù" },
      { text: "更上一层楼。", pinyin: "gèng shàng yì céng lóu" },
    ],
  },
  {
    title: "江雪",
    author: "柳宗元",
    lines: [
      { text: "千山鸟飞绝，", pinyin: "qiān shān niǎo fēi jué" },
      { text: "万径人踪灭。", pinyin: "wàn jìng rén zōng miè" },
      { text: "孤舟蓑笠翁，", pinyin: "gū zhōu suō lì wēng" },
      { text: "独钓寒江雪。", pinyin: "dú diào hán jiāng xuě" },
    ],
  },
  {
    title: "望庐山瀑布",
    author: "李白",
    lines: [
      { text: "日照香炉生紫烟，", pinyin: "rì zhào xiāng lú shēng zǐ yān" },
      { text: "遥看瀑布挂前川。", pinyin: "yáo kàn pù bù guà qián chuān" },
      { text: "飞流直下三千尺，", pinyin: "fēi liú zhí xià sān qiān chǐ" },
      { text: "疑是银河落九天。", pinyin: "yí shì yín hé luò jiǔ tiān" },
    ],
  },
  {
    title: "夜宿山寺",
    author: "李白",
    lines: [
      { text: "危楼高百尺，", pinyin: "wēi lóu gāo bǎi chǐ" },
      { text: "手可摘星辰。", pinyin: "shǒu kě zhāi xīng chén" },
      { text: "不敢高声语，", pinyin: "bù gǎn gāo shēng yǔ" },
      { text: "恐惊天上人。", pinyin: "kǒng jīng tiān shàng rén" },
    ],
  },
  {
    title: "古朗月行（节选）",
    author: "李白",
    lines: [
      { text: "小时不识月，", pinyin: "xiǎo shí bù shí yuè" },
      { text: "呼作白玉盘。", pinyin: "hū zuò bái yù pán" },
      { text: "又疑瑶台镜，", pinyin: "yòu yí yáo tái jìng" },
      { text: "飞在青云端。", pinyin: "fēi zài qīng yún duān" },
    ],
  },
  {
    title: "风",
    author: "李峤",
    lines: [
      { text: "解落三秋叶，", pinyin: "jiě luò sān qiū yè" },
      { text: "能开二月花。", pinyin: "néng kāi èr yuè huā" },
      { text: "过江千尺浪，", pinyin: "guò jiāng qiān chǐ làng" },
      { text: "入竹万竿斜。", pinyin: "rù zhú wàn gān xié" },
    ],
  },
  {
    title: "画",
    author: "王维",
    lines: [
      { text: "远看山有色，", pinyin: "yuǎn kàn shān yǒu sè" },
      { text: "近听水无声。", pinyin: "jìn tīng shuǐ wú shēng" },
      { text: "春去花还在，", pinyin: "chūn qù huā hái zài" },
      { text: "人来鸟不惊。", pinyin: "rén lái niǎo bù jīng" },
    ],
  },
  {
    title: "池上",
    author: "白居易",
    lines: [
      { text: "小娃撑小艇，", pinyin: "xiǎo wá chēng xiǎo tǐng" },
      { text: "偷采白莲回。", pinyin: "tōu cǎi bái lián huí" },
      { text: "不解藏踪迹，", pinyin: "bù jiě cáng zōng jì" },
      { text: "浮萍一道开。", pinyin: "fú píng yí dào kāi" },
    ],
  },
];

/** 出题用：两联（上句，下句。）——分句自带标点，直接相接即可 */
export function poemCouplets(poem: Poem): string[] {
  return [
    `${poem.lines[0].text}${poem.lines[1].text}`,
    `${poem.lines[2].text}${poem.lines[3].text}`,
  ];
}

// 作者配对题的干扰项池（含未入选古诗的常见诗人）
export const POET_POOL = [
  "李白", "杜甫", "白居易", "王维", "孟浩然",
  "骆宾王", "李绅", "王之涣", "柳宗元", "李峤", "王安石", "苏轼",
];
