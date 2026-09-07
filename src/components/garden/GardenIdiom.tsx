"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "animal-island-ui";
import { api, calcAge } from "@/lib/api";
import { useMemberSelect } from "@/components/MemberFilter";
import OwlTeacher, { type OwlAction } from "@/components/garden/OwlTeacher";
import SceneBackground from "@/components/garden/SceneBackground";
import { speak, stopSpeaking, useVoiceMuted } from "@/lib/garden/speech";
import { AGE_GROUPS, ageGroupOfAge, type AgeGroupKey } from "@/data/garden/idioms";

interface IdiomItem {
  word: string;
  pinyin: string;
  meaning: string;
  example: string;
}

// 成语故事朗读音色：yunxia（云夏·男童声）——儿童绘本/睡前童话类音色，童真亲切（见 voice 研究）
const STORY_VOICE = "yunxia";
// 单条语音上限（/api/tts 限制 200 字，句块控制在两行以内更稳）
const CHUNK_MAX = 80;

/** 句子切块：按 ！？…；。切句；长句按逗号/顿号折叠，再长硬切 */
function takeChunks(pending: string): { chunks: string[]; rest: string } {
  const chunks: string[] = [];
  let buf = pending;
  while (buf.length > 0) {
    const sentEnd = buf.search(/[。！？…；]/);
    if (sentEnd !== -1 && sentEnd < CHUNK_MAX) {
      const cut = sentEnd + 1;
      chunks.push(buf.slice(0, cut));
      buf = buf.slice(cut);
    } else if (buf.length > CHUNK_MAX) {
      const lastComma = Math.max(buf.lastIndexOf("，"), buf.lastIndexOf("、"), buf.lastIndexOf("："));
      const cut = lastComma >= CHUNK_MAX / 2 ? lastComma + 1 : CHUNK_MAX;
      chunks.push(buf.slice(0, cut));
      buf = buf.slice(cut);
    } else {
      break; // 等句号补全
    }
  }
  return { chunks, rest: buf };
}

