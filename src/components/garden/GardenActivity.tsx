"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Checkbox,
  Input,
  Modal,
  Progress,
  Radio,
  Select,
  Switch,
  Tag,
  Typewriter,
} from "animal-island-ui";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { toast } from "@/lib/toast";
import { Chip } from "@/components/CrudSection";
import OwlTeacher, { type OwlAction } from "@/components/garden/OwlTeacher";
import SceneBackground from "@/components/garden/SceneBackground";
import {
  EXCITED_TONE,
  SORRY_TONE,
  prewarmGardenAudio,
  speak,
  stopSpeaking,
  useVoiceMuted,
  type SpeakTone,
} from "@/lib/garden/speech";
import type { TtsVoice } from "@/lib/tts/voices";
import { ACTIVITY_MAP, ACTIVITY_PALETTE } from "@/lib/garden/registry";
import { BUILTIN_CHARACTERS } from "@/data/garden/characters";
import { PINYIN_READ } from "@/data/garden/pinyin";
import { DEFAULT_MATH_CONFIG, buildQuestions, parseConfig } from "@/lib/garden/engine";
import {
  DIFFICULTIES,
  MATH_OP_LABEL,
  formatDuration,
  type ActivityConfig,
  type ActivityKey,
  type CustomCharacter,
  type Difficulty,
  type MathOp,
  type MathTierConfig,
  type MasteryItem,
  type Question,
  type Tier,
} from "@/lib/garden/types";

const ROUND_SIZES = [5, 8, 10, 12, 15, 20];
const MATH_MAX_OPTIONS = [10, 20, 50, 100];
const TIER_NAMES = ["", "启蒙高频字", "常用字", "进阶字"];

// 糖果色按钮板（对照游戏化参考稿的按键配色，bg + 底部立体 dark）
const CANDY = [
  { bg: "#f4736f", dark: "#d4574f" },
  { bg: "#7d8ee0", dark: "#5f6fca" },
  { bg: "#f5b840", dark: "#dd9d1e" },
  { bg: "#4fc3b3", dark: "#33a893" },
  { bg: "#e59266", dark: "#c97549" },
  { bg: "#a583e8", dark: "#8a64d2" },
  { bg: "#67b56e", dark: "#4c9c54" },
  { bg: "#f08cb0", dark: "#d96e92" },
];

interface ResultItem {
  itemKey: string;
  label: string;
  correct: boolean;
}

const PRAISE = ["太棒了！你真厉害！", "哇！太厉害了！", "好样的！就是它！"];

// 固定台词预热清单：进园地后后台生成并落盘缓存，之后播放零等待。
// 语气参数必须和播放时的请求完全一致（音色 + prosody），否则 URL 不同无法命中。
const WARMUP_LINES: [string, TtsVoice, SpeakTone?][] = [
  ["跟我一起开始今天的练习吧！", "xiaoyi"],
  ["出发！加油哦！", "xiaoyi", EXCITED_TONE],
  ["准备好了吗？再来一轮！", "xiaoyi"],
  ["咕咕！一起加油呀", "xiaoyi"],
  ...PRAISE.map((t) => [t, "xiaoyi", EXCITED_TONE] as [string, TtsVoice, SpeakTone]),
  ["哎呀，差一点点～", "xiaoyi", SORRY_TONE],
  ["没关系，跳过也可以", "xiaoyi"],
  ["记住啦，真棒！", "xiaoyi", EXCITED_TONE],
  ["别急，多看几次就会啦", "xiaoyi", SORRY_TONE],
  ["哇！满分小达人，太厉害了！", "xiaoyi", EXCITED_TONE],
  ["真不错，继续加油！", "xiaoyi"],
  ["真可惜，下次一定更好！", "xiaoyi", SORRY_TONE],
];

interface SpeechLine {
  text: string;
  voice: TtsVoice;
}

/** 题干与内容拼接：题干已以句末标点结尾时不再重复加句号 */
function joinSpeech(prompt: string, body: string): string {
  if (!body) return prompt;
  return `${prompt.replace(/[。？！，,]$/, "")}。${body}`;
}

