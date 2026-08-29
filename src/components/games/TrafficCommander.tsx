"use client";

// 交通指挥官：✋ 张开 = 拦停（红灯），✊ 收拳 = 放行（绿灯）——像路口交警一样指挥小汽车。
// 亮了红灯必须举展开手掌拦车，绿灯收拳放行；做对规则小汽车才安全通过，答错会响起警笛。
// 手势用"张开度"判定（只看四指，不含拇指——指拇分开测最稳），保持滞回防抖动。
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "animal-island-ui";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { EXCITED_TONE, SORRY_TONE, speak, useVoiceMuted } from "@/lib/garden/speech";
import {
  describeGameError,
  extendedFingers2d,
  getHandLandmarker,
  openCamera,
} from "@/lib/games/mediapipe";
import { toast } from "@/lib/toast";

type Phase = "intro" | "loading" | "playing" | "done";
type Light = "red" | "green";
type Cmd = "stop" | "go";

const ROUNDS = 8;
const HOLD_MS = 600;

interface Scenario {
  light: Light;
  label: string;
  itemKey: string;
}

function buildScenarios(): Scenario[] {
  const list: Scenario[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const light: Light = i % 2 === 0 ? "red" : "green";
    list.push({
      light,
      label: light === "red" ? "红灯" : "绿灯",
      itemKey: `tc:light:${light}`,
    });
  }
  // 打乱红绿顺序
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export default function TrafficCommander() {
  const router = useRouter();
  const { currentChild } = useChildren();
  const [voiceMuted, setVoiceMuted] = useVoiceMuted();

  const [phase, setPhase] = useState<Phase>("intro");
  const [mode, setMode] = useState<"camera" | "buttons">("camera");
  const [error, setError] = useState("");
  const [round, setRound] = useState(0);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [result, setResult] = useState<"ok" | "wrong" | null>(null);
  const [handSeen, setHandSeen] = useState(false);
  const [handState, setHandState] = useState<Cmd | null>(null);
  const [carShake, setCarShake] = useState(0);
  const [wrongFlash, setWrongFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const loopTokenRef = useRef(0);
  const phaseRef = useRef<Phase>("intro");
  const modeRef = useRef<"camera" | "buttons">("camera");
  const roundRef = useRef(0);
  const scenariosRef = useRef<Scenario[]>([]);
  const resultsRef = useRef<{ itemKey: string; label: string; correct: boolean }[]>([]);
  const answeredRef = useRef(false);
  const answerSinceRef = useRef<number | null>(null);
  const commandRef = useRef<Cmd | null>(null);
  const handSeenRef = useRef(false);
  const handStateRef = useRef<Cmd | null>(null);
  const lockedRef = useRef(false);
  const savedRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => () => cleanup(), []);
  useEffect(() => {
    if (phase !== "done" || !currentChild || savedRef.current) return;
    if (resultsRef.current.length === 0) return;
    savedRef.current = true;
    api("/api/garden-records", {
      method: "POST",
      body: JSON.stringify({
        childId: currentChild.id,
        activity: "traffic-commander",
        difficulty: "简单",
        durationSec: 45,
        results: resultsRef.current,
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentChild]);

  function cleanup() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  const start = async (m: "camera" | "buttons") => {
    setMode(m);
    setPhase("loading");
    setError("");
    try {
      let landmarker: Awaited<ReturnType<typeof getHandLandmarker>> | null = null;
      if (m === "camera") {
        landmarker = await getHandLandmarker();
        stopStream();
        const video = videoRef.current!;
        const stream = await openCamera(video);
        streamRef.current = stream;
        await new Promise<void>((res) => {
          if (video.readyState >= 2) return res();
          video.onloadeddata = () => res();
        });
      }
      const scs = buildScenarios();
      setScenarios(scs);
      scenariosRef.current = scs;
      roundRef.current = 0;
      resultsRef.current = [];
      savedRef.current = false;
      setRound(0);
      setCorrectCount(0);
      setResult(null);
      setWrongFlash(false);
      answeredRef.current = false;
      lockedRef.current = false;
      setPhase("playing");
      const token = ++loopTokenRef.current;
      phaseRef.current = "playing";
      if (landmarker) {
        rafRef.current = requestAnimationFrame(() => detectLoop(landmarker, token));
      }
      speak("交通指挥官！张开手掌✋拦车，握拳✊放行。来试试吧！", "xiaoyi");
    } catch (e) {
      if (m === "camera") {
        toast(describeGameError(e), "warning");
        start("buttons");
      } else {
        setError(describeGameError(e));
        setPhase("intro");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  };

  function detectLoop(lm: Awaited<ReturnType<typeof getHandLandmarker>>, token: number) {
    if (token !== loopTokenRef.current) return;
    rafRef.current = requestAnimationFrame(() => detectLoop(lm, token));
    if (phaseRef.current !== "playing") return;
    const video = videoRef.current;
    if (video && video.readyState >= 2) {
      const now = performance.now();
      try {
        const res = lm.detectForVideo(video, now);
        const hasHand = res.landmarks.length > 0;
        if (handSeenRef.current !== hasHand) {
          handSeenRef.current = hasHand;
          setHandSeen(hasHand);
        }
        if (hasHand) {
          const open = extendedFingers2d(res.landmarks[0]);
          if (open < 0) return;
          // 张开度滞回：≥3 定向 ✋ 停，≤1 定向 ✊ 行
          const cur = handStateRef.current;
          let cmd: Cmd | null = null;
          if (open >= 3) cmd = "stop";
          else if (open <= 1) cmd = "go";
          else cmd = cur; // 中间态维持上次
          if (handStateRef.current !== cmd) {
            handStateRef.current = cmd;
            setHandState(cmd);
            answerSinceRef.current = null;
          } else if (cmd && !answeredRef.current && !lockedRef.current) {
            if (answerSinceRef.current === null) answerSinceRef.current = now;
            else if (now - answerSinceRef.current >= HOLD_MS) {
              answerSinceRef.current = null;
              submit(cmd);
            }
          } else {
            answerSinceRef.current = null;
          }
        } else {
          handStateRef.current = null;
          setHandState(null);
          answerSinceRef.current = null;
        }
      } catch (e) {
        console.warn("[traffic-commander] 识别帧异常", e);
      }
    }
  }

  function submit(cmd: Cmd) {
    if (answeredRef.current || lockedRef.current) return;
    const sc = scenariosRef.current[roundRef.current];
    if (!sc) return;
    answeredRef.current = true;
    lockedRef.current = true;
    const correct = (sc.light === "red" && cmd === "stop") || (sc.light === "green" && cmd === "go");
    resultsRef.current.push({ itemKey: sc.itemKey, label: sc.label, correct });
    if (correct) {
      setCorrectCount((c) => {
        const n = c + 1;
        return n;
      });
      setResult("ok");
      const text = sc.light === "red"
        ? "红灯亮起，小手一拦，车停下了！真棒！"
        : "绿灯通行，小汽车安全过马路！真棒！";
      void speak(text, "xiaoyi", EXCITED_TONE);
    } else {
      setResult("wrong");
      setWrongFlash(true);
      setCarShake((n) => n + 1);
      const text = sc.light === "red"
        ? "红灯不能放行！要张开手掌拦住小汽车哦"
        : "绿灯不能拦停！收拳放行，车都排成长龙啦";
      void speak(text, "xiaoyi", SORRY_TONE);
    }
    setTimeout(() => advance(), correct ? 2000 : 2600);
  }

  function advance() {
    const next = roundRef.current + 1;
    if (next >= scenariosRef.current.length) {
      setPhase("done");
      phaseRef.current = "done";
      const n = resultsRef.current.filter((r) => r.correct).length;
      speak(n >= 6 ? `答对 ${n} 题，你是金牌交通指挥！` : `答对 ${n} 题，下次继续加油！`, "xiaoyi", n >= 6 ? EXCITED_TONE : SORRY_TONE);
    } else {
      roundRef.current = next;
      setRound(next);
      setResult(null);
      setWrongFlash(false);
      answeredRef.current = false;
      lockedRef.current = false;
      answerSinceRef.current = null;
      handStateRef.current = null;
      setHandState(null);
      const sc = scenariosRef.current[next];
      speak(sc.light === "red" ? "红灯亮起！" : "绿灯亮起！", "xiaoyi");
    }
  }

  const sc = scenarios[round];
  const cmdFor = (cmd: Cmd) => cmd === "stop" ? "✋ 停" : "✊ 行";
  const showPreview = mode === "camera" && phase === "playing";

  return (
    <div className="max-w-2xl mx-auto">
      {(phase === "intro" || phase === "loading") && (
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 text-center" style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}>
            <div className="text-5xl">🚦</div>
            <p className="text-2xl font-black mt-2" style={{ color: "var(--animal-text-color)" }}>
              交通指挥官
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
              你是路口小交警：<b>✋ 张开手掌</b> 拦住小汽车（红灯停），<b>✊ 握拳</b> 放行（绿灯行）！
            </p>
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            <Button type="primary" size="large" loading={phase === "loading"} onClick={() => start("camera")} className="mt-5 w-full">
              📷 当交警（摄像头）
            </Button>
            <Button size="large" disabled={phase === "loading"} onClick={() => start("buttons")} className="mt-3 w-full">
              🖱 点按钮指挥
            </Button>
          </div>
        </div>
      )}

      {phase === "playing" && (
        <div>
          {/* 顶栏 */}
          <div className="flex items-center gap-3">
            <Button size="small" type="text" onClick={() => setPhase("done")}>结束</Button>
            <span className="text-sm font-bold" style={{ color: "var(--animal-text-color)" }}>
              第 {Math.min(round + 1, ROUNDS)}/{ROUNDS} 次指挥
            </span>
            <span className="text-sm font-bold" style={{ color: "var(--animal-primary-color)" }}>
              正确 {correctCount}
            </span>
            <div className="flex-1" />
            <button className="text-lg" onClick={() => setVoiceMuted(!voiceMuted)} aria-label={voiceMuted ? "开启语音" : "关闭语音"}>
              {voiceMuted ? "🔇" : "🔊"}
            </button>
          </div>

          {sc && (
            <div className="mt-4 bg-white rounded-[32px] p-5 sm:p-7 text-center" style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.14)" }}>
              {/* 红绿灯 */}
              <div className="text-6xl" role="img" aria-label={sc.label}>
                {sc.light === "red" ? "🔴" : "🟢"}
              </div>
              <p className="text-xl font-black mt-2" style={{ color: sc.light === "red" ? "#e03030" : "#2e9e4f" }}>
                {sc.label}亮起！
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                {sc.light === "red" ? "小汽车开过来了，快用交通手势" : "可以过马路了，指挥小汽车"}
              </p>

              {/* 小汽车 */}
              <div
                key={carShake}
                className={`text-6xl mt-4 transition-transform ${result === "wrong" ? "animate-bounce" : ""}`}
                style={{ animation: result === "wrong" ? "tc-shake 0.5s ease" : undefined }}
              >
                {result === "ok" ? (sc.light === "green" ? "🚗💨" : "🚗") : "🚗"}
              </div>

              {/* 判定反馈 */}
              {result === "ok" && <ResultBanner color="#5cb85c">✅ 做得对！</ResultBanner>}
              {result === "wrong" && <ResultBanner color="#f4736f">🚨 错了！</ResultBanner>}

              {/* 手势状态 */}
              <div className="mt-4 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
                {mode === "camera" ? (
                  handState ? (
                    <span className="font-bold" style={{ color: "var(--animal-primary-color)" }}>
                      看到 {cmdFor(handState)} {answerSinceRef.current ? "，保持住…" : "，保持 0.6 秒发令"}
                    </span>
                  ) : handSeen ? (
                    "看到手手了！张开✋停 / 收拳✊行"
                  ) : (
                    "手没进镜头：把手举到摄像头前做手势"
                  )
                ) : (
                  "点下面的按钮发令"
                )}
              </div>
            </div>
          )}

          {/* 无摄像头：按钮 */}
          {mode === "buttons" && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                disabled={lockedRef.current}
                onClick={() => submit("stop")}
                className="rounded-2xl py-4 text-xl font-black text-white disabled:opacity-50"
                style={{ background: "#e05c5c", boxShadow: "0 4px 0 #b34040" }}
              >
                ✋ 停
              </button>
              <button
                disabled={lockedRef.current}
                onClick={() => submit("go")}
                className="rounded-2xl py-4 text-xl font-black text-white disabled:opacity-50"
                style={{ background: "#2e9e4f", boxShadow: "0 4px 0 #23793c" }}
              >
                ✊ 行
              </button>
            </div>
          )}

          {/* 手势图例 */}
          <div className="mt-4 grid grid-cols-2 gap-3 text-center">
            <div className="bg-white rounded-2xl border-2 p-3" style={{ borderColor: "var(--animal-border-color-light)" }}>
              <div className="text-3xl">✋</div>
              <p className="text-xs font-bold mt-1" style={{ color: "var(--animal-text-color)" }}>张开手掌 = 停</p>
              <p className="text-[11px]" style={{ color: "var(--animal-text-color-secondary)" }}>红灯亮时拦车</p>
            </div>
            <div className="bg-white rounded-2xl border-2 p-3" style={{ borderColor: "var(--animal-border-color-light)" }}>
              <div className="text-3xl">✊</div>
              <p className="text-xs font-bold mt-1" style={{ color: "var(--animal-text-color)" }}>握拳 = 行</p>
              <p className="text-[11px]" style={{ color: "var(--animal-text-color-secondary)" }}>绿灯亮时放行</p>
            </div>
          </div>



          <style>{`@keyframes tc-shake { 0%{transform:translateX(0)} 25%{transform:translateX(-10px)} 50%{transform:translateX(10px)} 75%{transform:translateX(-6px)} 100%{transform:translateX(0)} }`}</style>
        </div>
      )}

      {phase === "done" && (
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 text-center" style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}>
            <div className="text-5xl">🏅</div>
            <p className="text-2xl font-black mt-2" style={{ color: "var(--animal-text-color)" }}>
              答对 {correctCount} / {ROUNDS}
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
              {correctCount >= 6 ? "红灯停绿灯行，全都记住了，上路小能手！" : "交警上岗多练几次就熟练啦！"}
            </p>
            <div className="flex gap-3 mt-6">
              <Button type="primary" size="large" onClick={() => start(mode)} className="flex-1">
                再当一次交警
              </Button>
              <Button size="large" onClick={() => router.push("/garden/games")} className="flex-1">
                返回游戏
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* 摄像头检测/预览：常驻挂载（在阶段条件之外），避免开始时 videoRef 为空 */}
      <div
        className={`relative mx-auto mt-4 w-full max-w-lg overflow-hidden rounded-3xl border-4 bg-black/60 ${showPreview ? "block" : "hidden"}`}
        style={{ borderColor: "var(--animal-border-color-light)" }}
      >
        <video ref={videoRef} playsInline muted className="block w-full" style={{ transform: "scaleX(-1)" }} />
      </div>
    </div>
  );
}

function ResultBanner({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 text-center">
      <span className="inline-block px-6 py-2.5 rounded-full text-white font-bold text-xl" style={{ background: color, boxShadow: "0 6px 16px rgba(61,52,40,0.25)" }}>
        {children}
      </span>
    </div>
  );
}
