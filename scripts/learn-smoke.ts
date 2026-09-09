// 学一学冒烟测试：校验各活动卡组与听一听题目的结构完整性
// 运行：npx tsx scripts/learn-smoke.ts
import { buildLearnDeck, buildListenRound, LEARN_SPEC, TIER_SENSITIVE } from "@/lib/garden/learn";
import { buildQuestions, splitCouplet } from "@/lib/garden/engine";
import { ACTIVITY_KEYS, DIFFICULTIES, type ActivityKey } from "@/lib/garden/types";
import { POEMS, poemCouplets } from "@/data/garden/poems";

let fail = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) { fail++; console.log("  ✗", msg); }
};

for (const activity of ACTIVITY_KEYS) {
  if (activity === "idioms") continue;
  for (const difficulty of DIFFICULTIES) {
    const deck = buildLearnDeck({ activity, difficulty, customCharacters: [], numberLang: "cn" });
    check(deck.length > 0, `${activity}/${difficulty} 卡组为空`);
    const keys = new Set(deck.map((c) => c.key));
    check(keys.size === deck.length, `${activity}/${difficulty} 卡组 key 重复`);
    for (const c of deck) {
      check(c.speak.length > 0, `${activity}/${difficulty} ${c.key} 无点读内容`);
      for (const s of c.speak) check(!!s.text && s.text.length <= 200, `${activity} ${c.key} 语音文本超长或为空: ${s.text.length}`);
    }
    const qs = buildListenRound(deck, 5);
    check(qs.length === Math.min(5, deck.length), `${activity}/${difficulty} 听一听题数不对: ${qs.length}`);
    for (const q of qs) {
      check(q.play.length > 0, `${activity} 题目无播放内容`);
      check(q.options.length === 4, `${activity} 选项数 ${q.options.length}`);
      check(new Set(q.options.map((o) => o.card.key)).size === 4, `${activity} 选项重复`);
      check(q.options.some((o) => o.card.key === q.answerKey), `${activity} 选项里没有正确答案`);
      check(LEARN_SPEC[activity as ActivityKey].listenPrompt.length > 0, `${activity} 缺题干`);
    }
    if (!TIER_SENSITIVE.includes(activity)) {
      const other = buildLearnDeck({ activity, difficulty: difficulty === "简单" ? "困难" : "简单", customCharacters: [], numberLang: "cn" });
      check(other.length === deck.length, `${activity} 卡组不该随难度变化`);
    }
  }
}
// 古诗：4 个分句、逐字拼音与汉字一一对应（标点不占拼音位）、听句找诗提示是相邻两句
for (const p of POEMS) {
  check(p.lines.length === 4, `${p.title} 分句数 ${p.lines.length}`);
  for (const line of p.lines) {
    const chars = [...line.text].filter((c) => /[\u4e00-\u9fa5]/.test(c)).length;
    const syllables = line.pinyin.split(" ").filter(Boolean).length;
    check(chars === syllables, `${p.title}「${line.text}」汉字 ${chars} 个、拼音 ${syllables} 个`);
  }
  check(poemCouplets(p).length === 2, `${p.title} 联数不为 2`);
  // 分句自带句末标点：第 1/3 句「，」、第 2/4 句「。」
  p.lines.forEach((line, i) => {
    const want = i % 2 === 0 ? "，" : "。";
    check(line.text.endsWith(want), `${p.title} 第 ${i + 1} 句句末应为「${want}」：${line.text}`);
  });
  // 补全名句靠 splitCouplet 拆联：句内标点（咏鹅「鹅，鹅，鹅」）不能拆错
  poemCouplets(p).forEach((c, i) => {
    const [upper, lower] = splitCouplet(c);
    const bare = (s: string) => s.replace(/[，。！？]$/, "");
    check(
      bare(upper) === bare(p.lines[i * 2].text) && bare(lower) === bare(p.lines[i * 2 + 1].text),
      `${p.title} 第 ${i + 1} 联拆分与分句不一致：「${upper}」/「${lower}」`
    );
  });
}
const poemDeck = buildLearnDeck({ activity: "poems", difficulty: "简单" });
const poemQs = buildListenRound(poemDeck, 6);
check(poemQs.every((q) => !!q.hint && q.hint.lines.length === 2), "古诗听一听缺两句提示");
check(poemQs.every((q) => q.options.every((o) => o.card.face.kind === "poem" && !!o.speak)), "古诗选项缺小喇叭");
// 古诗出题引擎（数据模型改为 lines 后回归）：三档都能出题且题干/答案非空
for (const difficulty of DIFFICULTIES) {
  const qs = buildQuestions({ activity: "poems", difficulty, count: 20, mastery: [] });
  check(qs.length > 0, `古诗/${difficulty} 出题为空`);
  check(
    qs.every((q) => q.display.value.length > 0 && q.answer.length > 0),
    `古诗/${difficulty} 题干或答案为空`
  );
}
// 数字发音切换
const cn = buildLearnDeck({ activity: "math", difficulty: "简单", numberLang: "cn" });
const en = buildLearnDeck({ activity: "math", difficulty: "简单", numberLang: "en" });
check(cn.length === 21 && en.length === 21, "数字卡不是 21 张");
check(cn[5].listen?.[0].voice === "xiaoyi" && en[5].listen?.[0].voice === "ana", "数字听一听音色未随语言切换");

console.log(fail === 0 ? "learn smoke: 全部通过" : `learn smoke: ${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
