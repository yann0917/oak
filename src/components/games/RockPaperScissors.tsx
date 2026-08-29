"use client";

// 石头剪刀布：GestureRecognizer 识别 ✊(Closed_Fist)/✋(Open_Palm)/✌️(Victory)，
// 识别保持 1 秒算"出手"，和电脑比三局两胜。也支持点按钮的纯手玩模式。
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "animal-island-ui";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { EXCITED_TONE, SORRY_TONE, speak, useVoiceMuted } from "@/lib/garden/speech";
import {
  describeGameError,
  getGestureRecognizer,
  openCamera,
} from "@/lib/games/mediapipe";
import { toast } from "@/lib/toast";

type Rps = "rock" | "paper" | "scissors";
type Phase = "intro" | "loading" | "playing" | "done";

const GESTURE_MAP: Record<string, Rps> = {
  Closed_Fist: "rock",
  Open_Palm: "paper",
  Victory: "scissors",
};

const RPS_META: Record<Rps, { emoji: string; name: string }> = {
  rock: { emoji: "✊", name: "石头" },
  paper: { emoji: "✋", name: "布" },
  scissors: { emoji: "✌️", name: "剪刀" },
};

function beats(a: Rps, b: Rps): boolean {
  return (a === "rock" && b === "scissors") || (a === "paper" && b === "rock") || (a === "scissors" && b === "paper");
}

const ROUNDS = 5;
const HOLD_MS = 900;

interface RoundRecord {
  mine: Rps;
  foe: Rps;
  result: "win" | "lose" | "draw";
}

