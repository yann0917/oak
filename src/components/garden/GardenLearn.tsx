"use client";

// 学习园地「学一学」舞台：蒙氏三阶段的前两步——
// ① 认一认 / 读一读 / 认数字：点读卡墙（命名，纯输入不考核）
// ② 听一听：听声音找出对应的卡片（辨认，答错变灰可重试，不打叉不批评）
// 第三步「练一练」是原有的出题流程，由 GardenActivity 负责切换。
// 所有语音走 /api/tts（Edge TTS），与练习页共用音色分配与落盘缓存。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Tag } from "animal-island-ui";
import { toast } from "@/lib/toast";
import { EXCITED_TONE, SORRY_TONE, speak, stopSpeaking } from "@/lib/garden/speech";
import {
  LEARN_SPEC,
  TIER_SENSITIVE,
  buildLearnDeck,
  buildListenRound,
  type LearnCard,
  type LearnFace,
  type LearnSpeech,
  type ListenQuestion,
} from "@/lib/garden/learn";
import {
  DIFFICULTIES,
  type ActivityKey,
  type CustomCharacter,
  type Difficulty,
} from "@/lib/garden/types";

const LISTEN_ROUND = 5;
// 与练习页同句，命中进园时预热好的缓存，答对夸奖零等待
const PRAISE = ["太棒了！你真厉害！", "哇！太厉害了！", "好样的！就是它！"];
const TRY_AGAIN = "哎呀，差一点点～";

export interface GardenLearnProps {
  activity: ActivityKey;
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  customCharacters?: CustomCharacter[];
  mode: "wall" | "listen";
  onModeChange: (m: "wall" | "listen") => void;
  onPractice: () => void;
}

