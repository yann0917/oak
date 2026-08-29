"use client";

// 点泡泡学单词：泡泡里装着英语单词，指尖（或鼠标）按住泡泡 0.35 秒"戳破"，
// 破开时读单词、记连击。泡泡带上升漂浮 + 晃动，进度环显示按压时长。
// 输入源与切水果共用一套：摄像头食指尖 or 指针事件，游戏逻辑完全复用。
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Radio } from "animal-island-ui";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { EXCITED_TONE, speak, useVoiceMuted } from "@/lib/garden/speech";
import { WORDS, type WordItem } from "@/data/garden/words";
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
const MAX_BUBBLES = 9;
const POP_HOLD_MS = 350; // 摄像头模式按住的时长
const COMBO_WINDOW = 2.5;

type InputMode = "camera" | "mouse";
type Phase = "intro" | "loading" | "playing" | "done";

interface Bubble {
  id: number;
  w: WordItem;
  x: number;
  y: number;
  vy: number;
  r: number;
  hue: number;
  wobble: number; // 相位
  dead: boolean;
  popped?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  born: number;
}

interface ResultItem {
  itemKey: string;
  label: string;
  correct: boolean;
}

const PRAISE = ["噼里啪啦，全戳破啦！", "泡泡小能手，太厉害了！", "戳戳戳，单词都记住啦！"];