export default function GardenIdiom() {
  const router = useRouter();
  const { member } = useMemberSelect();

  const [list, setList] = useState<IdiomItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [ageGroup, setAgeGroup] = useState<AgeGroupKey>("3-6");
  const [storyText, setStoryText] = useState("");
  const [storyStatus, setStoryStatus] = useState<"idle" | "generating" | "done">("idle");
  const [storyError, setStoryError] = useState("");

  const [voiceMuted, setVoiceMutedState] = useVoiceMuted();
  const [owlAction, setOwlAction] = useState<OwlAction>("idle");
  const [owlMsg, setOwlMsg] = useState<{ text: string; n: number } | null>(null);
  const owlNonceRef = useRef(0);

  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(""); // 未成句的流式残稿
  const queueRef = useRef<string[]>([]); // 待朗读句块
  const speakingRef = useRef(false);
  const storyIdxRef = useRef(0); // 生成故事对应的成语下标，防止切换卡片后旧流继续入队

  const owlSay = (action: OwlAction, text: string) => {
    owlNonceRef.current += 1;
    setOwlAction(action);
    setOwlMsg({ text, n: owlNonceRef.current });
  };

  // 成语列表 + 按成员年龄默认故事年龄组
  useEffect(() => {
    api<IdiomItem[]>("/api/garden-idioms")
      .then(setList)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const s = member?.birthday ? calcAge(member.birthday) : "";
    if (!s) return;
    if (!s.includes("岁")) return; // 未满 1 岁或生日无效，保留默认
    setAgeGroup(ageGroupOfAge(parseInt(s, 10) || 0));
  }, [member?.birthday]);

  // 离开页面停掉语音与生成流
  useEffect(
    () => () => {
      abortRef.current?.abort();
      stopSpeaking();
    },
    []
  );

  /** 先停掉在播语音，再逐句播放队列（上一句播完才播下一句，句序不乱） */
  const pumpQueue = async () => {
    if (speakingRef.current) return;
    speakingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const t = queueRef.current.shift()!;
        await speak(t, STORY_VOICE);
      }
    } finally {
      speakingRef.current = false;
    }
  };
  const enqueueSpeech = (text: string) => {
    queueRef.current.push(text);
    void pumpQueue();
  };

  /** 把流式增量切成句块：显示逐句增长，同时逐句进朗读队列（边生成边语音） */
  const feedStream = (delta: string) => {
    pendingRef.current += delta;
    const { chunks, rest } = takeChunks(pendingRef.current);
    pendingRef.current = rest;
    for (const c of chunks) {
      setStoryText((s) => s + c);
      enqueueSpeech(c);
    }
  };

  const resetStory = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopSpeaking();
    queueRef.current = [];
    speakingRef.current = false;
    pendingRef.current = "";
    storyIdxRef.current = -1;
    setStoryText("");
    setStoryError("");
    setStoryStatus("idle");
  };

  const idiom = list[idx];

  const startStory = async () => {
    if (!idiom || storyStatus === "generating") return;
    resetStory();
    const myIdx = idx;
    storyIdxRef.current = myIdx;
    setStoryStatus("generating");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/garden-idiom-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: idiom.word, ageGroup }),
        signal: ac.signal,
      });
      if (!res.ok) {
        let msg = "故事生成失败，请稍后再试";
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* 非 JSON 错误体，用默认文案 */
        }
        // 若中途已在流式后报错（缓存命中但断网），保留已有文本
        if (storyIdxRef.current !== myIdx) return;
        setStoryError(msg);
        setStoryStatus("idle");
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (storyIdxRef.current !== myIdx) {
          ac.abort(); // 已切到别的成语：丢弃旧流
          return;
        }
        feedStream(decoder.decode(value, { stream: true }));
      }
      if (storyIdxRef.current !== myIdx) return;
      feedStream(""); // 冲刷残稿成最后一句
      setStoryStatus("done");
      owlSay("great", "故事讲完啦！还想再听一个吗？");
    } catch (e: any) {
      if (ac.signal.aborted || storyIdxRef.current !== myIdx) return;
      setStoryError(e?.message || "故事生成失败，请稍后再试");
      setStoryStatus("idle");
    }
  };

  const stopStory = () => {
    resetStory();
  };

  /** 重听：把整篇故事按句重新排队朗读 */
  const replayStory = () => {
    if (!storyText) return;
    stopSpeaking();
    queueRef.current = [];
    speakingRef.current = false;
    const { chunks, rest } = takeChunks(storyText);
    const all = rest ? [...chunks, rest] : chunks;
    for (const c of all) enqueueSpeech(c);
  };

  const goIdx = (next: number) => {
    resetStory();
    setIdx(((next % list.length) + list.length) % list.length);
  };

  const readCard = () => {
    if (!idiom) return;
    // 拼音在中文 TTS 里按字母读会走调，读成语正文 + 解释 + 例句即可
    void speak(`${idiom.word}。${idiom.meaning}${idiom.example}`, "xiaoyi");
  };

  if (list.length === 0) {
    return (
      <p className="text-center py-20 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        加载中…
      </p>
    );
  }

  const activeIdiom = idiom!;
  const generating = storyStatus === "generating";
  // 拼音按音节与汉字一一对齐；音节数不匹配时（罕见兜底）降级为整行显示
  const syllables = activeIdiom.pinyin.split(/\s+/).filter(Boolean);
  const pinyinAligned = syllables.length === activeIdiom.word.length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-label="成语卡片">
      <SceneBackground />
      <OwlTeacher
        action={owlAction}
        dialogText={owlMsg?.text}
        nonce={owlMsg?.n}
        onActionComplete={(a) => {
          if (a !== "idle") setOwlAction("idle");
        }}
        onPoke={() => owlSay("ok", "咕咕！想听故事就点下面的按钮呀")}
      />
      <div className="relative min-h-full flex flex-col">
        {/* 顶栏：返回 + 读卡片 + 静音 */}
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
            aria-label="朗读成语与解释"
            onClick={readCard}
            onKeyDown={(e) => e.key === "Enter" && readCard()}
            className="px-4 h-10 rounded-full bg-white/90 border-2 flex items-center text-sm font-bold cursor-pointer select-none"
            style={{ borderColor: "#e8dcc8", color: "var(--animal-text-color)" }}
          >
            🔊 读一读
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
        </div>

        {/* 主体卡片 */}
        <div className="flex-1 flex items-center justify-center p-4 pb-14">
          <div className="w-full max-w-2xl bg-white rounded-[32px] p-6 sm:p-8"
            style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}
          >
            {/* 成语大字 + 拼音：拼音按音节对齐到对应汉字上方，每个汉字落在虚线田字格里 */}
            <div className="flex flex-col items-center text-center gap-3">
              <div className="flex gap-2 sm:gap-3">
                {activeIdiom.word.split("").map((ch, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span
                      className="h-5 sm:h-6 text-base sm:text-lg font-bold"
                      style={{ color: "var(--animal-primary-color)" }}
                    >
                      {pinyinAligned ? syllables[i] : ""}
                    </span>
                    <div
                      className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-4"
                      style={{ borderColor: "var(--animal-primary-color)" }}
                    >
                      <div
                        className="absolute left-1/2 top-1.5 bottom-1.5 border-l-2 border-dashed"
                        style={{ borderColor: "var(--animal-primary-color)", opacity: 0.45 }}
                      />
                      <div
                        className="absolute top-1/2 left-1.5 right-1.5 border-t-2 border-dashed"
                        style={{ borderColor: "var(--animal-primary-color)", opacity: 0.45 }}
                      />
                      <div
                        className="absolute inset-0 flex items-center justify-center text-4xl sm:text-5xl font-black"
                        style={{ color: "var(--animal-text-color)" }}
                      >
                        {ch}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {!pinyinAligned && (
                <p className="text-base font-bold" style={{ color: "var(--animal-primary-color)" }}>
                  {activeIdiom.pinyin}
                </p>
              )}
              <p className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
                成语卡片 · 第 {idx + 1} 个 / 共 {list.length} 个
              </p>
            </div>

            {/* 解释 + 举例 */}
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl px-4 py-3" style={{ background: "var(--animal-card-soft-bg, #f6f8f6)" }}>
                <p className="text-xs font-bold mb-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                  意思
                </p>
                <p className="text-base leading-relaxed" style={{ color: "var(--animal-text-color)" }}>
                  {activeIdiom.meaning}
                </p>
              </div>
              <div className="rounded-2xl px-4 py-3" style={{ background: "var(--animal-card-soft-bg, #f6f8f6)" }}>
                <p className="text-xs font-bold mb-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                  造句
                </p>
                <p className="text-base leading-relaxed" style={{ color: "var(--animal-text-color)" }}>
                  {activeIdiom.example}
                </p>
              </div>
            </div>

            {/* 小故事：AI 按年龄组生成，边生成边合成语音 */}
            <div className="mt-5 rounded-2xl border-2 p-4" style={{ borderColor: "#f0e6d2" }}>
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm font-bold" style={{ color: "var(--animal-text-color)" }}>
                  📖 小故事
                </p>
                <div className="w-40">
                  <Select
                    value={ageGroup}
                    onChange={(k) => {
                      resetStory();
                      setAgeGroup(k as AgeGroupKey);
                    }}
                    options={AGE_GROUPS.map((a) => ({ key: a.key, label: `${a.label}` }))}
                    disabled={generating}
                    aria-label="故事年龄组"
                  />
                </div>
                <div className="ml-auto flex gap-2">
                  {!generating && (
                    <Button type="primary" size="small" onClick={startStory}>
                      {storyText ? "重新讲" : "AI 讲故事"}
                    </Button>
                  )}
                  {generating && (
                    <Button size="small" onClick={stopStory}>
                      停止
                    </Button>
                  )}
                  {storyText && !generating && (
                    <Button size="small" onClick={replayStory}>
                      重听
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-3 min-h-16 max-h-40 overflow-y-auto rounded-xl px-3 py-2" style={{ background: "var(--animal-card-soft-bg, #f6f8f6)" }}>
                {storyText ? (
                  <p className="text-[15px] leading-7 whitespace-pre-wrap" style={{ color: "var(--animal-text-color)" }}>
                    {storyText}
                  </p>
                ) : (
                  <p className="text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
                    {generating ? "猫头鹰老师正在编故事，说完一句就念一句…" : "点「AI 讲故事」，猫头鹰老师会按成语的意思编一个小故事，边讲边读给你听"}
                  </p>
                )}
                {generating && storyText && (
                  <span className="inline-block w-1.5 h-4 align-middle animate-pulse" style={{ background: "var(--animal-primary-color)" }} />
                )}
              </div>

              {storyError && (
                <p className="mt-2 text-sm font-bold" style={{ color: "#d4574f" }}>
                  {storyError}
                </p>
              )}
            </div>

            {/* 翻页 */}
            <div className="mt-5 flex items-center justify-between gap-3">
              <Button onClick={() => goIdx(idx - 1)} disabled={generating}>
                ‹ 上一个
              </Button>
              <span className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                成语：{activeIdiom.word}
              </span>
              <Button onClick={() => goIdx(idx + 1)} disabled={generating}>
                下一个 ›
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
