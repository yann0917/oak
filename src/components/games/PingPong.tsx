"use client";

// 乒乓球接球：手掌（掌心 = 中指根部关键点 9）就是球拍，别让球掉地上。
// 核心循环：重力 + 墙面反弹 + 下落碰到拍面（水平距离判定）= 弹起；
// 挥拍速度会给球加横向速度，连击越多球越快、拍子越小。60 秒冲高连击。
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "animal-island-ui";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { EXCITED_TONE, SORRY_TONE, speak, useVoiceMuted } from "@/lib/garden/speech";
import {
  describeGameError,
  drawHandSkeleton,
  getHandLandmarker,
  lowPass,
  openCamera,
} from "@/lib/games/mediapipe";
import type { PointLike } from "@/lib/games/mediapipe";
import { toast } from "@/lib/toast";
import { formatDuration } from "@/lib/garden/types";

const GAME_SECONDS = 60;
const HEARTS = 3;
const GRAVITY = 980; // px/s²（无缩放，画布自适应时手感一致）

type Phase = "intro" | "loading" | "playing" | "done";
type InputMode = "camera" | "mouse";

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dead: boolean; // 掉地后短暂消失再重生
  resetAt: number;
}

export default function PingPong() {
  const router = useRouter();
  const { currentChild } = useChildren();
  const [voiceMuted, setVoiceMuted] = useVoiceMuted();

  const [phase, setPhase] = useState<Phase>("intro");
  const [mode, setMode] = useState<InputMode | null>(null);
  const [error, setError] = useState("");
  const [hits, setHits] = useState(0);
  const [hearts, setHearts] = useState(HEARTS);
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [handSeen, setHandSeen] = useState(false);
  const [doneHits, setDoneHits] = useState(0);

  const fieldRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const loopTokenRef = useRef(0);

  const phaseRef = useRef<Phase>("intro");
  const modeRef = useRef<InputMode | null>(null);
  const lastNowRef = useRef(0);
  const lastSmoothRef = useRef<PointLike | null>(null);
  const handRef = useRef<PointLike[] | null>(null);
  const handVisibleRef = useRef(false);
  const cursorRef = useRef({ x: -100, y: -100 });
  const paddleXRef = useRef(-100);
  const paddleVelRef = useRef(0);
  const paddleLastRef = useRef<{ x: number; t: number } | null>(null);
  const ballRef = useRef<Ball>({ x: 0.5, y: 0.25, vx: 0, vy: 0, dead: false, resetAt: 0 });
  const trailRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const hitsRef = useRef(0);
  const heartsRef = useRef(HEARTS);
  const startAtRef = useRef(0);
  const savedRef = useRef(false);
  const milestoneRef = useRef(0);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => () => cleanup(), []);
  useEffect(() => {
    if (phase !== "done" || !currentChild || savedRef.current) return;
    if (hitsRef.current === 0) return;
    savedRef.current = true;
    api("/api/garden-records", {
      method: "POST",
      body: JSON.stringify({
        childId: currentChild.id,
        activity: "ping-pong",
        difficulty: "简单",
        durationSec: GAME_SECONDS,
        results: [
          { itemKey: "pp:round", label: `接住小球 ${hitsRef.current} 次`, correct: true },
        ],
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

  function beep(freq: number, dur = 0.06) {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.08;
      osc.frequency.value = freq;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
      osc.onended = () => ctx.close();
    } catch {
      // 环境不支持就静默
    }
  }

  function finishRound() {
    if (phaseRef.current !== "playing") return;
    setDoneHits(hitsRef.current);
    setPhase("done");
    phaseRef.current = "done";
    speak(
      hitsRef.current >= 30 ? `哇！接住了 ${hitsRef.current} 个球，乒乓球冠军就是你！` : `一共接了 ${hitsRef.current} 个球，真不错！`,
      "xiaoyi",
      hitsRef.current >= 30 ? EXCITED_TONE : undefined
    );
  }

  const start = async (m: InputMode) => {
    setMode(m);
    setPhase("loading");
    setError("");
    try {
      const landmarker = await getHandLandmarker();
      if (m === "camera") {
        stopStream();
        const video = videoRef.current!;
        const stream = await openCamera(video);
        streamRef.current = stream;
        await new Promise<void>((res) => {
          if (video.readyState >= 2) return res();
          video.onloadeddata = () => res();
        });
      }
      hitsRef.current = 0;
      heartsRef.current = HEARTS;
      milestoneRef.current = 0;
      savedRef.current = false;
      ballRef.current = spawnBall();
      trailRef.current = [];
      setHits(0);
      setHearts(HEARTS);
      setTimeLeft(GAME_SECONDS);
      setHandSeen(false);
      setPhase("playing");
      const token = ++loopTokenRef.current;
      phaseRef.current = "playing";
      startAtRef.current = performance.now();
      rafRef.current = requestAnimationFrame((t) => loop(t, landmarker, token));
      speak("手掌横着当球拍，别让小乒乓球掉地上！", "xiaoyi");
    } catch (e) {
      if (m === "camera") {
        toast(describeGameError(e), "warning");
        start("mouse");
      } else {
        setError(describeGameError(e));
        setPhase("intro");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  };

  function spawnBall(): Ball {
    return { x: 0.5, y: 0.18, vx: (Math.random() < 0.5 ? -1 : 1) * 90, vy: 40, dead: false, resetAt: 0 };
  }

  // 60 秒倒计时
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      const left = Math.max(0, GAME_SECONDS - Math.floor((performance.now() - startAtRef.current) / 1000));
      setTimeLeft(left);
      if (left <= 0) finishRound();
    }, 250);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---------- 主循环 ----------

  function loop(now: number, landmarker: Awaited<ReturnType<typeof getHandLandmarker>>, token: number) {
    if (token !== loopTokenRef.current) return;
    rafRef.current = requestAnimationFrame((t) => loop(t, landmarker, token));
    if (phaseRef.current !== "playing") return;
    const dt = Math.min(0.05, (now - lastNowRef.current) / 1000 || 0.016);
    lastNowRef.current = now;

    const canvas = canvasRef.current;
    const field = fieldRef.current;
    const video = videoRef.current;
    if (!canvas || !field) return;
    const ctx = canvas.getContext("2d")!;
    ctxRef.current = ctx;
    const w = field.clientWidth;
    const h = field.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 手掌 → 球拍位置（掌心 = 中指根部关键点 9）
    if (modeRef.current === "camera" && video && video.readyState >= 2) {
      try {
        const res = landmarker.detectForVideo(video, now);
        if (res.landmarks.length > 0) {
          const palm = res.landmarks[0][9];
          const smooth = lowPass(lastSmoothRef.current, palm, 0.4);
          lastSmoothRef.current = smooth;
          const vw = video.videoWidth || 1280;
          const vh = video.videoHeight || 720;
          const s = Math.max(w / vw, h / vh);
          const dw = vw * s;
          const dh = vh * s;
          cursorRef.current = {
            x: w - ((w - dw) / 2 + smooth.x * dw),
            y: (h - dh) / 2 + smooth.y * dh,
          };
          handRef.current = res.landmarks[0];
          if (!handVisibleRef.current) {
            handVisibleRef.current = true;
            setHandSeen(true); // 相同值时 React 自动跳过重渲染
          }
        } else {
          handVisibleRef.current = false;
          lastSmoothRef.current = null;
          handRef.current = null;
          setHandSeen(false);
        }
      } catch (e) {
        console.warn("[ping-pong] 识别帧异常", e);
      }
    }

    update(now, dt, w, h);
    draw(ctx, w, h, now, video);
  }
  function update(now: number, dt: number, w: number, h: number) {
    const t = now / 1000;
    const paddleY = h * 0.84;
    const ballR = Math.max(10, Math.min(16, Math.min(w, h) * 0.022));

    // 球拍位置与速度（挥拍速度给球加横向）
    const px = cursorRef.current.x;
    const prev = paddleLastRef.current;
    if (prev) {
      const dv = (px - prev.x) / Math.max(0.008, (now - prev.t) / 1000);
      paddleVelRef.current = paddleVelRef.current * 0.8 + dv * 0.2;
    }
    paddleLastRef.current = { x: px, t: now };
    paddleXRef.current = px;

    // 小球物理落点/反弹
    const ball = ballRef.current;
    if (ball.dead) {
      if (t * 1000 >= ball.resetAt) {
        const nb = spawnBall();
        ballRef.current = nb;
        void nb;
      }
      return;
    }
    const prevBallY = ball.y + ballR; // 穿越检测：帧步进再快也不会跳过拍面
    ball.vy += GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // 左右墙 + 天花板
    if (ball.x < ballR) {
      ball.x = ballR;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x > w - ballR) {
      ball.x = w - ballR;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y < ballR) {
      ball.y = ballR;
      ball.vy = Math.abs(ball.vy);
    }

    // 拍面判定（线条穿越）：下落中 + 球体从拍线上方跨越到下方 + 水平 |dx| ≤ 拍半宽
    const paddleHalf = Math.max(56, Math.min(100, w * 0.15)) * (hitsRef.current >= 15 ? 0.82 : 1);
    if (
      ball.vy > 0 &&
      prevBallY <= paddleY + 26 &&
      ball.y + ballR >= paddleY - 6 &&
      Math.abs(ball.x - paddleXRef.current) <= paddleHalf + ballR
    ) {
      const speed = Math.min(760, 300 + hitsRef.current * 13);
      ball.y = paddleY - ballR;
      ball.vy = -speed;
      const spin = (ball.x - paddleXRef.current) * 5 + paddleVelRef.current * 0.3 + (Math.random() - 0.5) * 50;
      ball.vx = Math.max(-speed * 0.85, Math.min(speed * 0.85, spin));
      hitsRef.current++;
      setHits(hitsRef.current);
      beep(700, 0.05);
      if (hitsRef.current % 5 === 0 && hitsRef.current !== milestoneRef.current) {
        milestoneRef.current = hitsRef.current;
        speak(`棒！连击 ${hitsRef.current} 下！`, "xiaoyi", EXCITED_TONE);
      }
    }

    // 掉地
    if (ball.y > paddleY + 60) {
      heartsRef.current--;
      setHearts(heartsRef.current);
      speak("哎呀，球掉了！", "xiaoyi", SORRY_TONE);
      beep(180, 0.15);
      if (heartsRef.current <= 0) {
        finishRound();
        return;
      }
      ball.dead = true;
      ball.resetAt = now + 800;
    }

    // 轨迹
    trailRef.current.push({ x: ball.x, y: ball.y, t: now });
    trailRef.current = trailRef.current.filter((p) => now - p.t < 240);
  }

  function draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    now: number,
    video: HTMLVideoElement | null
  ) {
    // 球馆渐变背景
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#123f66");
    g.addColorStop(0.7, "#1d5c8f");
    g.addColorStop(1, "#2f7fb0");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (modeRef.current === "camera" && video && video.readyState >= 2) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const s = Math.max(w / vw, h / vh);
      const dw = vw * s;
      const dh = vh * s;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(-1, 1);
      ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.restore();
      ctx.fillStyle = "rgba(8,30,55,0.5)";
      ctx.fillRect(0, 0, w, h);
    }

    // 球台底线
    const paddleY = h * 0.84;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, paddleY + 26);
    ctx.lineTo(w, paddleY + 26);
    ctx.stroke();

    // 球拍（掌心下面一块圆角板）
    const paddleHalf = Math.max(52, Math.min(96, w * 0.15)) * (hitsRef.current >= 15 ? 0.8 : 1);
    ctx.save();
    ctx.translate(paddleXRef.current, paddleY);
    ctx.fillStyle = "rgba(255,183,77,0.95)";
    roundRect(ctx, -paddleHalf, -12, paddleHalf * 2, 22, 11);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // 手部骨架（摄像头模式）
    if (modeRef.current === "camera") {
      if (handVisibleRef.current && handRef.current) {
        drawHandSkeleton(ctx, handRef.current, w, h);
      } else {
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.strokeStyle = "rgba(8,30,55,0.7)";
        ctx.lineWidth = 4;
        ctx.font = "700 16px sans-serif";
        ctx.strokeText("把手伸到镜头前，手掌对着球", w / 2, h * 0.14);
        ctx.fillText("把手伸到镜头前，手掌对着球", w / 2, h * 0.14);
      }
    }

    // 球的轨迹
    ctx.lineCap = "round";
    const trail = trailRef.current;
    for (let i = 1; i < trail.length; i++) {
      const a = i / trail.length;
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.35})`;
      ctx.lineWidth = 3 + a * 4;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }

    // 球
    const ball = ballRef.current;
    if (!ball.dead) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, Math.max(10, Math.min(16, Math.min(w, h) * 0.022)), 0, Math.PI * 2);
      ctx.fillStyle = "#ffd94d";
      ctx.fill();
      ctx.strokeStyle = "#e0a800";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ball.x - 3.5, ball.y - 3.5, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fill();
    } else {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "700 17px sans-serif";
      ctx.fillText("球弹回来啦，接住它！", w / 2, h * 0.4);
    }
  }

  // ---------- 指针输入 ----------
  function onPointerMove(e: React.PointerEvent) {
    if (phaseRef.current !== "playing" || modeRef.current !== "mouse") return;
    const rect = fieldRef.current!.getBoundingClientRect();
    cursorRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ---------- 渲染 ----------
  return (
    <div className="fixed inset-0 z-50 bg-[#0a2a44] overflow-hidden">
      {/* 检测视频常驻挂载 */}
      <video ref={videoRef} playsInline muted className="hidden" />

      <div
        ref={fieldRef}
        className="absolute inset-0"
        style={{ touchAction: "none", cursor: mode === "mouse" ? "grabbing" : undefined }}
        onPointerMove={onPointerMove}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>

      {/* HUD */}
      {phase === "playing" && (
        <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4 pt-3 select-none pointer-events-none">
          <div className="pointer-events-auto flex flex-col gap-2">
            <Pill onClick={() => finishRound()}>结束</Pill>
            <Pill onClick={() => setVoiceMuted(!voiceMuted)} ariaLabel={voiceMuted ? "开启语音" : "关闭语音"}>
              {voiceMuted ? "🔇" : "🔊"}
            </Pill>
          </div>
          <div className="text-center">
            <div className="text-5xl font-black text-white drop-shadow-[0_3px_8px_rgba(0,0,0,0.5)]">
              {hits}
            </div>
            <div className="text-xs text-white/80 font-bold">连击</div>
          </div>
          <div className="pointer-events-auto text-right space-y-2">
            <Pill>⏱ {timeLeft}s</Pill>
            <div className="text-2xl tracking-wider" aria-label={`剩余 ${hearts} 颗心`}>
              {"❤️".repeat(Math.max(0, hearts))}
              <span style={{ opacity: 0.25 }}>{"❤️".repeat(Math.max(0, HEARTS - hearts))}</span>
            </div>
          </div>
        </div>
      )}

      {/* 开始/结算 */}
      {(phase === "intro" || phase === "loading") && (
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-gradient-to-b from-[#123f66] to-[#1d5c8f]">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-md max-h-full overflow-y-auto" style={{ boxShadow: "0 20px 50px rgba(20,40,70,0.5)" }}>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="text-5xl">🏓</div>
              <div>
                <p className="text-2xl font-black text-gray-800">乒乓球接球</p>
                <p className="text-sm text-gray-500 mt-1">
                  手掌就是球拍：把乒乓球托起来，别让它掉地上！连击越高球越快
                </p>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="primary" size="large" loading={phase === "loading"} onClick={() => start("camera")} className="w-full">
                📷 手掌开玩（摄像头）
              </Button>
              <Button size="large" disabled={phase === "loading"} onClick={() => start("mouse")} className="w-full">
                🖱 鼠标 / 手指模式
              </Button>
              <p className="text-xs text-gray-400">60 秒 3 颗心：球落地扣一颗心，挥动手掌还能给球加速</p>
            </div>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/45">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-md text-center" style={{ boxShadow: "0 20px 50px rgba(20,40,70,0.6)" }}>
            <div className="text-4xl tracking-widest">{StarRow(doneHits)}</div>
            <p className="text-2xl font-black mt-2 text-gray-800">
              {doneHits >= 30 ? "乒乓球小冠军！" : doneHits >= 15 ? "接得好棒！" : "再玩一次，练练手感！"}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              连击 {doneHits} 下 · 剩余 {hearts} 颗心 · 用时 {formatDuration(GAME_SECONDS)}
            </p>
            <div className="flex gap-3 mt-5">
              <Button type="primary" size="large" onClick={() => start(mode ?? "camera")} className="flex-1">
                再玩一次
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

function StarRow(hits: number): React.ReactNode {
  const n = hits >= 30 ? 3 : hits >= 15 ? 2 : hits >= 6 ? 1 : 0;
  return (
    <>
      {"⭐".repeat(n)}
      <span style={{ opacity: 0.25 }}>{"⭐".repeat(3 - n)}</span>
    </>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