export default function BubblePop() {
  const router = useRouter();
  const { currentChild } = useChildren();
  const [voiceMuted, setVoiceMuted] = useVoiceMuted();

  const [phase, setPhase] = useState<Phase>("intro");
  const [tier, setTier] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<InputMode | null>(null);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");

  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [poppedCount, setPoppedCount] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);

  const fieldRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const bubblesRef = useRef<Bubble[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatsRef = useRef<FloatText[]>([]);
  const cursorRef = useRef({ x: -100, y: -100 });
  const lastSmoothRef = useRef<PointLike | null>(null);
  const handRef = useRef<PointLike[] | null>(null);
  const handVisibleRef = useRef(false);
  const modeRef = useRef<InputMode | null>(null);
  const phaseRef = useRef<Phase>("intro");
  const rafRef = useRef(0);
  const lastNowRef = useRef(0);
  const loopTokenRef = useRef(0);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const bestComboRef = useRef(0);
  const poppedRef = useRef(0);
  const lastPopAtRef = useRef(-10);
  const startAtRef = useRef(0);
  const nextIdRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const holdRef = useRef<{ id: number; since: number } | null>(null); // 按压中的泡泡
  const resultsRef = useRef<ResultItem[]>([]);
  const savedRef = useRef(false);
  const pointerDownRef = useRef(false);

  const pool = useMemo(() => WORDS[tier], [tier]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // 倒计时驱动 HUD 与收尾
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

  useEffect(() => () => cleanup(), []);
  useEffect(() => {
    if (phase !== "done" || !currentChild || savedRef.current) return;
    if (resultsRef.current.length === 0) return;
    savedRef.current = true;
    api("/api/garden-records", {
      method: "POST",
      body: JSON.stringify({
        childId: currentChild.id,
        activity: "bubble-pop",
        difficulty: ["简单", "中等", "困难"][tier - 1],
        durationSec: GAME_SECONDS,
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

  function finishRound() {
    if (phaseRef.current !== "playing") return;
    setScore(scoreRef.current);
    setPoppedCount(poppedRef.current);
    setBestCombo(bestComboRef.current);
    setPhase("done");
    speak(PRAISE[Math.floor(Math.random() * PRAISE.length)], "xiaoyi", EXCITED_TONE);
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
      resetRound();
      const token = ++loopTokenRef.current;
      phaseRef.current = "playing";
      setPhase("playing");
      startAtRef.current = performance.now();
      rafRef.current = requestAnimationFrame((t) => loop(t, landmarker, token));
    } catch (e) {
      if (m === "camera") {
        toast(describeGameError(e), "warning");
        setHint("没有启用摄像头，试试用手指或鼠标点泡泡吧");
        start("mouse");
      } else {
        setError(describeGameError(e));
        setPhase("intro");
      }
    }
     
  };

  function resetRound() {
    bubblesRef.current = [];
    particlesRef.current = [];
    floatsRef.current = [];
    resultsRef.current = [];
    scoreRef.current = 0;
    comboRef.current = 0;
    bestComboRef.current = 0;
    poppedRef.current = 0;
    lastPopAtRef.current = -10;
    lastSpawnRef.current = 0;
    holdRef.current = null;
    savedRef.current = false;
    setScore(0);
    setCombo(0);
    setTimeLeft(GAME_SECONDS);
  }

  // ---------- 主循环 ----------

  function loop(now: number, landmarker: Awaited<ReturnType<typeof getHandLandmarker>>, token: number) {
    // 先续帧再判断：第一帧若在 React 提交前触发，旧写法会"返回即死"
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
    const w = field.clientWidth;
    const h = field.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (modeRef.current === "camera" && video && video.readyState >= 2) {
      const res = landmarker.detectForVideo(video, now);
      if (res.landmarks.length > 0) {
        const tip = res.landmarks[0][8];
        const smooth = lowPass(lastSmoothRef.current, tip, 0.45);
        lastSmoothRef.current = smooth;
        cursorRef.current = videoToScreen(smooth, w, h);
        handRef.current = res.landmarks[0];
        handVisibleRef.current = true;
      } else {
        handVisibleRef.current = false;
        lastSmoothRef.current = null;
        holdRef.current = null;
      }
    }

    update(dt, w, h, now);
    draw(ctx, w, h, now, video);
  }

  function videoToScreen(p: PointLike, w: number, h: number) {
    const video = videoRef.current!;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const s = Math.max(w / vw, h / vh);
    const dw = vw * s;
    const dh = vh * s;
    return { x: w - ((w - dw) / 2 + p.x * dw), y: (h - dh) / 2 + p.y * dh };
  }

  function update(dt: number, w: number, h: number, now: number) {
    const t = now / 1000;
    const alive = bubblesRef.current.filter((b) => !b.dead).length;
    if (t - lastSpawnRef.current > 0.55 && alive < MAX_BUBBLES) {
      lastSpawnRef.current = t;
      spawnBubble(w, h);
    }

    for (const b of bubblesRef.current) {
      if (b.dead) continue;
      b.y += b.vy * dt; // 缓慢上浮
      b.vy -= 2 * dt; // 微微加速（最后被"吹"上去的感觉）
      b.wobble += 2.2 * dt;
      if (b.y < -b.r * 2) b.dead = true;
    }
    bubblesRef.current = bubblesRef.current.filter((b) => !b.dead);

    // 粒子与漂浮字
    for (const p of particlesRef.current) {
      p.vx *= 0.94;
      p.vy = p.vy * 0.94 + 220 * dt * 0.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    particlesRef.current = particlesRef.current.filter((p) => p.r > 0.4);
    floatsRef.current = floatsRef.current.filter((f) => t - f.born < 1.4);

    // 指尖按压检测（摄像头模式）
    if (modeRef.current === "camera" && handVisibleRef.current) {
      const cur = cursorRef.current;
      const hit = bubblesRef.current.find(
        (b) => !b.dead && Math.hypot(b.x - cur.x, b.y - cur.y) < b.r * 0.85
      );
      if (hit) {
        if (!holdRef.current || holdRef.current.id !== hit.id) {
          holdRef.current = { id: hit.id, since: now };
        } else if (now - holdRef.current.since >= POP_HOLD_MS) {
          holdRef.current = null;
          popBubble(hit);
        }
      } else {
        holdRef.current = null;
      }
    } else if (modeRef.current === "mouse" && pointerDownRef.current) {
      const cur = cursorRef.current;
      const hit = bubblesRef.current.find(
        (b) => !b.dead && Math.hypot(b.x - cur.x, b.y - cur.y) < b.r * 0.85
      );
      if (hit) popBubble(hit);
    }
  }

  function spawnBubble(w: number, h: number) {
    const word = pool[Math.floor(Math.random() * pool.length)];
    const r = Math.max(44, Math.min(58, Math.min(w, h) * 0.12));
    bubblesRef.current.push({
      id: nextIdRef.current++,
      w: word,
      x: w * (0.1 + Math.random() * 0.8),
      y: h + r,
      vy: -(26 + Math.random() * 22),
      r,
      hue: Math.floor(Math.random() * 360),
      wobble: Math.random() * Math.PI * 2,
      dead: false,
    });
  }

  function popBubble(b: Bubble) {
    if (b.dead) return;
    b.dead = true;
    b.popped = true;
    poppedRef.current++;
    const t = performance.now() / 1000;
    if (t - lastPopAtRef.current < COMBO_WINDOW) comboRef.current++;
    else comboRef.current = 1;
    lastPopAtRef.current = t;
    bestComboRef.current = Math.max(bestComboRef.current, comboRef.current);
    scoreRef.current += 10 + (comboRef.current - 1) * 2;
    setScore(scoreRef.current);
    setCombo(comboRef.current > 1 ? comboRef.current : 0);
    // 泡泡碎片
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const sp = 60 + Math.random() * 160;
      particlesRef.current.push({
        x: b.x + Math.cos(a) * b.r * 0.6,
        y: b.y + Math.sin(a) * b.r * 0.6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        r: 3 + Math.random() * 4,
        hue: b.hue,
      });
    }
    floatsRef.current.push({
      x: b.x,
      y: b.y,
      text: `${b.w.en} · ${b.w.zh}`,
      born: t,
    });
    resultsRef.current.push({
      itemKey: `bp:${b.w.en}`,
      label: `戳破「${b.w.en}」`,
      correct: true,
    });
    speak(`${b.w.zh}，${b.w.en}`, "xiaoyi", EXCITED_TONE);
  }

  function draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    now: number,
    video: HTMLVideoElement | null
  ) {
    const t = now / 1000;
    // 海底蓝背景渐变（点缀一点的海洋感）
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1d6fa5");
    g.addColorStop(0.6, "#2f8fc0");
    g.addColorStop(1, "#55b7d9");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // 摄像头模式叠加淡化画面，方便孩子看到自己的手
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
      ctx.fillStyle = "rgba(15,60,95,0.55)";
      ctx.fillRect(0, 0, w, h);
    }

    for (const b of bubblesRef.current) {
      const bx = b.x + Math.sin(b.wobble) * 12;
      // 泡泡球面
      ctx.beginPath();
      ctx.arc(bx, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${b.hue}, 70%, 72%, 0.30)`;
      ctx.fill();
      ctx.strokeStyle = `hsla(${b.hue}, 80%, 85%, 0.9)`;
      ctx.lineWidth = 3;
      ctx.stroke();
      // 高光
      ctx.beginPath();
      ctx.arc(bx - b.r * 0.35, b.y - b.r * 0.38, b.r * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fill();
      // 内容：emoji + 单词 + 中文
      ctx.textAlign = "center";
      ctx.font = `${Math.round(b.r * 0.62)}px serif`;
      ctx.fillText(b.w.emoji, bx, b.y - b.r * 0.28);
      ctx.font = `800 ${Math.round(b.r * 0.34)}px sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.fillText(b.w.en, bx, b.y + b.r * 0.2);
      ctx.font = `600 ${Math.round(b.r * 0.24)}px sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(b.w.zh, bx, b.y + b.r * 0.52);
      // 按住时画进度环
      if (holdRef.current?.id === b.id && modeRef.current === "camera") {
        const prog = Math.min(1, (now - holdRef.current.since) / POP_HOLD_MS);
        ctx.beginPath();
        ctx.arc(bx, b.y, b.r + 6, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
        ctx.strokeStyle = "#ffe066";
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    }

    // 泡泡碎片（小圆点）
    ctx.globalAlpha = 0.9;
    for (const p of particlesRef.current) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${p.hue}, 80%, 75%)`;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 漂浮文字
    ctx.textAlign = "center";
    for (const f of floatsRef.current) {
      const age = (t - f.born) / 1.4;
      ctx.globalAlpha = 1 - age;
      ctx.font = `800 ${16 + age * 5}px sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(15,60,95,0.8)";
      ctx.lineWidth = 4;
      ctx.strokeText(f.text, f.x, f.y - 26 - age * 55);
      ctx.fillText(f.text, f.x, f.y - 26 - age * 55);
      ctx.globalAlpha = 1;
    }

    // 指尖标记与手部骨架
    if (modeRef.current === "camera") {
      if (handVisibleRef.current && handRef.current) {
        drawHandSkeleton(ctx, handRef.current, w, h);
      } else {
        const msg = "把手放到摄像头前，按住泡泡就戳破啦";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.strokeStyle = "rgba(15,60,95,0.75)";
        ctx.lineWidth = 4;
        ctx.font = "700 16px sans-serif";
        ctx.strokeText(msg, w / 2, h * 0.12);
        ctx.fillText(msg, w / 2, h * 0.12);
      }
    }
  }

  // ---------- 指针输入 ----------

  function onPointerMove(e: React.PointerEvent) {
    if (phaseRef.current !== "playing" || modeRef.current !== "mouse") return;
    const rect = fieldRef.current!.getBoundingClientRect();
    cursorRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (phaseRef.current !== "playing" || modeRef.current !== "mouse") return;
    pointerDownRef.current = true;
    const rect = fieldRef.current!.getBoundingClientRect();
    cursorRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hit = bubblesRef.current.find(
      (b) => !b.dead && Math.hypot(b.x - cursorRef.current.x, b.y - cursorRef.current.y) < b.r * 0.85
    );
    if (hit) popBubble(hit);
  }

  // ---------- 渲染 ----------

  const showPreview = mode === "camera" && phase === "playing";
  return (
    <div className="fixed inset-0 z-50 bg-[#0b3a55] overflow-hidden">
      {/* 检测用视频：常驻挂载（模式/阶段只切显隐，不卸载） */}
      <video ref={videoRef} playsInline muted className="hidden" />

      <div
        ref={fieldRef}
        className="absolute inset-0"
        style={{ touchAction: "none" }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={() => (pointerDownRef.current = false)}
        onPointerLeave={() => (pointerDownRef.current = false)}
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
              {score}
            </div>
            {combo >= 2 && (
              <div className="mt-1 inline-block px-3 py-1 rounded-full bg-amber-400 text-amber-950 font-black text-sm">
                {combo} 连击！
              </div>
            )}
          </div>
          <div className="pointer-events-auto text-right">
            <Pill>⏱ {timeLeft}s</Pill>
            {hint && (
              <div className="mt-2 px-3 py-1.5 rounded-xl bg-black/40 text-white/90 text-xs max-w-44">
                {hint}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 开始界面 */}
      {(phase === "intro" || phase === "loading") && (
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-gradient-to-b from-[#1d6fa5] via-[#2f8fc0] to-[#55b7d9]">
          <div
            className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-md max-h-full overflow-y-auto"
            style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="text-5xl">🫧</div>
              <div>
                <p className="text-2xl font-black text-gray-800">点泡泡学单词</p>
                <p className="text-sm text-gray-500 mt-1">
                  指尖按住泡泡 0.4 秒就「啵」地戳破，一起念出来
                </p>
              </div>
              <div className="w-full text-left">
                <p className="text-sm font-bold text-gray-800 mb-2">选择词库难度</p>
                <Radio
                  value={String(tier)}
                  onChange={(v) => setTier(Number(v) as 1 | 2 | 3)}
                  direction="vertical"
                  options={[
                    { label: "简单 · 基础名词", value: "1" },
                    { label: "中等 · 动作与日常", value: "2" },
                    { label: "困难 · 进阶词汇", value: "3" },
                  ]}
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button
                type="primary"
                size="large"
                loading={phase === "loading"}
                onClick={() => start("camera")}
                className="w-full"
              >
                📷 伸手点泡泡（摄像头）
              </Button>
              <Button size="large" disabled={phase === "loading"} onClick={() => start("mouse")} className="w-full">
                🖱 鼠标 / 手指模式
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 结算界面 */}
      {phase === "done" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/45">
          <div
            className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-md text-center"
            style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.3)" }}
          >
            <div className="text-4xl tracking-widest">{StarRow(score)}</div>
            <p className="text-2xl font-black mt-2 text-gray-800">
              {score >= 300 ? "泡泡爆破大师！" : score >= 150 ? "戳得好，单词全听见！" : "再戳一轮就记住了！"}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <Stat label="得分" value={String(score)} />
              <Stat label="戳破" value={`${poppedCount} 个`} />
              <Stat label="最多连击" value={`x${Math.max(1, bestCombo)}`} />
            </div>
            <p className="text-xs text-gray-500 mt-3">
              每个泡泡都是一个新单词，回合时长 {formatDuration(GAME_SECONDS)}
            </p>
            <div className="flex gap-3 mt-4">
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

function StarRow(score: number): React.ReactNode {
  const n = score >= 300 ? 3 : score >= 150 ? 2 : score >= 60 ? 1 : 0;
  return (
    <>
      {"⭐".repeat(n)}
      <span style={{ opacity: 0.25 }}>{"⭐".repeat(3 - n)}</span>
    </>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-amber-50 py-3 px-2">
      <div className="text-xl font-black text-gray-800">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