/** 题目朗读内容：题干引导语 + 题面（不读会剧透答案的部分）；音色按活动入口分配（见 voices.ts） */
function questionSpeech(q: Question): SpeechLine | null {
  const d = q.display;
  const prompt = q.prompt.replace(/[「」《》]/g, ""); // 引号书名号交给语音会打断句读
  if (d.kind === "formula") {
    // 算式转口播："12 + 3 =" → "12 加 3 等于几？"，认字少的孩子也能听题
    return {
      text: d.value
        .replace("+", "加")
        .replace("−", "减")
        .replace("×", "乘")
        .replace("÷", "除以")
        .replace("=", "等于几？"),
      voice: "xiaoyi",
    };
  }
  if (d.kind === "color") {
    // 只读题干和例词，不读颜色名——它就是答案，读了等于剧透
    const body = d.sub && !prompt.includes(d.sub) ? d.sub : "";
    return { text: joinSpeech(prompt, body), voice: "xiaoyi" };
  }
  if (d.kind === "emoji") {
    // 读题干引导；有文字例词（英语单词）时加上，纯看图题只读题干
    const body = d.sub && !prompt.includes(d.sub) ? d.sub : "";
    return { text: joinSpeech(prompt, body), voice: "ana" };
  }
  if (d.value.includes("_")) return null; // 补全单词的挖空串不适合朗读
  if (q.itemKey.startsWith("poem:")) {
    // 诗词题念出题干引导 + 诗题 + 诗句：
    // 补全名句（value=诗句，sub=《诗名》）→"下一句是什么？静夜思。床前明月光，"
    // 作者配对（value=《诗名》，sub=诗句）→"静夜思的作者是谁？床前明月光，疑是地上霜。"
    const valueHasTitle = d.value.includes("《");
    const title = (valueHasTitle ? d.value : d.sub ?? "").replace(/[《》]/g, "");
    const body = valueHasTitle ? d.sub ?? "" : d.value;
    const text = prompt.includes(title)
      ? joinSpeech(prompt, body)
      : joinSpeech(joinSpeech(prompt, title), body);
    return { text, voice: "xiaoxiao" };
  }
  if (q.itemKey.startsWith("pinyin:tone:")) {
    // 带调音节（mā）是拉丁+调号字符，TTS 会按英文字母读；转成对应四声汉字
    // （mā→妈）朗读，中文 TTS 读出的就是该音节的标准发音
    return { text: joinSpeech(prompt, q.answer), voice: "yunxia" };
  }
  if (q.itemKey.startsWith("pinyin:")) {
    // 声母/韵母/整体认读是拉丁串，英文音色读不准、中文音色按英语读
    // （b→bee）：转成呼读音汉字（b→波、an→安、zhi→知）再朗读
    const body = PINYIN_READ[d.value] ?? d.value;
    return { text: joinSpeech(prompt, body), voice: "yunxia" };
  }
  // 按知识点挑音色：其余中文小依、英文 Ana
  const voice: TtsVoice = /[一-龥]/.test(d.value) ? "xiaoyi" : "ana";
  // 题干已含题面词（如"「苹果」的英文是哪个？"）就不重复念题面
  const body = prompt.includes(d.value) ? "" : d.value;
  return { text: joinSpeech(prompt, body), voice };
}

/** 当前卡片应朗读的内容：翻卡揭示前不剧透读音，揭示后读"字，组词"跟读 */
function cardSpeech(q: Question, revealed: boolean): SpeechLine | null {
  if (q.mode === "flashcard") {
    if (!revealed) return null;
    const word = q.flip?.word;
    return {
      text: word ? `${q.display.value}，${word}` : q.display.value,
      voice: "xiaoyi",
    };
  }
  return questionSpeech(q);
}

