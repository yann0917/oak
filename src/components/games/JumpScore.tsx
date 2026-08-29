"use client";

// 跳跃小达人：用 PoseLandmarker 监测臀部高度，跳起一下记一分、30 秒一轮。
// 计分要点：取最近 1.3 秒窗口的臀部高度中位数当"站立基线"（抗镜头移动），
// 低于基线 10%（归一化）判起跳，回到基线附近才重新布防——这样蹲一下也不会误计分。
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "animal-island-ui";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { EXCITED_TONE, speak, useVoiceMuted } from "@/lib/garden/speech";
import {
  describeGameError,
  drawPoseSkeleton,
  getPoseLandmarker,
  openCamera,
} from "@/lib/games/mediapipe";
import { toast } from "@/lib/toast";

const GAME_SECONDS = 30;
const JUMP_THRESHOLD = 0.1; // 相对站立基线的最低跳起高度（归一化）
const WINDOW_SIZE = 40; // 约 1.3 秒
const MIN_JUMP_INTERVAL = 350; // 相邻两次起跳至少间隔

type Phase = "intro" | "loading" | "playing" | "done";

export default function JumpScore() {
  const router = useRouter();
  const { currentChild } = useChildren();
  const [voiceMuted, setVoiceMuted] = useVoiceMuted();

  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState("");
  const [jumps, setJumps] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [bodySeen, setBodySeen] = useState(false);
  const [power, setPower] = useState(0); // 当前起跳高度（0~1，用于进度条反馈）
  const [doneJumps, setDoneJumps] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skelRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const phaseRef = useRef<Phase>("intro");
  const startAtRef = useRef(0);
  const loopTokenRef = useRef(0);
  const jumpsRef = useRef(0);
  const lastJumpAtRef = useRef(0);
  const armedRef = useRef(true);
  const hipWindowRef = useRef<number[]>([]);
  const lastMilestoneRef = useRef(0);
  const savedRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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
    if (jumpsRef.current === 0) return;
    savedRef.current = true;
    api("/api/garden-records", {
      method: "POST",
      body: JSON.stringify({
        childId: currentChild.id,
        activity: "jump-score",
        difficulty: "简单",
        durationSec: GAME_SECONDS,
        results: [
          {
            itemKey: "js:round",
            label: `跳跃 ${jumpsRef.current} 次`,
            correct: true,
          },
        ],
      }),
    }).catch(() => {});
     
  }, [phase, currentChild]);

  function finishRound() {
    if (phaseRef.current !== "playing") return;
    setDoneJumps(jumpsRef.current);
    setPhase("done");
    const n = jumpsRef.current;
    speak(n >= 25 ? `哇！一共跳了 ${n} 下，冠军就是你了！` : `一共跳了 ${n} 下，真棒！`, "xiaoyi", EXCITED_TONE);
  }

  // 30 秒倒计时
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      const left = Math.max(
        0,
        GAME_SECONDS - Math.floor((performance.now() - startAtRef.current) / 1000)
      );
      setTimeLeft(left);
      if (left <= 0) finishRound();
    }, 250);
    return () => window.clearInterval(timer);
     
  }, [phase]);

  const start = async () => {
    if (phase === "loading") return;
    setPhase("loading");
    setError("");
    try {
      const landmarker = await getPoseLandmarker();
      stopStream();
      const video = videoRef.current!;
      const stream = await openCamera(video);
      streamRef.current = stream;
      await new Promise<void>((res) => {
        if (video.readyState >= 2) return res();
        video.onloadeddata = () => res();
      });
      jumpsRef.current = 0;
      savedRef.current = false;
      lastJumpAtRef.current = 0;
      armedRef.current = true;
      hipWindowRef.current = [];
      lastMilestoneRef.current = 0;
      setJumps(0);
      setDoneJumps(0);
      const token = ++loopTokenRef.current;
      phaseRef.current = "playing";
      setPhase("playing");
      startAtRef.current = performance.now();
      rafRef.current = requestAnimationFrame(() => detectLoop(landmarker, token));
      speak("准备！跳起来吧！", "xiaoyi", EXCITED_TONE);
    } catch (e) {
      toast(describeGameError(e), "warning");
      setError(describeGameError(e));
      setPhase("intro");
    }
     
  };

  const bodySeenRef = useRef(false);
  const lastPowerRef = useRef(0);

  function detectLoop(landmarker: Awaited<ReturnType<typeof getPoseLandmarker>>, token: number) {
    // 先续帧再判断：第一帧若在 React 提交前触发，旧写法会"返回即死"
    if (token !== loopTokenRef.current) return;
    rafRef.current = requestAnimationFrame(() => detectLoop(landmarker, token));
    if (phaseRef.current !== "playing") return;
    const video = videoRef.current;
    const now = performance.now();
    if (video && video.readyState >= 2) {
      const res = landmarker.detectForVideo(video, now);
      const lm: NormalizedLandmark[] | undefined = res.landmarks?.[0];
      const canvas = skelRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        if (lm && lm.length >= 33) {
          drawPoseSkeleton(
            ctx,
            lm as unknown as { x: number; y: number }[],
            canvas.clientWidth,
            canvas.clientHeight
          );
        }
      }
      if (lm && lm.length >= 33) {
        if (!bodySeenRef.current) {
          bodySeenRef.current = true;
          setBodySeen(true);
        }
        const hipY = (lm[23].y + lm[24].y) / 2; // 两髋平均（镜像不影响 y）
        const win = hipWindowRef.current;
        win.push(hipY);
        if (win.length > WINDOW_SIZE) win.shift();
        const base = medianOf(win);
        const delta = Math.max(0, base - hipY);
        const p = Math.min(1, delta / (JUMP_THRESHOLD * 1.5));
        if (Math.abs(p - lastPowerRef.current) > 0.03) {
          lastPowerRef.current = p;
          setPower(p);
        }

        if (
          delta > JUMP_THRESHOLD &&
          armedRef.current &&
          now - lastJumpAtRef.current > MIN_JUMP_INTERVAL
        ) {
          armedRef.current = false;
          lastJumpAtRef.current = now;
          countJump();
        } else if (delta < JUMP_THRESHOLD * 0.45) {
          armedRef.current = true; // 落回站姿才重新布防
        }
      } else {
        if (bodySeenRef.current) {
          bodySeenRef.current = false;
          setBodySeen(false);
        }
        hipWindowRef.current = [];
        armedRef.current = true;
        if (lastPowerRef.current !== 0) {
          lastPowerRef.current = 0;
          setPower(0);
        }
      }
    }
  }

  function countJump() {
    jumpsRef.current++;
    setJumps(jumpsRef.current);
    // 每 5 下喊一次里程碑，不打断节奏
    const n = jumpsRef.current;
    if (n % 5 === 0 && n !== lastMilestoneRef.current) {
      lastMilestoneRef.current = n;
      speak(`真棒，已经跳了 ${n} 下啦！`, "xiaoyi", EXCITED_TONE);
    }
  }

  const showPreview = phase === "playing";
  const stars = doneJumps >= 25 ? 3 : doneJumps >= 15 ? 2 : doneJumps >= 6 ? 1 : 0;

  return (
    <div>
      {(phase === "intro" || phase === "loading") && (
        <div className="max-w-lg mx-auto">
          <div
            className="bg-white rounded-[32px] p-6 sm:p-8 text-center"
            style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}
          >
            <div className="text-5xl">🦘</div>
            <p className="text-2xl font-black mt-2" style={{ color: "var(--animal-text-color)" }}>
              跳跃小达人
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
              对着镜头原地跳，跳一下计一分，30 秒看你能跳多少！
            </p>
            <div className="mt-4 text-sm space-y-1" style={{ color: "var(--animal-text-color-secondary)" }}>
              <p>🏃 站在能照到全身的位置</p>
              <p>🙋 会看到自己的影子骨架，起跳就会加分</p>
              <p>🚫 蹲下不计分，要真的跳起来才作数</p>
            </div>
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            <Button type="primary" size="large" loading={phase === "loading"} onClick={start} className="mt-5 w-full">
              📷 开始跳
            </Button>
          </div>
        </div>
      )}

      {phase === "playing" && (
        <div>
          <div className="flex items-center gap-3">
            <Button size="small" type="text" onClick={() => setPhase("done")}>
              结束
            </Button>
            <span className="text-sm font-bold" style={{ color: "var(--animal-text-color)" }}>
              跳了 <span className="text-lg text-orange-500">{jumps}</span> 下
            </span>
            <div className="flex-1" />
            <button className="text-lg" onClick={() => setVoiceMuted(!voiceMuted)} aria-label={voiceMuted ? "开启语音" : "关闭语音"}>
              {voiceMuted ? "🔇" : "🔊"}
            </button>
            <span className="px-3 py-1 rounded-full bg-white border-2 font-bold text-sm" style={{ borderColor: "var(--animal-border-color-light)" }}>
              ⏱ {timeLeft}s
            </span>
          </div>

          {/* 大计分牌 */}
          <div className="mt-4 bg-gradient-to-b from-orange-50 to-amber-50 rounded-[32px] py-8 text-center" style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.14)" }}>
            <div
              key={jumps}
              className="text-8xl font-black"
              style={{
                color: "var(--animal-primary-color)",
                animation: "jump-score-pop 0.3s ease",
              }}
            >
              {jumps}
            </div>
            <p className="text-sm mt-1 font-bold" style={{ color: "var(--animal-text-color-secondary)" }}>
              {bodySeen ? "跳呀跳，再快一点！" : "没有看到人影，站到镜头前试一试"}
            </p>
            {/* 起跳高度条 */}
            <div className="mx-auto mt-4 max-w-64 h-4 rounded-full bg-orange-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-orange-400 transition-all duration-100"
                style={{ width: `${Math.round(power * 100)}%` }}
              />
            </div>
            <p className="text-xs mt-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              起跳高度（越高分越快）
            </p>
          </div>

          {/* 摄像头骨架预览（镜像）—— 单一 video 元素常驻挂载，见页面底部 */}
        </div>
      )}

      {phase === "done" && (
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 text-center" style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}>
            <div className="text-4xl tracking-widest">
              {"⭐".repeat(stars)}
              <span style={{ opacity: 0.25 }}>{"⭐".repeat(3 - stars)}</span>
            </div>
            <p className="text-2xl font-black mt-2" style={{ color: "var(--animal-text-color)" }}>
              {doneJumps} 下！
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
              {doneJumps >= 25
                ? "一跳一跳小冠军，体力满满！"
                : doneJumps >= 15
                  ? "跳得真不错，再冲一冲满分！"
                  : doneJumps >= 6
                    ? "有运动啦，明天继续跳！"
                    : "热身完毕，下次跳得更高！"}
            </p>
            <div className="flex gap-3 mt-6">
              <Button type="primary" size="large" onClick={start} className="flex-1">
                再跳一轮
              </Button>
              <Button size="large" onClick={() => router.push("/garden/games")} className="flex-1">
                返回游戏
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 摄像头检测/预览（镜像 + 骨架）：常驻挂载，避免启动流程里 videoRef 取不到 */}
      <div
        className={`relative mx-auto mt-4 max-w-md overflow-hidden rounded-3xl border-4 bg-black/60 ${
          showPreview ? "block" : "hidden"
        }`}
        style={{ borderColor: "var(--animal-border-color-light)" }}
      >
        <video ref={videoRef} playsInline muted className="block w-full" style={{ transform: "scaleX(-1)" }} />
        <canvas ref={skelRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      </div>

      <style>{`
        @keyframes jump-score-pop {
          0% { transform: scale(1.6); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

/** 中位数（窗口已排序存储时用这个） */
function medianOf(arr: number[]): number {
  if (arr.length === 0) return 0.5;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
