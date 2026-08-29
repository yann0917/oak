// 益智游戏注册表：菜单卡片、路由校验、学习记录徽章都从这里派生
import type { GameKey } from "@/lib/garden/types";

export interface GameMeta {
  key: GameKey;
  name: string;
  desc: string;
  glyph: string; // 卡片大字图形
  color: string; // ACTIVITY_PALETTE 色名
  model: string; // 底层的 MediaPipe 模型
  tips: string[]; // 菜单页硬件提示
}

export const GAMES: GameMeta[] = [
  {
    key: "ping-pong",
    name: "乒乓球接球",
    desc: "手掌当球拍托起乒乓球，别让它掉地上",
    glyph: "乒",
    color: "app-blue",
    model: "手部关键点",
    tips: ["手掌正对镜头，横着手像托球一样", "球快掉时手掌迎上去就会弹起来", "连击越高球越快、拍子越小（挑战自己！）"],
  },
  {
    key: "fruit-slice",
    name: "切水果认汉字",
    desc: "像切水果一样手一挥，切开就会读出来的汉字水果",
    glyph: "切",
    color: "app-pink",
    model: "手部关键点",
    tips: ["手掌张开，把手举到摄像头前", "滑动时不要太慢，出刀要快", "小心炸弹，切到连击就断啦"],
  },
  {
    key: "gesture-dance",
    name: "手势舞打卡",
    desc: "照猫画虎做动作，集满六个动作印章放烟花",
    glyph: "舞",
    color: "purple",
    model: "全身姿态",
    tips: ["摄像头稍微拉远，照到全身", "站正、面向摄像头，跟着图画摆姿势", "保持动作 1.5 秒盖章"],
  },
  {
    key: "rock-paper-scissors",
    name: "石头剪刀布",
    desc: "拳头、手掌、剪刀手，和电脑赛一赛谁的反应快",
    glyph: "剪",
    color: "app-green",
    model: "手势识别",
    tips: ["✊ 拳头 = 石头，✋ 手掌 = 布，✌️ = 剪刀", "手势保持 1 秒算出手", "先出石头、剪刀、布三连，和电脑各赢三局"],
  },
  {
    key: "bubble-pop",
    name: "点泡泡学单词",
    desc: "指尖轻轻一点，泡泡就「啵」地炸开念单词",
    glyph: "泡",
    color: "app-teal",
    model: "手部关键点",
    tips: ["用手指按住泡泡 0.4 秒就戳破", "泡泡慢慢向上飘，漂到上面就没了", "连戳连击拿高分，戳得越快分越高"],
  },
  {
    key: "jump-score",
    name: "跳跃小达人",
    desc: "原地跳一跳，30 秒冲刺跳最高分",
    glyph: "跳",
    color: "app-yellow",
    model: "全身姿态",
    tips: ["摄像头照到全身，原地起跳", "蹲下不计分，要真的跳起来", "跳得越高力量条越满，加分越快"],
  },
  {
    key: "magic-wand",
    name: "魔法棒",
    desc: "空中画圈蓄力，握拳闪电击退怪兽",
    glyph: "棒",
    color: "purple",
    model: "手部关键点",
    tips: ["① 在空中画一个大圈蓄力（圈画完魔环亮起）", "② ✊ 握拳保持 0.5 秒施放", "怪兽走到门口会扣心，要赶在它到之前击退"],
  },
  {
    key: "traffic-commander",
    name: "交通指挥官",
    desc: "张开手掌拦车、握拳放行，马路上你说了算",
    glyph: "路",
    color: "app-green",
    model: "手部关键点",
    tips: ["✋ 张开手掌 = 红灯亮起拦车", "✊ 握拳 = 绿灯亮起放行", "红灯时放行车会撞！绿灯时拦车会堵车哦"],
  },
];

export const GAME_MAP: Record<string, GameMeta> = Object.fromEntries(
  GAMES.map((g) => [g.key, g])
);