export default function GardenActivity({ type }: { type: string }) {
  const meta = ACTIVITY_MAP[type];
  const router = useRouter();
  const { currentChild } = useChildren();

  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<"intro" | "playing" | "done">("intro");
  const [difficulty, setDifficulty] = useState<Difficulty>("简单");
  const [roundSize, setRoundSize] = useState(10);
  const [mathCfg, setMathCfg] = useState<Record<Tier, MathTierConfig>>(DEFAULT_MATH_CONFIG);
  const [builtinSwitch, setBuiltinSwitch] = useState<Record<string, boolean>>({});
  const [mastery, setMastery] = useState<MasteryItem[]>([]);
  const [customChars, setCustomChars] = useState<CustomCharacter[]>([]);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [entry, setEntry] = useState(""); // keypad 输入
  const [lives, setLives] = useState(3);
  const [durationSec, setDurationSec] = useState(0);

  const [libOpen, setLibOpen] = useState(false);
  const [newChars, setNewChars] = useState("");
  const [manualPinyin, setManualPinyin] = useState("");
  const [addTier, setAddTier] = useState(1);
  const [adding, setAdding] = useState(false);
  const [mathOpen, setMathOpen] = useState(false);

  // 语音朗读开关（localStorage 持久化，跨页面同步）
  const [voiceMuted, setVoiceMutedState] = useVoiceMuted();

  // 吉祥物状态：动作 + 台词（nonce 递进让连续同一动作也能重播动画）
  const [owlAction, setOwlAction] = useState<OwlAction>("idle");
  const [owlMsg, setOwlMsg] = useState<{ text: string; n: number } | null>(null);
  const owlNonceRef = useRef(0);
  const owlHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (action: OwlAction, text: string, tone?: SpeakTone): Promise<void> => {
    owlNonceRef.current += 1;
    setOwlAction(action);
    setOwlMsg({ text, n: owlNonceRef.current });
    // 台词同步朗读（鼓励/反馈语音）：夸奖带激情、答错带惋惜，静音时自动跳过
    const tts = speak(text, "xiaoyi", tone);
    if (owlHideRef.current) clearTimeout(owlHideRef.current);
    owlHideRef.current = setTimeout(() => setOwlMsg(null), 2400);
    return tts;
  };

  const startedAtRef = useRef(0);
  const savedRef = useRef(false);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!currentChild) return;
    const cid = currentChild.id;
    const jobs: Promise<unknown>[] = [
      api<any[]>(`/api/garden-settings?childId=${cid}`),
      api<MasteryItem[]>(`/api/garden-mastery?childId=${cid}&activity=${type}`),
    ];
    if (type === "characters") {
      jobs.push(api<CustomCharacter[]>(`/api/garden-characters?childId=${cid}`));
    }
    Promise.all(jobs)
      .then(([sets, mas, chars]) => {
        const mine = (sets as any[]).find((s) => s.activity === type);
        if (mine) {
          if ((DIFFICULTIES as string[]).includes(mine.difficulty)) setDifficulty(mine.difficulty);
          const cfg = parseConfig(mine.config);
          if (cfg.roundSize) setRoundSize(Math.min(20, Math.max(5, Number(cfg.roundSize) || 10)));
          if (cfg.math) {
            setMathCfg({
              1: { ...DEFAULT_MATH_CONFIG[1], ...(cfg.math[1] ?? {}) },
              2: { ...DEFAULT_MATH_CONFIG[2], ...(cfg.math[2] ?? {}) },
              3: { ...DEFAULT_MATH_CONFIG[3], ...(cfg.math[3] ?? {}) },
            });
          }
          if (cfg.characters?.builtin) setBuiltinSwitch(cfg.characters.builtin);
        }
        setMastery(mas as MasteryItem[]);
        if (chars) setCustomChars(chars as CustomCharacter[]);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        say("idle", "跟我一起开始今天的练习吧！");
      });
  }, [currentChild, type]);

  useEffect(
    () => () => {
      if (advanceRef.current) clearTimeout(advanceRef.current);
    },
    []
  );

  // 进园地预热常用语音（首次后台生成并落盘缓存），离开练习页时停掉正在播的语音
  useEffect(() => {
    prewarmGardenAudio(WARMUP_LINES);
    return () => stopSpeaking();
  }, []);

  // 听题/跟读：题目出现（翻卡揭示）后稍作停顿自动朗读题面
  useEffect(() => {
    if (phase !== "playing") return;
    const q = questions[current];
    const line = q ? cardSpeech(q, revealed) : null;
    if (!line) return;
    const t = window.setTimeout(() => speak(line.text, line.voice), 350);
    return () => window.clearTimeout(t);
  }, [phase, current, questions, revealed]);

  // 进入结果页时自动保存本次练习（会话记录 + 知识点掌握度）
  useEffect(() => {
    if (phase !== "done" || !currentChild || savedRef.current) return;
    savedRef.current = true;
    api("/api/garden-records", {
      method: "POST",
      body: JSON.stringify({
        childId: currentChild.id,
        activity: type,
        difficulty,
        durationSec,
        results,
      }),
    }).catch(() => {});
  }, [phase, currentChild, type, difficulty, durationSec, results]);

  // 结果页：按正确率给吉祥物反应（高分激情夸奖，低分惋惜安慰）
  useEffect(() => {
    if (phase !== "done" || results.length === 0) return;
    const acc = results.filter((r) => r.correct).length / results.length;
    if (acc >= 0.9) say("great", "哇！满分小达人，太厉害了！", EXCITED_TONE);
    else if (acc >= 0.4) say("encourage", "真不错，继续加油！");
    else say("encourage", "真可惜，下次一定更好！", SORRY_TONE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const question = questions[current];
  const speechLine = question ? cardSpeech(question, revealed) : null;
  const weakCount = mastery.filter((m) => m.wrongCount > 0).length;

  if (!meta) return null;
  if (!currentChild) {
    return (
      <p className="text-center py-20 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        请先在「孩子管理」中添加孩子
      </p>
    );
  }
  if (loading) {
    return (
      <div className="text-center py-20 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        加载中…
      </div>
    );
  }

  const startPractice = () => {
    const configToSave: ActivityConfig = { roundSize };
    if (type === "math") configToSave.math = mathCfg;
    if (type === "characters") configToSave.characters = { builtin: builtinSwitch };

    // 记住本次选择（难度 + 配置），下次进入自动带上
    api("/api/garden-settings", {
      method: "POST",
      body: JSON.stringify({
        childId: currentChild.id,
        activity: type,
        difficulty,
        config: configToSave,
      }),
    }).catch(() => {});

    const qs = buildQuestions({
      activity: type as ActivityKey,
      difficulty,
      count: roundSize,
      mastery,
      config: configToSave,
      customCharacters: customChars,
    });
    if (qs.length === 0) {
      toast("题库还是空的，先去添加内容吧", "warning");
      return;
    }
    savedRef.current = false;
    startedAtRef.current = Date.now();
    setQuestions(qs);
    setCurrent(0);
    setResults([]);
    setPicked(null);
    setRevealed(false);
    setEntry("");
    setLives(3);
    setPhase("playing");
    say("ok", "出发！加油哦！", EXCITED_TONE);
  };

  const recordResult = (q: Question, correct: boolean) => {
    setResults((prev) => [...prev, { itemKey: q.itemKey, label: q.label, correct }]);
    if (!correct) setLives((l) => Math.max(0, l - 1));
  };

  const goNext = () => {
    if (advanceRef.current) {
      clearTimeout(advanceRef.current);
      advanceRef.current = null;
    }
    setPicked(null);
    setRevealed(false);
    setEntry("");
    const next = current + 1;
    if (next >= questions.length) {
      setDurationSec(Math.round((Date.now() - startedAtRef.current) / 1000));
      setPhase("done");
    } else {
      setCurrent(next);
    }
  };

  /** 反馈语音播完后再进下一题：至少停留 minMs（静音时靠它保证看清答案），最久 maxMs 兜底 */
  const advanceAfterVoice = (voice: Promise<void>, minMs: number, maxMs: number) => {
    const started = Date.now();
    advanceRef.current = setTimeout(goNext, maxMs);
    void voice.then(() => {
      if (advanceRef.current === null) return; // 超时路径已推进
      const wait = Math.max(0, minMs - (Date.now() - started));
      clearTimeout(advanceRef.current);
      advanceRef.current = setTimeout(goNext, wait);
    });
  };

  const answerChoice = (option: string) => {
    if (picked || !question) return;
    setPicked(option);
    const correct = option === question.answer;
    recordResult(question, correct);
    // 等夸奖/惋惜语音播完再切题，避免被下一题打断（静音时靠 minMs 看清答案）
    const voice = correct
      ? say("great", PRAISE[Math.floor(Math.random() * PRAISE.length)], EXCITED_TONE)
      : say("wrong", "哎呀，差一点点～", SORRY_TONE);
    advanceAfterVoice(voice, correct ? 1000 : 1600, correct ? 4200 : 5200);
  };

  /** 提交数学答案（"好了"按钮与输满自动判定共用），根据结果朗读并决定切题时机 */
  const submitKeypad = (value: string) => {
    if (picked !== null || !question || !value) return;
    setPicked(value);
    const correct = value === question.answer;
    recordResult(question, correct);
    const voice = correct
      ? say("great", PRAISE[Math.floor(Math.random() * PRAISE.length)], EXCITED_TONE)
      : say("wrong", `咦，正确答案是 ${question.answer} 哦`, SORRY_TONE);
    advanceAfterVoice(voice, correct ? 1000 : 1600, correct ? 4200 : 5200);
  };

  /** 数字键：输入到答案位数就自动判定（对→判对；同位数不同值→判错），无需再按"好了" */
  const pressDigit = (d: string) => {
    if (picked !== null || !question) return;
    if (entry === "" && d === "0") return; // 答案不会以 0 开头
    if (entry.length >= 3) return;
    const next = entry + d;
    setEntry(next);
    if (next.length === question.answer.length) submitKeypad(next);
  };

  const skipQuestion = () => {
    if (picked !== null || !question) return;
    setPicked("__skipped__");
    recordResult(question, false);
    const voice = say("encourage", "没关系，跳过也可以");
    advanceAfterVoice(voice, 1100, 3600);
  };

  const revealCard = () => {
    if (!question || revealed) return;
    // 自动跟读由监听 revealed 的 effect 统一触发，避免双重朗读
    setRevealed(true);
  };

  const answerFlashcard = (correct: boolean) => {
    if (!question) return;
    recordResult(question, correct);
    const voice = correct
      ? say("ok", "记住啦，真棒！", EXCITED_TONE)
      : say("encourage", "别急，多看几次就会啦", SORRY_TONE);
    // 跟读与反馈语音播完再走，避免"字，组词"或鼓励语没读完就切下一张
    advanceAfterVoice(voice, 1000, 4200);
  };

  const restart = () => {
    setPhase("intro");
    say("idle", "准备好了吗？再来一轮！");
    // 重新拉取掌握度，下一轮按最新薄弱项加权
    api<MasteryItem[]>(`/api/garden-mastery?childId=${currentChild.id}&activity=${type}`)
      .then(setMastery)
      .catch(() => {});
  };

  const addChars = async () => {
    setAdding(true);
    try {
      const res = await api<{ added: CustomCharacter[]; skipped: string[] }>(
        "/api/garden-characters",
        {
          method: "POST",
          body: JSON.stringify({
            childId: currentChild.id,
            chars: newChars,
            tier: addTier,
            pinyin: manualPinyin,
          }),
        }
      );
      setCustomChars((prev) => [...prev, ...res.added]);
      toast(
        `已添加 ${res.added.length} 个字` +
          (res.skipped.length ? `，跳过重复：${res.skipped.join(" ")}` : ""),
        res.added.length ? "success" : "warning"
      );
      setNewChars("");
      setManualPinyin("");
    } catch (e: any) {
      toast(e.message || "添加失败", "error");
    } finally {
      setAdding(false);
    }
  };

  const removeChar = async (id: number) => {
    try {
      await api(`/api/garden-characters/${id}`, { method: "DELETE" });
      setCustomChars((prev) => prev.filter((c) => c.id !== id));
    } catch (e: any) {
      toast(e.message || "删除失败", "error");
    }
  };

  const describeTier = (t: Tier) => {
    const cfg = mathCfg[t];
    const ops = cfg.ops.length ? cfg.ops.map((o) => MATH_OP_LABEL[o]).join("、") : "默认题型";
    return `${ops} ${cfg.max} 以内`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-label={`${meta.name}练习`}>
      <SceneBackground />
      <OwlTeacher
        action={owlAction}
        dialogText={owlMsg?.text}
        nonce={owlMsg?.n}
        onActionComplete={(a) => {
          if (a !== "idle") setOwlAction("idle");
        }}
        onPoke={() => say("ok", "咕咕！一起加油呀")}
      />
      <div className="relative min-h-full flex flex-col">
        {/* 顶栏：返回 + 进度 + 爱心 */}
        <div className="flex items-center gap-3 px-4 pt-4 shrink-0">
          <div
            role="button"
            tabIndex={0}
            aria-label="返回园地"
            onClick={() => router.push("/garden")}
            onKeyDown={(e) => e.key === "Enter" && router.push("/garden")}
            className="px-4 h-10 rounded-full bg-white/90 border-2 flex items-center text-sm font-bold cursor-pointer select-none"
            style={{ borderColor: "#e8dcc8", color: "var(--animal-text-color)" }}
          >
            返回园地
          </div>
          <div
            role="button"
            tabIndex={0}
            aria-label={voiceMuted ? "开启语音朗读" : "关闭语音朗读"}
            onClick={() => setVoiceMutedState(!voiceMuted)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setVoiceMutedState(!voiceMuted);
            }}
            className="h-10 w-10 shrink-0 rounded-full bg-white/90 border-2 flex items-center justify-center text-lg cursor-pointer select-none"
            style={{ borderColor: "#e8dcc8" }}
          >
            {voiceMuted ? "🔇" : "🔊"}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {phase === "playing" && (
              <div
                className="flex items-center gap-2.5 rounded-full bg-white/90 border-2 px-4 py-2"
                style={{ borderColor: "#e8dcc8" }}
              >
                <span className="text-sm font-bold" style={{ color: "var(--animal-text-color)" }}>
                  进度
                </span>
                <div className="w-32 sm:w-44">
                  <Progress
                    percent={Math.round((current / questions.length) * 100)}
                    size="small"
                    showInfo={false}
                    duration={0.3}
                  />
                </div>
                <span className="text-sm font-bold" style={{ color: "var(--animal-text-color)" }}>
                  {Math.min(current + 1, questions.length)} / {questions.length}
                </span>
              </div>
            )}
            {phase === "playing" && (
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-9 h-9 rounded-xl bg-white/90 border-2 flex items-center justify-center text-lg"
                    style={{
                      borderColor: "#f4736f",
                      opacity: i < lives ? 1 : 0.4,
                      filter: i < lives ? "none" : "grayscale(1)",
                    }}
                    aria-label={i < lives ? "剩余生命" : "已失去生命"}
                  >
                    ❤️
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 主体 */}
        <div className="flex-1 flex items-center justify-center p-4 pb-12">
          {phase === "intro" && renderIntro()}
          {phase === "playing" && question && renderPlaying()}
          {phase === "done" && renderDone()}
        </div>
      </div>

      {type === "characters" && renderLibModal()}
      {type === "math" && renderMathModal()}
    </div>
  );

  function renderIntro() {
    return (
      <div className="w-full max-w-lg">
        <div
          className="bg-white rounded-[32px] p-6 sm:p-8"
          style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <div
              className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl font-black"
              style={{
                background: ACTIVITY_PALETTE[meta.color] ?? "var(--animal-primary-color)",
                color: "#fff",
              }}
            >
              {meta.glyph}
            </div>
            <div>
              <p className="text-2xl font-black" style={{ color: "var(--animal-text-color)" }}>
                {meta.name}
              </p>
              <Typewriter speed={50}>
                <p
                  className="text-sm mt-1"
                  style={{ color: "var(--animal-text-color-secondary)" }}
                >
                  {meta.desc}
                </p>
              </Typewriter>
            </div>
            {weakCount > 0 ? (
              <Chip color="app-yellow">有 {weakCount} 个薄弱知识点，本轮优先复习</Chip>
            ) : (
              <Chip color="app-green">暂无薄弱知识点，轻松开始</Chip>
            )}
            <div className="w-full text-left space-y-4">
              <div>
                <p className="text-sm font-bold mb-2" style={{ color: "var(--animal-text-color)" }}>
                  选择难度
                </p>
                <Radio
                  value={difficulty}
                  onChange={(v) => setDifficulty(v as Difficulty)}
                  direction="vertical"
                  options={DIFFICULTIES.map((d) => ({
                    label: `${d} · ${meta.difficultyInfo[d]}`,
                    value: d,
                  }))}
                />
              </div>
              <div>
                <p className="text-sm font-bold mb-2" style={{ color: "var(--animal-text-color)" }}>
                  每轮题量
                </p>
                <div className="max-w-40">
                  <Select
                    value={String(roundSize)}
                    onChange={(k) => setRoundSize(Number(k))}
                    options={ROUND_SIZES.map((n) => ({ key: String(n), label: `${n} 题` }))}
                  />
                </div>
              </div>
              {type === "characters" && (
                <div>
                  <p
                    className="text-sm font-bold mb-2"
                    style={{ color: "var(--animal-text-color)" }}
                  >
                    我的字库
                  </p>
                  <Button type="dashed" onClick={() => setLibOpen(true)}>
                    管理字库（自定义 {customChars.length} 个字）
                  </Button>
                </div>
              )}
              {type === "math" && (
                <div>
                  <p
                    className="text-sm font-bold mb-2"
                    style={{ color: "var(--animal-text-color)" }}
                  >
                    出题范围
                  </p>
                  <Button type="dashed" onClick={() => setMathOpen(true)}>
                    设置各档题型与数值上限
                  </Button>
                  <p
                    className="text-xs mt-2"
                    style={{ color: "var(--animal-text-color-secondary)" }}
                  >
                    简单档 {describeTier(1)}｜中等档 {describeTier(2)}｜困难档 {describeTier(3)}
                  </p>
                </div>
              )}
            </div>
            <Button type="primary" size="large" onClick={startPractice}>
              开始练习
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function renderPlaying() {
    return (
      <div className="w-full max-w-2xl relative">
        <div
          className="bg-white rounded-[32px] p-6 sm:p-10 relative"
          style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}
        >
          {question.mode === "flashcard" && renderFlashcard()}
          {question.mode === "choice" && renderChoice()}
          {question.mode === "keypad" && renderKeypad()}

          {/* 朗读按钮：重听题面 / 翻卡后跟读一遍 */}
          {speechLine && (
            <div
              role="button"
              tabIndex={0}
              aria-label="再读一遍"
              onClick={() => speak(speechLine.text, speechLine.voice)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  speak(speechLine.text, speechLine.voice);
                }
              }}
              className="absolute right-4 top-4 h-9 w-9 rounded-full bg-white border-2 flex items-center justify-center text-lg cursor-pointer select-none"
              style={{ borderColor: "#e8dcc8" }}
            >
              🔊
            </div>
          )}

          {/* 跳过（翻卡自评不需要） */}
          {question.mode !== "flashcard" && picked === null && (
            <div
              role="button"
              tabIndex={0}
              aria-label="跳过这道题"
              onClick={skipQuestion}
              onKeyDown={(e) => e.key === "Enter" && skipQuestion()}
              className="absolute left-4 bottom-4 px-3.5 py-1.5 rounded-full bg-white border-2 text-xs font-bold cursor-pointer select-none"
              style={{ borderColor: "#e8dcc8", color: "var(--animal-text-color-secondary)" }}
            >
              跳过
            </div>
          )}

          {/* 反馈胶囊 */}
          {picked !== null && question.mode !== "flashcard" && (
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-6 z-10 whitespace-nowrap">
              {picked === question.answer ? (
                <div
                  className="px-5 py-2.5 rounded-full text-white font-bold text-lg"
                  style={{ background: "#5cb85c", boxShadow: "0 6px 16px rgba(61,52,40,0.25)" }}
                >
                  答对啦，真棒！
                </div>
              ) : (
                <div
                  className="px-5 py-2.5 rounded-full text-white font-bold text-lg"
                  style={{ background: "#f4736f", boxShadow: "0 6px 16px rgba(61,52,40,0.25)" }}
                >
                  {picked === "__skipped__" ? "正确答案：" : "正确答案："}
                  {question.answer}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderFlashcard() {
    return (
      <>
        <div className="flex flex-col items-center text-center gap-4">
          <p className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            {revealed ? "记住它了吗？" : "想一想它念什么，点田字格看答案"}
          </p>
          {/* 田字格 */}
          <div
            role="button"
            tabIndex={0}
            aria-label={`汉字 ${question.display.value}，点按显示拼音`}
            onClick={revealed ? undefined : revealCard}
            onKeyDown={(e) => e.key === "Enter" && revealCard()}
            className="relative cursor-pointer"
            style={{ width: "min(66vw, 300px)", height: "min(66vw, 300px)" }}
          >
            <div
              className="absolute inset-0 rounded-2xl border-4"
              style={{ borderColor: "var(--animal-primary-color)" }}
            />
            <div
              className="absolute left-1/2 top-1.5 bottom-1.5 border-l-2 border-dashed"
              style={{ borderColor: "var(--animal-primary-color)", opacity: 0.45 }}
            />
            <div
              className="absolute top-1/2 left-1.5 right-1.5 border-t-2 border-dashed"
              style={{ borderColor: "var(--animal-primary-color)", opacity: 0.45 }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="font-black"
                style={{
                  fontSize: "min(42vw, 190px)",
                  lineHeight: 1,
                  color: "var(--animal-text-color)",
                }}
              >
                {question.display.value}
              </span>
            </div>
          </div>
          {revealed && (
            <div>
              <div
                className="text-4xl font-bold"
                style={{ color: "var(--animal-primary-color)" }}
              >
                {question.flip?.pinyin}
              </div>
              {question.flip?.word && (
                <p className="text-lg mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                  组词：{question.flip.word}
                </p>
              )}
            </div>
          )}
        </div>
        {revealed && (
          <div className="grid grid-cols-2 gap-3 mt-5">
            <CandyButton label="还不认识" bg="#b8b2a6" dark="#9a9488" onClick={() => answerFlashcard(false)} />
            <CandyButton label="认识啦！" bg="#67b56e" dark="#4c9c54" onClick={() => answerFlashcard(true)} />
          </div>
        )}
      </>
    );
  }

  function renderChoice() {
    return (
      <>
        <div className="flex flex-col items-center text-center gap-3">
          <p className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            {question.prompt}
          </p>
          <DisplayBody question={question} />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-5">
          {question.options.map((opt, i) => {
            const answered = picked !== null;
            const isAnswer = opt === question.answer;
            const chosenWrong = answered && opt === picked && !isAnswer;
            // 颜色认知题：选项是颜色名，糖果底色会与字义冲突，改用统一米白
            const neutral = question.display.kind === "color";
            const candy = CANDY[i % CANDY.length];
            return (
              <CandyButton
                key={opt}
                label={opt}
                bg={chosenWrong ? "#b8b2a6" : neutral ? "#fdf8ec" : candy.bg}
                dark={chosenWrong ? "#9a9488" : neutral ? "#d9cdb4" : candy.dark}
                textColor={neutral ? "var(--animal-text-color)" : undefined}
                small={opt.length > 6}
                dimmed={answered && !isAnswer && !chosenWrong}
                highlighted={answered && isAnswer}
                onClick={() => answerChoice(opt)}
                disabled={answered}
              />
            );
          })}
        </div>
      </>
    );
  }

  function renderKeypad() {
    return (
      <>
        <div className="flex flex-col items-center text-center gap-3">
          <p className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
            {question.prompt}
            <span className="ml-1 opacity-80">（输满自动判断）</span>
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <span
              className="text-6xl sm:text-7xl font-black tracking-widest"
              style={{ color: "var(--animal-text-color)" }}
            >
              {question.display.value}
            </span>
            <span
              className="min-w-24 h-16 px-4 rounded-2xl border-4 flex items-center justify-center text-4xl font-black"
              style={{
                borderColor: "#f08cb0",
                background: "#fdf1f6",
                color: "var(--animal-text-color)",
              }}
              aria-label="作答区"
            >
              {entry || <span style={{ opacity: 0.3 }}>?</span>}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2.5 mt-6 max-w-md mx-auto">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d, i) => {
            const candy = CANDY[i % CANDY.length];
            return (
              <CandyButton
                key={d}
                label={d}
                bg={candy.bg}
                dark={candy.dark}
                onClick={() => pressDigit(d)}
                disabled={picked !== null}
              />
            );
          })}
          <CandyButton
            label="删除"
            bg="#cfc7b8"
            dark="#b3aa99"
            className="col-span-2"
            onClick={() => setEntry((v) => v.slice(0, -1))}
            disabled={picked !== null || !entry}
          />
          <CandyButton
            label="好了"
            bg="#67b56e"
            dark="#4c9c54"
            className="col-span-3"
            onClick={() => submitKeypad(entry)}
            disabled={picked !== null || !entry}
          />
        </div>
      </>
    );
  }

  function renderDone() {
    const correctCount = results.filter((r) => r.correct).length;
    const accuracy = results.length ? Math.round((correctCount / results.length) * 100) : 0;
    const stars = accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : accuracy >= 40 ? 1 : 0;
    const wrongLabels = Array.from(
      new Set(results.filter((r) => !r.correct).map((r) => r.label))
    );
    const praise =
      stars === 3
        ? "太棒了，学习小达人！"
        : stars === 2
          ? "做得不错，继续加油！"
          : stars === 1
            ? "有进步，再练一轮吧！"
            : "没关系，再试一次一定更好！";
    return (
      <div className="w-full max-w-lg">
        <div
          className="bg-white rounded-[32px] p-6 sm:p-8"
          style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="text-4xl tracking-widest" aria-label={`${stars} 星`}>
              {"⭐".repeat(stars)}
              <span style={{ opacity: 0.25 }}>{"⭐".repeat(3 - stars)}</span>
            </div>
            <p className="text-2xl font-black" style={{ color: "var(--animal-text-color)" }}>
              {praise}
            </p>
            <p className="text-lg font-bold" style={{ color: "var(--animal-primary-color)" }}>
              正确 {correctCount} / {results.length}（{accuracy}%）
            </p>
            <p className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
              用时 {formatDuration(durationSec)}
            </p>
            {wrongLabels.length > 0 ? (
              <div className="w-full max-w-md">
                <p className="text-sm font-bold mb-2" style={{ color: "var(--animal-text-color)" }}>
                  错题回顾
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {wrongLabels.map((w) => (
                    <Chip key={w} color="app-red">
                      {w}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : (
              <Chip color="app-green">全对！一个都没错</Chip>
            )}
            <div className="flex gap-3 mt-2">
              <Button type="primary" size="large" onClick={restart}>
                再来一轮
              </Button>
              <Button size="large" onClick={() => router.push("/garden")}>
                返回园地
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderLibModal() {
    return (
      <Modal
        open={libOpen}
        title="管理识字字库"
        width={560}
        typewriter={false}
        footer={null}
        onClose={() => setLibOpen(false)}
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-bold mb-2">添加汉字（可一次粘贴多个）</p>
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <Input
                  value={newChars}
                  onChange={(e) => setNewChars(e.target.value)}
                  placeholder="如：春夏秋冬"
                  allowClear
                />
              </div>
              <div className="w-32">
                <Select
                  value={String(addTier)}
                  onChange={(k) => setAddTier(Number(k))}
                  options={[
                    { key: "1", label: "第1档 · 启蒙" },
                    { key: "2", label: "第2档 · 常用" },
                    { key: "3", label: "第3档 · 进阶" },
                  ]}
                />
              </div>
              <Button type="primary" loading={adding} onClick={addChars}>
                添加
              </Button>
            </div>
            <div className="mt-2 flex gap-2 items-center">
              <div className="w-44">
                <Input
                  value={manualPinyin}
                  onChange={(e) => setManualPinyin(e.target.value)}
                  placeholder="手动注音（可选，单字生效）"
                />
              </div>
              <p className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                拼音自动标注，多音字可在此修正
              </p>
            </div>
          </div>
          {([1, 2, 3] as Tier[]).map((t) => {
            const custom = customChars.filter((c) => c.tier === t);
            return (
              <div key={t}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-sm font-bold">
                    第 {t} 档 · {TIER_NAMES[t]}
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "var(--animal-text-color-secondary)" }}
                  >
                    内置 {BUILTIN_CHARACTERS[t as 1 | 2 | 3].length} 字 · 自定义 {custom.length} 字
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <span
                      className="text-xs"
                      style={{ color: "var(--animal-text-color-secondary)" }}
                    >
                      含内置字库
                    </span>
                    <Switch
                      size="small"
                      checked={builtinSwitch[String(t)] !== false}
                      onChange={(v) => setBuiltinSwitch((s) => ({ ...s, [String(t)]: v }))}
                    />
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {custom.map((c) => (
                    <Tag
                      key={c.id}
                      size="small"
                      variant="soft"
                      color="app-teal"
                      closable
                      onClose={() => removeChar(c.id)}
                    >
                      {c.char} {c.pinyin}
                    </Tag>
                  ))}
                  {custom.length === 0 && (
                    <span
                      className="text-xs"
                      style={{ color: "var(--animal-text-color-secondary)" }}
                    >
                      暂无自定义汉字
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    );
  }

  function renderMathModal() {
    return (
      <Modal
        open={mathOpen}
        title="数学出题范围"
        width={520}
        typewriter={false}
        onClose={() => setMathOpen(false)}
        onOk={() => setMathOpen(false)}
      >
        <div className="space-y-4">
          {([1, 2, 3] as Tier[]).map((t) => (
            <div key={t}>
              <p className="text-sm font-bold mb-1.5">
                {["", "简单档", "中等档", "困难档"][t]}（默认 {describeDefaultTier(t)}）
              </p>
              <Checkbox
                value={mathCfg[t].ops}
                onChange={(vs) =>
                  setMathCfg((c) => ({ ...c, [t]: { ...c[t], ops: vs as MathOp[] } }))
                }
                options={[
                  { label: "加法", value: "add" },
                  { label: "减法", value: "sub" },
                  { label: "乘法", value: "mul" },
                  { label: "除法", value: "div" },
                ]}
              />
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm">数值上限</span>
                <div className="w-32">
                  <Select
                    value={String(mathCfg[t].max)}
                    onChange={(k) =>
                      setMathCfg((c) => ({ ...c, [t]: { ...c[t], max: Number(k) } }))
                    }
                    options={MATH_MAX_OPTIONS.map((n) => ({
                      key: String(n),
                      label: `${n} 以内`,
                    }))}
                  />
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
            乘除法自动限制在九九口诀（最大 9×9）内；题型全部取消时按该档默认出题。
          </p>
        </div>
      </Modal>
    );
  }
}

/** 题干主体（文字 / 例词配图 / 色块 / 算式已单独渲染） */
function DisplayBody({ question }: { question: Question }) {
  const d = question.display;
  if (d.kind === "text") {
    return (
      <div>
        <div className="text-6xl font-black" style={{ color: "var(--animal-text-color)" }}>
          {d.value}
        </div>
        {d.sub && (
          <div className="text-2xl mt-2" style={{ color: "var(--animal-text-color)" }}>
            {d.sub}
          </div>
        )}
      </div>
    );
  }
  if (d.kind === "emoji") {
    return (
      <div>
        <div className="text-7xl">{d.value}</div>
        {d.sub && (
          <div className="text-xl mt-2 font-bold" style={{ color: "var(--animal-text-color)" }}>
            {d.sub}
          </div>
        )}
      </div>
    );
  }
  if (d.kind === "color") {
    return (
      <div>
        <div
          className="w-28 h-28 rounded-3xl border-4"
          style={{ background: d.value, borderColor: "var(--animal-border-color-light)" }}
        />
        {d.sub && (
          <div className="text-xl mt-3 font-bold" style={{ color: "var(--animal-text-color)" }}>
            {d.sub}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="text-5xl font-black tracking-widest" style={{ color: "var(--animal-text-color)" }}>
      {d.value}
    </div>
  );
}

/** 糖果色游戏按钮（底部立体边 + 按压下沉） */
function CandyButton({
  label,
  bg,
  dark,
  onClick,
  disabled,
  dimmed,
  highlighted,
  small,
  textColor,
  className = "",
}: {
  label: string;
  bg: string;
  dark: string;
  onClick: () => void;
  disabled?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  small?: boolean;
  textColor?: string;
  className?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={label}
      onClick={() => !disabled && onClick()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`rounded-2xl text-center font-bold select-none ${className} ${
        disabled ? "cursor-default" : "cursor-pointer"
      } ${small ? "py-3 px-2 text-lg sm:text-xl" : "py-4 text-2xl"}`}
      style={{
        background: bg,
        color: textColor ?? "#fff",
        boxShadow: disabled ? "none" : `0 5px 0 ${dark}`,
        opacity: dimmed ? 0.5 : 1,
        outline: highlighted ? "4px solid #ffd85e" : undefined,
        outlineOffset: highlighted ? 2 : undefined,
        transform: disabled ? "translateY(3px)" : undefined,
        transition: "transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {label}
    </div>
  );
}

function describeDefaultTier(t: Tier): string {
  const cfg = DEFAULT_MATH_CONFIG[t];
  return `${cfg.ops.map((o) => MATH_OP_LABEL[o]).join("、")} ${cfg.max} 以内`;
}
