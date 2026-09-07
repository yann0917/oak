"use client";

// 跳跃小达人：PoseLandmarker 监测臀部高度，跳起一下记一分、30 秒一轮。
// 计分要点：臀部高度先低通（压关键点抖动），再相对"站立基线"抬升超过身高比例 12% 判起跳；
// 基线用 EMA 平滑且起跳期间锁定不更新（防止连续跳时被空中样本污染抬升），
// 阈值按肩踝距离归一化（远近镜头、孩子高矮都不影响）；蹲下/前后晃不满足抬升条件，不误计分。
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "animal-island-ui";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { EXCITED_TONE, speak, useVoiceMuted } from "@/lib/garden/speech";
import {
  describeGameError,
  dist2d,
  drawPoseSkeleton,
  getPoseLandmarker,
  lowPass,
  openCamera,
} from "@/lib/games/mediapipe";
import type { PointLike } from "@/lib/games/mediapipe";
import { toast } from "@/lib/toast";
import {
  BASE_ALPHA,
  GAME_SECONDS,
  HIP_SMOOTH_ALPHA,
  judgeJumpFrame,
} from "@/lib/games/jumpJudge";

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
  const [power, setPower] = useState(0); // 当前起跳高度（0~1，高度条反馈）
  const [doneJumps, setDoneJumps] = useState(0);

  const fieldRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const phaseRef = useRef<Phase>("intro");
  const startAtRef = useRef(0);
  const loopTokenRef = useRef(0);
  const jumpsRef = useRef(0);
  const lastJumpAtRef = useRef(0);
  const armedRef = useRef(true);
  const baseRef = useRef<number | null>(null); // 站立基线（EMA）
  const baseAnkleRef = useRef<number | null>(null); // 踝部站立基线（EMA）
  const lastHipRef = useRef<PointLike | null>(null);
  const lastAnkleRef = useRef<PointLike | null>(null);
  const lastMilestoneRef = useRef(0);
  const lastPowerRef = useRef(0);
  const bodySeenRef = useRef(false);
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
      baseRef.current = null;
      baseAnkleRef.current = null;
      lastHipRef.current = null;
      lastAnkleRef.current = null;
      lastMilestoneRef.current = 0;
      bodySeenRef.current = false;
      setJumps(0);
      setDoneJumps(0);
      setBodySeen(false);
      setPower(0);
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
      draw(video);
      judgeJump(lm, now);
    }
  }

  /** 视频铺满全屏（镜像）并压暗，供骨架/计分叠加 */
  function draw(video: HTMLVideoElement) {
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    if (!canvas || !field) return;
    const ctx = canvas.getContext("2d")!;
    const w = field.clientWidth;
    const h = field.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (video.readyState >= 2) {
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const s = Math.max(w / vw, h / vh);
      const dw = vw * s;
      const dh = vh * s;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(-1, 1);
      ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.restore();
      // 压暗画面，让骨架与 HUD 更醒目
      ctx.fillStyle = "rgba(20,40,80,0.35)";
      ctx.fillRect(0, 0, w, h);
    }
  }

  function judgeJump(lm: NormalizedLandmark[] | undefined, now: number) {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d")!;
      if (lm && lm.length >= 33) {
        drawPoseSkeleton(
          ctx,
          lm as unknown as { x: number; y: number }[],
          canvas.clientWidth,
          canvas.clientHeight
        );
      }
    }

    if (!lm || lm.length < 33) {
      if (bodySeenRef.current) {
        bodySeenRef.current = false;
        setBodySeen(false);
      }
      baseRef.current = null; // 人走了，下次出现重新取基线
      lastHipRef.current = null;
      baseAnkleRef.current = null;
      lastAnkleRef.current = null;
      armedRef.current = true;
      if (lastPowerRef.current !== 0) {
        lastPowerRef.current = 0;
        setPower(0);
      }
      return;
    }

    if (!bodySeenRef.current) {
      bodySeenRef.current = true;
      setBodySeen(true);
    }
    // 两髋平均与双踝平均（镜像不影响 y），低通压关键点抖动；
    // 踝约束保证"双脚离地才算跳"——拍手/踏步/蹲起时脚不动，不被误计分
    const hipY = (lm[23].y + lm[24].y) / 2;
    const ankleY = (lm[27].y + lm[28].y) / 2;
    const smoothHip = lowPass(lastHipRef.current, { x: 0, y: hipY }, HIP_SMOOTH_ALPHA).y;
    const smoothAnkle = lowPass(lastAnkleRef.current, { x: 0, y: ankleY }, HIP_SMOOTH_ALPHA).y;
    lastHipRef.current = { x: 0, y: smoothHip };
    lastAnkleRef.current = { x: 0, y: smoothAnkle };
    // 肩→踝距离当"身高"度量（跳起时全身一起动，这个值基本不变），阈值据此归一化
    const height = Math.abs((lm[11].y + lm[12].y) / 2 - (lm[27].y + lm[28].y) / 2) || 0.01;

    const out = judgeJumpFrame({
      hipY: smoothHip,
      ankleY: smoothAnkle,
      height,
      base: baseRef.current,
      baseAnkle: baseAnkleRef.current,
      // 踝不可见（出框/遮挡/运动模糊）时放行踝约束，避免真跳全盘失效
      ankleVisible: (lm[27].visibility ?? 1) > 0.35 && (lm[28].visibility ?? 1) > 0.35,
      // 拍手态势：双腕在肩线附近互相靠近（拍打的特征在手，比踝更可靠）
      handsClapping:
        dist2d(lm[15], lm[16]) < 0.2 && (lm[15].y < lm[11].y + 0.12 || lm[16].y < lm[12].y + 0.12),
      armed: armedRef.current,
      lastJumpAt: lastJumpAtRef.current,
      now,
    });
    baseRef.current = out.base;
    baseAnkleRef.current = out.baseAnkle;
    armedRef.current = out.armed;
    lastJumpAtRef.current = out.lastJumpAt;
    if (Math.abs(out.power - lastPowerRef.current) > 0.03) {
      lastPowerRef.current = out.power;
      setPower(out.power);
    }
    if (out.jumped) countJump();
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

  const stars = doneJumps >= 25 ? 3 : doneJumps >= 15 ? 2 : doneJumps >= 6 ? 1 : 0;

  // ---------- 渲染（与点泡泡同款"全屏视频屏幕"布局） ----------

  return (
    <div className="fixed inset-0 z-50 bg-[#2364aa] overflow-hidden">
      {/* 检测视频常驻挂载 */}
      <video ref={videoRef} playsInline muted className="hidden" />

      <div
        ref={fieldRef}
        className="absolute inset-0"
        style={{ touchAction: "none" }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>

      {/* HUD */}
      {phase === "playing" && (
        <>
          {/* 顶栏 */}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4 pt-3 select-none pointer-events-none">
            <div className="pointer-events-auto flex flex-col gap-2">
              <Pill onClick={() => finishRound()}>结束</Pill>
              <Pill onClick={() => setVoiceMuted(!voiceMuted)} ariaLabel={voiceMuted ? "开启语音" : "关闭语音"}>
                {voiceMuted ? "🔇" : "🔊"}
              </Pill>
            </div>
            <div className="pointer-events-auto text-right space-y-2">
              <Pill>⏱ {timeLeft}s</Pill>
              <p className="text-xs font-bold text-white/95 bg-black/30 rounded-xl px-3 py-1.5 max-w-44 ml-auto">
                {bodySeen ? "跳呀跳，再快一点！" : "没有看到人影，站到镜头前试一试"}
              </p>
            </div>
          </div>
          {/* 中央大数字区：约占 2/3 屏高，居中放置 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center select-none pointer-events-none" style={{ paddingBottom: "8vh" }}>
            <div
              key={jumps}
              className="font-black text-white drop-shadow-[0_6px_12px_rgba(0,0,0,0.45)] leading-none whitespace-nowrap"
              style={{ fontSize: "min(82vh, 45vw)", animation: "js-pop 0.3s ease" }}
            >
              {jumps}
            </div>
            <div className="text-sm sm:text-base font-bold text-white/85 mt-4">跳了这么多次</div>
            {/* 起跳高度条 */}
            <div className="mt-3 w-52 h-3 rounded-full bg-white/25 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-300 transition-all duration-100"
                style={{ width: `${Math.round(power * 100)}%` }}
              />
            </div>
            <p className="text-xs mt-1.5 text-white/70">起跳高度</p>
          </div>
        </>
      )}

      {/* 开始 */}
      {(phase === "intro" || phase === "loading") && (
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-gradient-to-b from-[#1d5c96] via-[#2e75c4] to-[#7fb7e8]">
          <div
            className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-md max-h-full overflow-y-auto"
            style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="text-5xl">🦘</div>
              <div>
                <p className="text-2xl font-black text-gray-800">跳跃小达人</p>
                <p className="text-sm text-gray-500 mt-1">
                  对着镜头原地跳，跳一下计一分，30 秒看你能跳多少！
                </p>
              </div>
              <div className="text-sm space-y-1 text-gray-500">
                <p>🏃 站在能照到全身的位置，退后一点</p>
                <p>🙋 会看到全身骨架，真的跳起来才能加分</p>
                <p>🚫 蹲下、晃一晃都不计分，要双脚离地</p>
              </div>
              {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
              <Button type="primary" size="large" loading={phase === "loading"} onClick={start} className="mt-5 w-full">
                📷 开始跳
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 结算 */}
      {phase === "done" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/45">
          <div
            className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-md text-center"
            style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.3)" }}
          >
            <div className="text-4xl tracking-widest">
              {"⭐".repeat(stars)}
              <span style={{ opacity: 0.25 }}>{"⭐".repeat(3 - stars)}</span>
            </div>
            <p className="text-2xl font-black mt-2 text-gray-800">{doneJumps} 下！</p>
            <p className="text-sm mt-1 text-gray-500">
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

      <style>{`
        @keyframes js-pop {
          0% { transform: scale(1.5); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function Pill({
  children,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      className={`px-3.5 h-9 rounded-full bg-white/90 border-2 border-[#e8dcc8] flex items-center text-sm font-bold text-gray-700 select-none ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      {children}
    </div>
  );
}
