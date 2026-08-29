// 唐诗宋词内容：幼儿园~小学段的蒙学经典，couplet 为一联（上句，下句。）
export interface Poem {
  title: string;
  author: string;
  couplets: string[];
}

export const POEMS: Poem[] = [
  {
    title: "静夜思",
    author: "李白",
    couplets: ["床前明月光，疑是地上霜。", "举头望明月，低头思故乡。"],
  },
  {
    title: "咏鹅",
    author: "骆宾王",
    couplets: ["鹅鹅鹅，曲项向天歌。", "白毛浮绿水，红掌拨清波。"],
  },
  {
    title: "春晓",
    author: "孟浩然",
    couplets: ["春眠不觉晓，处处闻啼鸟。", "夜来风雨声，花落知多少。"],
  },
  {
    title: "悯农",
    author: "李绅",
    couplets: ["锄禾日当午，汗滴禾下土。", "谁知盘中餐，粒粒皆辛苦。"],
  },
  {
    title: "登鹳雀楼",
    author: "王之涣",
    couplets: ["白日依山尽，黄河入海流。", "欲穷千里目，更上一层楼。"],
  },
  {
    title: "江雪",
    author: "柳宗元",
    couplets: ["千山鸟飞绝，万径人踪灭。", "孤舟蓑笠翁，独钓寒江雪。"],
  },
  {
    title: "望庐山瀑布",
    author: "李白",
    couplets: ["日照香炉生紫烟，遥看瀑布挂前川。", "飞流直下三千尺，疑是银河落九天。"],
  },
  {
    title: "夜宿山寺",
    author: "李白",
    couplets: ["危楼高百尺，手可摘星辰。", "不敢高声语，恐惊天上人。"],
  },
  {
    title: "古朗月行（节选）",
    author: "李白",
    couplets: ["小时不识月，呼作白玉盘。", "又疑瑶台镜，飞在青云端。"],
  },
  {
    title: "风",
    author: "李峤",
    couplets: ["解落三秋叶，能开二月花。", "过江千尺浪，入竹万竿斜。"],
  },
  {
    title: "画",
    author: "王维",
    couplets: ["远看山有色，近听水无声。", "春去花还在，人来鸟不惊。"],
  },
  {
    title: "池上",
    author: "白居易",
    couplets: ["小娃撑小艇，偷采白莲回。", "不解藏踪迹，浮萍一道开。"],
  },
];

// 作者配对题的干扰项池（含未入选古诗的常见诗人）
export const POET_POOL = [
  "李白", "杜甫", "白居易", "王维", "孟浩然",
  "骆宾王", "李绅", "王之涣", "柳宗元", "李峤", "王安石", "苏轼",
];