export default function RockPaperScissors() {
  const router = useRouter();
  const { currentChild } = useChildren();
  const [voiceMuted, setVoiceMuted] = useVoiceMuted();

  const [phase, setPhase] = useState<Phase>("intro");
  const [mode, setMode] = useState<"camera" | "buttons">("camera");
  const [error, setError] = useState("");
  const [round, setRound] = useState(1);
  const [myScore, setMyScore] = useState(0);
  const [foeScore, setFoeScore] = useState(0);
  const [myMove, setMyMove] = useState<Rps | null>(null);
  const [foeMove, setFoeMove] = useState<Rps | null>(null);
  const [result, setResult] = useState<"win" | "lose" | "draw" | null>(null);
  const [detected, setDetected] = useState<Rps | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [handSeen, setHandSeen] = useState(false); // 识别到手、但还没认出姿势
  const [rawGesture, setRawGesture] = useState<string | null>(null); // 原始分类名（诊断用）

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const holdRef = useRef<{ rps: Rps; since: number } | null>(null);
  const phaseRef = useRef<Phase>("intro");
  const modeRef = useRef<"camera" | "buttons">("camera");
  const busyRef = useRef(false);
  const roundRef = useRef(1);
  const myScoreRef = useRef(0);
  const foeScoreRef = useRef(0);
  const recordsRef = useRef<RoundRecord[]>([]);
  const savedRef = useRef(false);
  const startedAtRef = useRef(0);
  const loopTokenRef = useRef(0);
  const detectedRef = useRef<Rps | null>(null);
  const handSeenRef = useRef(false);
  const rawRef = useRef<string | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  function cleanup() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => () => cleanup(), []);
  useEffect(() => {
    if (phase !== "done" || !currentChild || savedRef.current) return;
    if (recordsRef.current.length === 0) return;
    savedRef.current = true;
    api("/api/garden-records", {
      method: "POST",
      body: JSON.stringify({
        childId: currentChild.id,
        activity: "rock-paper-scissors",
        difficulty: "简单",
        durationSec,
        results: recordsRef.current.map((r) => ({
          itemKey: `rps:${r.mine}vs${r.foe}`,
          label: `我出${RPS_META[r.mine].name}，电脑出${RPS_META[r.foe].name}`,
          correct: r.result === "win",
        })),
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentChild]);

  const start = async (m: "camera" | "buttons") => {
    if (phase === "loading") return;
    setMode(m);
    setPhase("loading");
    setError("");
    try {
      if (m === "camera") {
        stopStream();
        const recognizer = await getGestureRecognizer();
        const video = videoRef.current!;
        const stream = await openCamera(video);
        streamRef.current = stream;
        await new Promise<void>((res) => {
          if (video.readyState >= 2) return res();
          video.onloadeddata = () => res();
        });
        resetRound();
        const token = ++loopTokenRef.current;
        phaseRef.current = "playing";
        setPhase("playing");
        startedAtRef.current = Date.now();
        rafRef.current = requestAnimationFrame(() => detectLoop(recognizer, token));
      } else {
        resetRound();
        setPhase("playing");
        startedAtRef.current = Date.now();
      }
    } catch (e) {
      if (m === "camera") {
        toast(describeGameError(e), "warning");
        start("buttons");
      } else {
        setError(describeGameError(e));
        setPhase("intro");
      }
    }
     
  };

  function resetRound() {
    roundRef.current = 1;
    myScoreRef.current = 0;
    foeScoreRef.current = 0;
    recordsRef.current = [];
    busyRef.current = false;
    holdRef.current = null;
    savedRef.current = false;
    handSeenRef.current = false;
    rawRef.current = null;
    setRawGesture(null);
    setHandSeen(false);
    setRound(1);
    setMyScore(0);
    setFoeScore(0);
    setMyMove(null);
    setFoeMove(null);
    setResult(null);
    setDetected(null);
    setWaiting(false);
  }

  function detectLoop(recognizer: Awaited<ReturnType<typeof getGestureRecognizer>>, token: number) {
    // 先续帧再判断：第一帧若在 React 提交前触发，旧写法会"返回即死"
    if (token !== loopTokenRef.current) return;
    rafRef.current = requestAnimationFrame(() => detectLoop(recognizer, token));
    if (phaseRef.current !== "playing") return;
    const video = videoRef.current;
    if (video && video.readyState >= 2) {
      const now = performance.now();
      const res = recognizer.recognizeForVideo(video, now);
      const gestures = res.gestures?.[0];
      let seen: Rps | null = null;
      // 诊断状态：没看到手 / 看到手 / 原始手势分类。置信度要求放低到 0.5：
      // 孩子的手小、离镜头远时 Open_Palm 等分类常在 0.5~0.7，太高会被吞掉。
      let raw: string | null = null;
      if (gestures && gestures.length > 0) {
        raw = gestures[0].categoryName;
        if (raw !== "None" && gestures[0].score > 0.5) {
          seen = GESTURE_MAP[raw] ?? null;
        }
      }
      const hasHand = res.landmarks.length > 0;
      if (handSeenRef.current !== hasHand) {
        handSeenRef.current = hasHand;
        setHandSeen(hasHand);
      }
      if (rawRef.current !== raw) {
        rawRef.current = raw;
        setRawGesture(raw);
      }
      if (seen) {
        // 手势保持 HOLD_MS 才算出手，避免挥拳瞬间误判
        if (!holdRef.current || holdRef.current.rps !== seen) {
          holdRef.current = { rps: seen, since: now };
        } else if (now - holdRef.current.since >= HOLD_MS && !busyRef.current) {
          holdRef.current = null;
          stageMove(seen);
        }
      } else {
        holdRef.current = null;
      }
      if (detectedRef.current !== seen) {
        detectedRef.current = seen;
        setDetected(seen);
      }
    }
  }

  async function stageMove(mine: Rps) {
    if (busyRef.current) return;
    busyRef.current = true;
    setWaiting(false);
    setMyMove(mine);
    // 电脑随机出手
    const foe = (["rock", "paper", "scissors"] as Rps[])[Math.floor(Math.random() * 3)];
    setFoeMove(foe);
    const res: "win" | "lose" | "draw" = mine === foe ? "draw" : beats(mine, foe) ? "win" : "lose";
    setResult(res);
    if (res === "win") myScoreRef.current++;
    else if (res === "lose") foeScoreRef.current++;
    setMyScore(myScoreRef.current);
    setFoeScore(foeScoreRef.current);
    recordsRef.current.push({ mine, foe, result: res });

    const line =
      res === "win"
        ? `${RPS_META[mine].name}赢${RPS_META[foe].name}！你赢啦！`
        : res === "lose"
          ? `${RPS_META[foe].name}赢${RPS_META[mine].name}！轮到电脑赢一局`
          : `都是${RPS_META[mine].name}，平手！再来一次`;
    await speak(line, "xiaoyi", res === "win" ? EXCITED_TONE : res === "lose" ? SORRY_TONE : undefined);
    await new Promise<void>((resolve) => setTimeout(resolve, 700));

    const isLast = roundRef.current >= ROUNDS;
    if (isLast) {
      const myW = myScoreRef.current;
      const foeW = foeScoreRef.current;
      setDurationSec(Math.round((Date.now() - startedAtRef.current) / 1000));
      setPhase("done");
      speak(
        myW > foeW ? `五局比完，你赢了 ${myW} 局，太棒啦！` : `五局比完，电脑赢了 ${foeW} 局，下次加油！`,
        "xiaoyi",
        myW > foeW ? EXCITED_TONE : SORRY_TONE
      );
    } else {
      setRound((r) => {
        roundRef.current = r + 1;
        return r + 1;
      });
      setMyMove(null);
      setFoeMove(null);
      setResult(null);
      setWaiting(true);
      await new Promise<void>((resolve) => setTimeout(resolve, 1400));
      setWaiting(false);
      busyRef.current = false;
    }
  }

  const tryThrow = (mine: Rps) => {
    if (busyRef.current) return;
    void stageMove(mine);
  };

  const playing = phase === "playing";
  const showPreview = mode === "camera" && playing;

  return (
    <div>
      {(phase === "intro" || phase === "loading") && (
        <div className="max-w-lg mx-auto">
          <div
            className="bg-white rounded-[32px] p-6 sm:p-8 text-center"
            style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}
          >
            <div className="text-5xl">✊✋✌️</div>
            <p className="text-2xl font-black mt-2" style={{ color: "var(--animal-text-color)" }}>
              石头剪刀布
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
              和电脑赛 {ROUNDS} 局：✊ 是石头、✋ 是布、✌️ 是剪刀
            </p>
            <div className="mt-4 text-sm space-y-1" style={{ color: "var(--animal-text-color-secondary)" }}>
              <p>🌸 出手后保持 1 秒算数，不要太快收回去</p>
              <p>🏆 五局里赢得多就赢啦</p>
            </div>
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            <Button type="primary" size="large" loading={phase === "loading"} onClick={() => start("camera")} className="mt-5 w-full">
              📷 伸手玩（摄像头）
            </Button>
            <Button size="large" disabled={phase === "loading"} onClick={() => start("buttons")} className="mt-3 w-full">
              🖱 点按钮玩
            </Button>
          </div>
        </div>
      )}

      {playing && (
        <div className="max-w-lg mx-auto">
          {/* 记分板 */}
          <div className="flex items-center justify-center gap-3 text-sm font-bold">
            <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700">我 {myScore}</span>
            <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700">电脑 {foeScore}</span>
            <span className="text-xs text-gray-400">第 {Math.min(roundRef.current, ROUNDS)}/{ROUNDS} 局</span>
            <button className="text-lg" onClick={() => setVoiceMuted(!voiceMuted)} aria-label={voiceMuted ? "开启语音" : "关闭语音"}>
              {voiceMuted ? "🔇" : "🔊"}
            </button>
          </div>

          {/* 双方出手 */}
          <div className="mt-4 bg-white rounded-[32px] p-6 sm:p-8" style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.14)" }}>
            <div className="flex items-center justify-around">
              <div className="text-center">
                <div className="text-6xl">{myMove ? RPS_META[myMove].emoji : "❓"}</div>
                <p className="text-xs mt-2 font-bold" style={{ color: "var(--animal-text-color)" }}>
                  你
                </p>
              </div>
              <div className="text-3xl font-black text-gray-300">VS</div>
              <div className="text-center">
                <div className="text-6xl">{foeMove ? RPS_META[foeMove].emoji : "❓"}</div>
                <p className="text-xs mt-2 font-bold" style={{ color: "var(--animal-text-color)" }}>
                  电脑
                </p>
              </div>
            </div>
            {waiting && <p className="text-center text-sm mt-4" style={{ color: "var(--animal-text-color-secondary)" }}>
              下一局要开始了，再出一次手吧
            </p>}
            {result === "win" && <ResultBanner color="#5cb85c">🎉 你赢啦！</ResultBanner>}
            {result === "lose" && <ResultBanner color="#f4736f">🤖 电脑赢了</ResultBanner>}
            {result === "draw" && <ResultBanner color="#b8b2a6">🤝 平手</ResultBanner>}
            <div className="mt-4 text-center text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
              {mode === "camera" ? (
                detected ? (
                  <span className="font-bold" style={{ color: "var(--animal-primary-color)" }}>
                    看到 {RPS_META[detected].emoji} {RPS_META[detected].name}
                    {holdRef.current ? "，保持住…" : "，保持 1 秒出手"}
                  </span>
                ) : handSeen ? (
                  <span>
                    看到手手了！摆出 ✊ / ✋ / ✌️ 保持 1 秒
                    {rawGesture ? `（识别到：${rawGesture}）` : ""}
                  </span>
                ) : (
                  "手没进镜头：伸出一只手，✊ 石头 / ✋ 布 / ✌️ 剪刀"
                )
              ) : (
                "点下面的按钮出招"
              )}
            </div>
          </div>

          {/* 按钮出招 */}
          {mode === "buttons" && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {(Object.keys(RPS_META) as Rps[]).map((k) => (
                <button
                  key={k}
                  disabled={busyRef.current}
                  onClick={() => tryThrow(k)}
                  className="rounded-2xl py-4 text-lg font-black text-white disabled:opacity-50"
                  style={{ background: "#7d8ee0", boxShadow: "0 4px 0 #5f6fca" }}
                >
                  {RPS_META[k].emoji} {RPS_META[k].name}
                </button>
              ))}
            </div>
          )}

          <button className="mt-4 text-xs mx-auto block" style={{ color: "var(--animal-text-color-secondary)" }} onClick={() => setPhase("done")}>
            结束本轮
          </button>
        </div>
      )}

      {/* 摄像头检测/预览：常驻挂载，避免启动流程里 videoRef 取不到 */}
      <div
        className={`relative mx-auto mt-4 w-full max-w-lg overflow-hidden rounded-3xl border-4 ${showPreview ? "block" : "hidden"}`}
        style={{ borderColor: "var(--animal-border-color-light)" }}
      >
        <video ref={videoRef} playsInline muted className="block w-full" style={{ transform: "scaleX(-1)" }} />
      </div>

      {phase === "done" && (
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 text-center" style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}>
            <div className="text-6xl">{myScore > foeScore ? "🏅" : myScore < foeScore ? "💪" : "🤝"}</div>
            <p className="text-2xl font-black mt-2" style={{ color: "var(--animal-text-color)" }}>
              我 {myScore} : {foeScore} 电脑 {myScore > foeScore ? "—— 你赢啦！" : myScore < foeScore ? "—— 下次再战！" : "—— 平手!"}
            </p>
            <div className="flex gap-3 mt-6">
              <Button type="primary" size="large" onClick={() => start(mode)} className="flex-1">
                再来一场
              </Button>
              <Button size="large" onClick={() => router.push("/garden/games")} className="flex-1">
                返回游戏
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultBanner({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 text-center">
      <span className="inline-block px-6 py-2.5 rounded-full text-white font-bold text-xl" style={{ background: color, boxShadow: "0 6px 16px rgba(61,52,40,0.25)" }}>
        {children}
      </span>
    </div>
  );
}