export default function GardenLearn({
  activity,
  difficulty,
  onDifficultyChange,
  customCharacters = [],
  mode,
  onModeChange,
  onPractice,
}: GardenLearnProps) {
  const spec = LEARN_SPEC[activity];
  const [numberLang, setNumberLang] = useState<"cn" | "en">("cn");
  const [pinyinGroup, setPinyinGroup] = useState("全部");

  const deck = useMemo(
    () => buildLearnDeck({ activity, difficulty, customCharacters, numberLang }),
    [activity, difficulty, customCharacters, numberLang]
  );

  // ---------- 点读播放（同一时刻只有一段语音，点新卡片会打断旧语音） ----------
  const tokenRef = useRef(0);
  const play = useCallback(async (segments: LearnSpeech[], repeat = 1) => {
    const token = ++tokenRef.current;
    for (let n = 0; n < repeat; n++) {
      for (const seg of segments) {
        if (tokenRef.current !== token) return;
        await speak(seg.text, seg.voice, seg.tone);
      }
    }
  }, []);

  // ---------- 认一认：点读卡墙 ----------
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set());
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  // 换难度/换活动后卡组变了，已点读进度跟着重置
  useEffect(() => {
    setReadKeys(new Set());
    setPlayingKey(null);
  }, [activity, difficulty]);

  useEffect(() => () => stopSpeaking(), []);

  const markRead = (key: string) => setReadKeys((prev) => new Set(prev).add(key));

  const tapCard = async (card: LearnCard) => {
    markRead(card.key);
    setPlayingKey(card.key);
    await play(card.speak);
    setPlayingKey((k) => (k === card.key ? null : k));
  };

  const tapPoemLine = (card: LearnCard, text: string) => {
    markRead(card.key);
    setPlayingKey(card.key);
    void play([{ text, voice: "xiaoxiao" }]).then(() =>
      setPlayingKey((k) => (k === card.key ? null : k))
    );
  };

  const repeatPoem = (card: LearnCard) => {
    markRead(card.key);
    setPlayingKey(card.key);
    // 跟读放慢一档，孩子跟得上
    void play(
      card.speak.map((s) => ({ ...s, tone: { rate: "-25%" } })),
      3
    ).then(() => setPlayingKey((k) => (k === card.key ? null : k)));
    toast("跟读开始，我们一起念 3 遍～");
  };

  // ---------- 听一听：听声音找卡片 ----------
  const [round, setRound] = useState<ListenQuestion[]>([]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [wrongKeys, setWrongKeys] = useState<Set<string>>(new Set());
  const [firstRight, setFirstRight] = useState(0);
  const [finished, setFinished] = useState(false);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetListen = useCallback(() => {
    if (advanceRef.current) clearTimeout(advanceRef.current);
    setRound(buildListenRound(deck, LISTEN_ROUND));
    setQi(0);
    setPicked(null);
    setWrongKeys(new Set());
    setFirstRight(0);
    setFinished(false);
  }, [deck]);

  useEffect(() => {
    if (mode === "listen") resetListen();
  }, [mode, resetListen]);

  useEffect(
    () => () => {
      if (advanceRef.current) clearTimeout(advanceRef.current);
    },
    []
  );

  const question = round[qi];

  // 题目出现后自动朗读一遍（稍作停顿，等界面渲染完）
  useEffect(() => {
    if (mode !== "listen" || finished || !question) return;
    const t = setTimeout(() => void play(question.play), 450);
    return () => clearTimeout(t);
  }, [mode, finished, question, play]);

  // 结算语音
  useEffect(() => {
    if (!finished || round.length === 0) return;
    if (firstRight === round.length) {
      void play([{ text: "哇！满分小达人，太厉害了！", voice: "xiaoyi", tone: EXCITED_TONE }]);
    } else {
      void play([{ text: "真不错，继续加油！", voice: "xiaoyi" }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const answer = (q: ListenQuestion, key: string) => {
    if (picked !== null) return;
    if (key !== q.answerKey) {
      // 错误控制：选错的选项变灰锁定，可以继续听、继续试，不打断学习
      setWrongKeys((prev) => new Set(prev).add(key));
      toast("不是它哦～再听一遍，仔细找找", "warning");
      void play([{ text: TRY_AGAIN, voice: "xiaoyi", tone: SORRY_TONE }]).then(() =>
        play(q.play)
      );
      return;
    }
    setPicked(key);
    if (wrongKeys.size === 0) setFirstRight((n) => n + 1);
    void play([{ text: PRAISE[Math.floor(Math.random() * PRAISE.length)], voice: "xiaoyi", tone: EXCITED_TONE }]);
    advanceRef.current = setTimeout(() => {
      if (qi + 1 >= round.length) setFinished(true);
      else {
        setQi(qi + 1);
        setPicked(null);
        setWrongKeys(new Set());
      }
    }, 1200);
  };

  const visibleDeck =
    activity === "pinyin" && pinyinGroup !== "全部"
      ? deck.filter((c) => c.group === pinyinGroup)
      : deck;
  const readCount = deck.filter((c) => readKeys.has(c.key)).length;

  return (
    <div className="w-full max-w-4xl">
      <div
        className="bg-white rounded-[32px] p-5 sm:p-7"
        style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}
      >
        {mode === "wall" ? renderWall() : renderListen()}
      </div>
    </div>
  );

  // ---------- 认一认 / 读一读 / 认数字 ----------
  function renderWall() {
    const poemMode = activity === "poems";
    return (
      <>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-black" style={{ color: "var(--animal-text-color)" }}>
            第 1 步 · {spec.wall}
          </span>
          <span className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
            {spec.wallHint}
          </span>
          <span
            className="ml-auto text-xs font-bold"
            style={{ color: "var(--animal-text-color-secondary)" }}
          >
            已点读 {readCount}/{deck.length}
          </span>
        </div>

        {(TIER_SENSITIVE.includes(activity) || activity === "math" || activity === "pinyin") && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {TIER_SENSITIVE.includes(activity) && (
              <>
                <span className="text-xs font-bold" style={{ color: "var(--animal-text-color)" }}>
                  难度
                </span>
                {DIFFICULTIES.map((d) => (
                  <Tag
                    key={d}
                    size="small"
                    color={d === difficulty ? "app-green" : "default"}
                    variant={d === difficulty ? "solid" : "soft"}
                    onClick={() => onDifficultyChange(d)}
                  >
                    {d}
                  </Tag>
                ))}
              </>
            )}
            {activity === "math" && (
              <>
                <span className="text-xs font-bold" style={{ color: "var(--animal-text-color)" }}>
                  发音
                </span>
                {(
                  [
                    { key: "cn", label: "中文" },
                    { key: "en", label: "英文" },
                  ] as const
                ).map((l) => (
                  <Tag
                    key={l.key}
                    size="small"
                    color={numberLang === l.key ? "app-blue" : "default"}
                    variant={numberLang === l.key ? "solid" : "soft"}
                    onClick={() => setNumberLang(l.key)}
                  >
                    {l.label}
                  </Tag>
                ))}
              </>
            )}
            {activity === "pinyin" &&
              ["全部", "声母", "韵母", "整体认读音节"].map((g) => (
                <Tag
                  key={g}
                  size="small"
                  color={pinyinGroup === g ? "app-orange" : "default"}
                  variant={pinyinGroup === g ? "solid" : "soft"}
                  onClick={() => setPinyinGroup(g)}
                >
                  {g}
                </Tag>
              ))}
          </div>
        )}

        {deck.length === 0 ? (
          <p className="text-center py-10 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            还没有可学习的内容，先去「练一练」里添加吧
          </p>
        ) : (
          <div
            className="grid gap-3 mt-4"
            style={{
              gridTemplateColumns: poemMode
                ? "repeat(auto-fill,minmax(410px,1fr))"
                : "repeat(auto-fill,minmax(104px,1fr))",
            }}
          >
            {visibleDeck.map((card) =>
              card.face.kind === "poem" ? renderPoemCard(card, card.face) : renderFaceCard(card)
            )}
          </div>
        )}

        <div className="mt-6 flex justify-center gap-2 flex-wrap">
          <Button type="primary" onClick={() => onModeChange("listen")}>
            第 2 步 · 去听一听 ›
          </Button>
          <Button onClick={onPractice}>去练一练 ›</Button>
        </div>
      </>
    );
  }

  /** 点读卡片：字/字母/拼音/数字/颜色/单词共用一套外壳 */
  function renderFaceCard(card: LearnCard) {
    const read = readKeys.has(card.key);
    const playing = playingKey === card.key;
    return (
      <div
        key={card.key}
        role="button"
        tabIndex={0}
        aria-label={`${card.label}，点按朗读`}
        onClick={() => void tapCard(card)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void tapCard(card);
          }
        }}
        className="relative rounded-2xl bg-white border-2 flex flex-col items-center justify-center gap-1 py-3 px-2 cursor-pointer select-none text-center"
        style={{
          borderColor: read ? "#8ac68a" : "#f0e6d2",
          boxShadow: playing ? "0 0 0 4px rgba(255,216,94,0.75)" : "0 4px 0 rgba(61,52,40,0.10)",
          minHeight: 116,
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}
      >
        <FaceView face={card.face} />
        {read && (
          <span className="absolute top-1 right-1.5 text-xs" aria-hidden>
            ✅
          </span>
        )}
      </div>
    );
  }

  /** 古诗卡：逐句点读 + 听整首 + 跟读 3 遍 */
  function renderPoemCard(card: LearnCard, face: Extract<LearnFace, { kind: "poem" }>) {
    const read = readKeys.has(card.key);
    const playing = playingKey === card.key;
    return (
      <div
        key={card.key}
        className="rounded-2xl bg-white border-2 p-4"
        style={{
          borderColor: read ? "#8ac68a" : "#f0e6d2",
          boxShadow: playing ? "0 0 0 4px rgba(255,216,94,0.75)" : "0 4px 0 rgba(61,52,40,0.10)",
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black text-lg" style={{ color: "var(--animal-text-color)" }}>
            《{face.title}》
          </span>
          <span className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
            {face.author}
          </span>
          {read && (
            <span className="ml-auto text-xs font-bold" style={{ color: "#4c9c54" }}>
              ✓ 读过了
            </span>
          )}
        </div>
        {/* 五言/七言绝句：一行排两句（窄屏放不下时自动退回一句一行） */}
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 justify-items-center">
          {face.lines.map((line) => (
            <div
              key={line.text}
              role="button"
              tabIndex={0}
              aria-label={`朗读 ${line.text}`}
              onClick={() => tapPoemLine(card, line.text)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  tapPoemLine(card, line.text);
                }
              }}
              className="rounded-xl px-2 py-1 cursor-pointer select-none"
            >
              <PoemRuby text={line.text} pinyin={line.pinyin} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2 flex-wrap">
          <Button size="small" onClick={() => void tapCard(card)}>
            🔊 听整首
          </Button>
          <Button size="small" onClick={() => repeatPoem(card)}>
            🔁 跟读 3 遍
          </Button>
        </div>
      </div>
    );
  }

  // ---------- 听一听 ----------
  function renderListen() {
    if (round.length === 0) {
      return (
        <p className="text-center py-10 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
          卡组太少，先去「认一认」看看吧
        </p>
      );
    }
    if (finished) {
      const full = firstRight === round.length;
      return (
        <div className="text-center py-6">
          <div className="text-5xl font-black" style={{ color: "var(--animal-primary-color)" }}>
            {round.length}/{round.length}
          </div>
          <p className="mt-2 font-bold" style={{ color: "var(--animal-text-color)" }}>
            {full ? "每一题都一次听对，小耳朵真尖！" : "你把听到的都找出来啦，真棒！"}
          </p>
          {!full && (
            <p className="mt-1 text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
              其中 {firstRight} 题第一次就答对 · 多听几次会更熟
            </p>
          )}
          <div className="mt-6 flex gap-2 justify-center flex-wrap">
            <Button type="primary" onClick={resetListen}>
              再来一局
            </Button>
            <Button onClick={onPractice}>去练一练 ›</Button>
            <Button onClick={() => onModeChange("wall")}>回去复习</Button>
          </div>
        </div>
      );
    }
    if (!question) return null;

    return (
      <>
        <div className="flex items-center gap-2 flex-wrap">
          <Tag color="app-blue" variant="soft">
            {spec.listen}
          </Tag>
          <span
            className="ml-auto text-xs font-bold"
            style={{ color: "var(--animal-text-color-secondary)" }}
          >
            第 {qi + 1}/{round.length} 题
          </span>
        </div>

        <p
          className="text-center text-sm font-bold mt-4"
          style={{ color: "var(--animal-text-color)" }}
        >
          {spec.listenPrompt}
        </p>
        {question.hint && (
          <div className="text-center mt-2 space-y-1">
            {question.hint.lines.map((line) => (
              <div key={line.text} className="flex justify-center">
                <PoemRuby text={line.text} pinyin={line.pinyin} size="lg" />
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-center mt-4">
          <button
            type="button"
            onClick={() => void play(question.play)}
            className="px-6 py-3 rounded-full text-white font-black text-base cursor-pointer select-none"
            style={{ background: "#f08cb0", boxShadow: "0 5px 0 #d96e92" }}
          >
            🔊 再听一遍
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          {question.options.map((opt) => {
            const isAnswer = picked !== null && opt.card.key === question.answerKey;
            const isWrong = wrongKeys.has(opt.card.key);
            return (
              <div
                key={opt.card.key}
                role="button"
                tabIndex={isWrong ? -1 : 0}
                aria-label={opt.card.label}
                aria-disabled={isWrong || undefined}
                onClick={() => !isWrong && answer(question, opt.card.key)}
                onKeyDown={(e) => {
                  if (!isWrong && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    answer(question, opt.card.key);
                  }
                }}
                className={`relative rounded-2xl border-2 p-3 min-h-[116px] flex flex-col items-center justify-center gap-1 text-center ${
                  isWrong ? "cursor-default" : "cursor-pointer select-none"
                }`}
                style={{
                  borderColor: isAnswer ? "#8ac68a" : "#f0e6d2",
                  background: isAnswer ? "#eef8ee" : "#fff",
                  opacity: isWrong ? 0.42 : 1,
                  filter: isWrong ? "grayscale(1)" : undefined,
                  boxShadow: isAnswer ? "0 4px 0 #8ac68a" : "0 4px 0 rgba(61,52,40,0.10)",
                  transition: "opacity 0.2s, border-color 0.2s",
                }}
              >
                <FaceView face={opt.card.face} variant="option" />
                {opt.speak && !isWrong && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`先听 ${opt.card.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void play(opt.speak as LearnSpeech[]);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        void play(opt.speak as LearnSpeech[]);
                      }
                    }}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white border-2 flex items-center justify-center text-sm cursor-pointer select-none"
                    style={{ borderColor: "#f0e6d2" }}
                  >
                    🔊
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  }
}

/** 诗句逐字注音：拼音标在汉字上方，标点不占拼音位（「鹅，鹅，鹅」的逗号照常显示） */
function PoemRuby({
  text,
  pinyin,
  size = "md",
}: {
  text: string;
  pinyin: string;
  size?: "md" | "lg";
}) {
  const syllables = pinyin.split(" ").filter(Boolean);
  let si = 0;
  const pyCls = size === "lg" ? "text-[11px]" : "text-[9px]";
  const charCls = size === "lg" ? "text-xl" : "text-base";
  return (
    <span className="inline-flex items-end">
      {[...text].map((ch, i) => {
        if (!/[\u4e00-\u9fa5]/.test(ch)) {
          // 标点紧跟前面的字（不加列间距），避免逗号被推开显得脱节
          return (
            <span
              key={i}
              className={`${charCls} font-bold leading-tight`}
              style={{ color: "var(--animal-text-color)" }}
            >
              {ch}
            </span>
          );
        }
        const py = syllables[si++] ?? "";
        return (
          <span
            key={i}
            className="inline-flex flex-col items-center"
            style={{ marginLeft: i > 0 ? 2 : 0 }}
          >
            <span className={`${pyCls} leading-none`} style={{ color: "var(--animal-text-color-secondary)" }}>
              {py}
            </span>
            <span className={`${charCls} font-bold leading-tight`} style={{ color: "var(--animal-text-color)" }}>
              {ch}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** 卡面渲染：卡墙（variant=card，信息全）与听一听选项（variant=option，只留最小辨识面）共用。
 * 选项刻意不显示拼音/文字——否则孩子直接文字配对，就绕过"听音辨认"了。 */
function FaceView({ face, variant = "card" }: { face: LearnFace; variant?: "card" | "option" }) {
  const option = variant === "option";
  if (face.kind === "char") {
    return (
      <>
        <span
          className={`${option ? "text-6xl" : "text-5xl"} font-black leading-none`}
          style={{ color: "var(--animal-text-color)" }}
        >
          {face.char}
        </span>
        {!option && (
          <>
            <span className="text-sm font-bold" style={{ color: "var(--animal-primary-color)" }}>
              {face.pinyin}
            </span>
            {face.word && (
              <span className="text-[11px]" style={{ color: "var(--animal-text-color-secondary)" }}>
                {face.word}
              </span>
            )}
          </>
        )}
      </>
    );
  }
  if (face.kind === "letter") {
    return (
      <>
        <span
          className={`${option ? "text-4xl" : "text-4xl"} font-black leading-none`}
          style={{ color: "var(--animal-text-color)" }}
        >
          {face.upper}
          <span style={{ color: "var(--animal-primary-color)" }}>{face.lower}</span>
        </span>
        <span className={option ? "text-3xl leading-none" : "text-2xl leading-none"}>{face.emoji}</span>
        {!option && (
          <>
            <span className="text-[11px] font-bold" style={{ color: "var(--animal-text-color)" }}>
              {face.word}
            </span>
            <span className="text-[10px]" style={{ color: "var(--animal-text-color-secondary)" }}>
              {face.zh}
            </span>
          </>
        )}
      </>
    );
  }
  if (face.kind === "pinyin") {
    return (
      <>
        <span
          className={`${option ? "text-4xl" : "text-3xl"} font-black leading-none`}
          style={{ color: "var(--animal-text-color)" }}
        >
          {face.symbol}
        </span>
        {!option && (
          <span className="text-sm font-bold" style={{ color: "var(--animal-primary-color)" }}>
            {face.read}
          </span>
        )}
      </>
    );
  }
  if (face.kind === "number") {
    return (
      <>
        <span
          className={`${option ? "text-6xl" : "text-4xl"} font-black leading-none`}
          style={{ color: "var(--animal-text-color)" }}
        >
          {face.n}
        </span>
        {!option && (
          <>
            <span className="text-sm font-bold" style={{ color: "var(--animal-primary-color)" }}>
              {face.cn}
            </span>
            <span className="text-[10px]" style={{ color: "var(--animal-text-color-secondary)" }}>
              {face.en}
            </span>
          </>
        )}
      </>
    );
  }
  if (face.kind === "color") {
    return (
      <>
        <span
          className={`${option ? "w-20 h-20" : "w-12 h-12"} rounded-2xl border-2`}
          style={{ background: face.hex, borderColor: "var(--animal-border-color-light)" }}
        />
        {!option && (
          <>
            <span className="text-sm font-bold" style={{ color: "var(--animal-text-color)" }}>
              {face.zh}
            </span>
            <span className="text-[10px]" style={{ color: "var(--animal-text-color-secondary)" }}>
              {face.en}
            </span>
          </>
        )}
      </>
    );
  }
  if (face.kind === "word") {
    return (
      <>
        <span className={option ? "text-5xl leading-none" : "text-4xl leading-none"}>
          {face.emoji}
        </span>
        {!option && (
          <>
            <span className="text-base font-black" style={{ color: "var(--animal-text-color)" }}>
              {face.en}
            </span>
            <span className="text-[11px]" style={{ color: "var(--animal-text-color-secondary)" }}>
              {face.zh}
            </span>
          </>
        )}
      </>
    );
  }
  // 古诗选项：题名 + 作者 + 首句（诗句本身就是辨认内容，两种形态都显示）
  return (
    <>
      <span className="font-black text-base" style={{ color: "var(--animal-text-color)" }}>
        《{face.title}》
      </span>
      <span className="text-[11px]" style={{ color: "var(--animal-text-color-secondary)" }}>
        {face.author}
      </span>
      <span className="text-[11px]" style={{ color: "#6fae8c" }}>
        {face.lines[0]?.text}
      </span>
    </>
  );
}
