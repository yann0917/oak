"use client";

// 魔法手势：HandLandmarker 关键点规则识别 8 种手势（含标准分类器没有的 OK/比心），
// 每种的指尖数粒子流、切手势在掌心爆发特效，
// 首解锁每种手势得 30 分并语音报喜，之后每次触发再得 5 分，45 秒冲高分。
// 手势连续 3 帧一致才确认（去抖动）；没有摄像头也能玩：鼠标移动=粒子流，点击=随机特效。
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "animal-island-ui";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { EXCITED_TONE, speak, useVoiceMuted } from "@/lib/garden/speech";
import {
  classifyHandGesture,
  describeGameError,
  getHandLandmarker,
  openCamera,
  toScreen,
} from "@/lib/games/mediapipe";
import { toast } from "@/lib/toast";

const GAME_SECONDS = 45;
const CONFIRM_FRAMES = 3; // 手势连续一致帧数（去抖动）
const MAX_PARTICLES = 700;
const UNLOCK_SCORE = 30;
const TRIGGER_SCORE = 5;

// 手势 → 特效：kind 决定粒子形状/配色；emoji 用于徽章墙
interface EffectDef {
  name: string;
  emoji: string;
  colors: string[];
  burst: number; // 每次触发的粒子数
  shape: "dot" | "star" | "heart" | "bubble" | "ribbon" | "ring";
  stream: number; // 保持手势时每帧在指尖发射的粒子数
  streamColor: string;
}

const EFFECTS: Record<string, EffectDef> = {
  Open_Palm: {
    name: "彩虹喷泉",
    emoji: "🌈",
    colors: ["#f4736f", "#f5b840", "#4fc3b3", "#7d8ee0", "#a583e8", "#f08cb0"],
    burst: 90,
    shape: "dot",
    stream: 3,
    streamColor: "#f5b840",
  },
  Victory: {
    name: "星星闪耀",
    emoji: "⭐",
    colors: ["#ffd94d", "#ffe066", "#ffffff", "#ffb74d"],
    burst: 70,
    shape: "star",
    stream: 2,
    streamColor: "#ffe066",
  },
  Closed_Fist: {
    name: "烟花爆发",
    emoji: "🎆",
    colors: ["#ff5d5d", "#ffd94d", "#7d8ee0", "#67b56e", "#f08cb0"],
    burst: 120,
    shape: "dot",
    stream: 2,
    streamColor: "#ff5d5d",
  },
  Thumb_Up: {
    name: "爱心飞舞",
    emoji: "💗",
    colors: ["#ff8aa5", "#f08cb0", "#f4736f", "#ffc1d2"],
    burst: 60,
    shape: "heart",
    stream: 2,
    streamColor: "#f08cb0",
  },
  Pointing_Up: {
    name: "泡泡升腾",
    emoji: "🫧",
    colors: ["#8ecae6", "#a8dadc", "#ffffff", "#b5e2f4"],
    burst: 70,
    shape: "bubble",
    stream: 3,
    streamColor: "#a8dadc",
  },
  ILoveYou: {
    name: "彩带飞舞",
    emoji: "🎊",
    colors: ["#f4736f", "#f5b840", "#67b56e", "#7d8ee0", "#a583e8"],
    burst: 100,
    shape: "ribbon",
    stream: 2,
    streamColor: "#a583e8",
  },
  OK: {
    name: "金色光环",
    emoji: "👌",
    colors: ["#ffd94d", "#ffe066", "#fff8d6", "#f5b840"],
    burst: 60,
    shape: "ring",
    stream: 2,
    streamColor: "#ffd94d",
  },
  Heart: {
    name: "比心时刻",
    emoji: "🫶",
    colors: ["#ff8aa5", "#f4736f", "#ffc1d2", "#ffffff"],
    burst: 130,
    shape: "heart",
    stream: 3,
    streamColor: "#ff8aa5",
  },
};

const EFFECT_LIST = Object.entries(EFFECTS);

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  shape: EffectDef["shape"];
  gravity: number;
  spin: number;
  rot: number;
}

type Phase = "intro" | "loading" | "playing" | "done";
type InputMode = "camera" | "mouse";

export default function GestureMagic() {
  const router = useRouter();
  const { currentChild } = useChildren();
  const [voiceMuted, setVoiceMuted] = useVoiceMuted();

  const [phase, setPhase] = useState<Phase>("intro");
  const [mode, setMode] = useState<InputMode | null>(null);
  const [error, setError] = useState("");
  const [score, setScore] = useState(0);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [curEffect, setCurEffect] = useState<string | null>(null);
  const [doneScore, setDoneScore] = useState(0);
  const [doneUnlocked, setDoneUnlocked] = useState<string[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const loopTokenRef = useRef(0);
  const phaseRef = useRef<Phase>("intro");
  const modeRef = useRef<InputMode | null>(null);
  const startAtRef = useRef(0);
  const savedRef = useRef(false);

  // 手势状态机（避免频繁 setState，全部走 ref，渲染用轻量 state）
  const gemRef = useRef<string | null>(null); // 当前有效手势
  const gemRawRef = useRef<string | null>(null); // 原始分类
  const gemCountRef = useRef(0); // 同一手势连续帧数
  const handSeenRef = useRef(false);
  const sparkPosRef = useRef({ x: 0.5, y: 0.4 }); // 指尖（鼠标模式 = 指针）
  const palmPosRef = useRef({ x: 0.5, y: 0.4 });
  const particlesRef = useRef<Particle[]>([]);
  const scoreRef = useRef(0);
  const unlockedRef = useRef<string[]>([]);
  const burstTotalRef = useRef(0);
  const spokeRef = useRef(new Set<string>()); // 本轮报过喜的解锁

  useEffect(() => {
    phaseRef.current = phase;
    if (phase === "done") {
      setDoneScore(scoreRef.current);
      setDoneUnlocked([...unlockedRef.current]);
    }
  }, [phase]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => () => cleanup(), []);

  function cleanup() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // 写学习记录：解锁的手势各记一条 + 整体触发统计
  useEffect(() => {
    if (phase !== "done" || !currentChild || savedRef.current) return;
    if (scoreRef.current === 0) return;
    savedRef.current = true;
    const results = unlockedRef.current.map((k) => ({
      itemKey: `gm:unlock:${k}`,
      label: `解锁 ${EFFECTS[k].name}`,
      correct: true,
    }));
    results.push({
      itemKey: "gm:burst",
      label: `触发特效 ${burstTotalRef.current} 次`,
      correct: true,
    });
    api("/api/garden-records", {
      method: "POST",
      body: JSON.stringify({
        childId: currentChild.id,
        activity: "gesture-magic",
        difficulty: "简单",
        durationSec: GAME_SECONDS,
        results,
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentChild]);

  function beep(freq: number, dur = 0.06, vol = 0.08) {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = vol;
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
    phaseRef.current = "done";
    setPhase("done");
    const n = unlockedRef.current.length;
    speak(
      n >= 8
        ? `哇！八种特效全解锁，你是魔法大师！`
        : n >= 4
          ? `解锁了 ${n} 种特效，真棒！`
          : `一共得了 ${scoreRef.current} 分，再练练新手势吧！`,
      "xiaoyi",
      n >= 8 ? EXCITED_TONE : undefined
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
      scoreRef.current = 0;
      unlockedRef.current = [];
      burstTotalRef.current = 0;
      spokeRef.current = new Set();
      particlesRef.current = [];
      savedRef.current = false;
      setScore(0);
      setUnlocked([]);
      setCurEffect(null);
      setTimeLeft(GAME_SECONDS);
      phaseRef.current = "playing";
      setPhase("playing");
      const token = ++loopTokenRef.current;
      startAtRef.current = performance.now();
      rafRef.current = requestAnimationFrame((t) => loop(t, landmarker, token));
      speak("挥挥小手，变出魔法特效吧！", "xiaoyi");
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

  // 45 秒倒计时
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

  function loop(
    now: number,
    landmarker: Awaited<ReturnType<typeof getHandLandmarker>>,
    token: number
  ) {
    if (token !== loopTokenRef.current) return;
    rafRef.current = requestAnimationFrame((t) => loop(t, landmarker, token));
    if (phaseRef.current !== "playing") return;

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

    // 手 → 指尖/掌心坐标 + 手势识别（连续多帧一致才确认）
    if (modeRef.current === "camera" && video && video.readyState >= 2) {
      try {
        const res = landmarker.detectForVideo(video, now);
        const hands = res.landmarks ?? [];
        const lm = hands[0];
        if (lm && lm.length >= 21) {
          const pTip = toScreen(lm[8], w, h); // 指尖
          const pPalm = toScreen(lm[9], w, h); // 掌心
          sparkPosRef.current = pTip;
          palmPosRef.current = pPalm;
          handSeenRef.current = true;
        } else {
          handSeenRef.current = false;
        }
        handleGesture(classifyHandGesture(hands), now);
      } catch (e) {
        console.warn("[gesture-magic] 识别帧异常", e);
      }
    }

    updateParticles(w, h, now);
    draw(ctx, w, h, now, video);
  }

  function handleGesture(raw: string | null, now: number) {
    if (raw === gemRawRef.current) {
      gemCountRef.current++;
    } else {
      gemRawRef.current = raw;
      gemCountRef.current = 1;
    }
    if (gemCountRef.current < CONFIRM_FRAMES) return;
    // 确认有效手势（raw 为 None/置信低时确认"空手势"，只停粒子流）
    const confirmed = raw && EFFECTS[raw] ? raw : null;
    if (confirmed === gemRef.current) return;
    const prev = gemRef.current;
    gemRef.current = confirmed;
    if (!confirmed) return;
    // 手势切换：首次解锁 +30 分，每次触发 +5 分，掌心爆发粒子
    const def = EFFECTS[confirmed];
    if (!unlockedRef.current.includes(confirmed)) {
      unlockedRef.current.push(confirmed);
      scoreRef.current += UNLOCK_SCORE;
      setUnlocked([...unlockedRef.current]);
      if (!spokeRef.current.has(confirmed)) {
        spokeRef.current.add(confirmed);
        speak(`解锁${def.name}！`, "xiaoyi", EXCITED_TONE);
      }
      beep(880, 0.12, 0.12);
    } else {
      scoreRef.current += TRIGGER_SCORE;
      if (prev === null) beep(660, 0.08);
    }
    burstTotalRef.current++;
    setScore(scoreRef.current);
    setCurEffect(confirmed);
    emitBurst(confirmed, palmPosRef.current.x, palmPosRef.current.y);
  }

  // ---------- 粒子 ----------

  const rand = (a: number, b: number) => a + Math.random() * (b - a);

  function pushParticle(p: Particle) {
    const arr = particlesRef.current;
    if (arr.length >= MAX_PARTICLES) arr.shift();
    arr.push(p);
  }

  function emitBurst(kind: string, x: number, y: number) {
    const def = EFFECTS[kind];
    const isBubble = def.shape === "bubble";
    for (let i = 0; i < def.burst; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = rand(60, def.shape === "star" ? 320 : 380);
      const life = rand(0.7, 1.6);
      pushParticle({
        x: x + rand(-6, 6),
        y: y + rand(-6, 6),
        vx: Math.cos(ang) * spd + rand(-30, 30),
        vy: Math.sin(ang) * spd - (isBubble ? 120 : 80), // 泡泡/爱心先向上冲再减速
        age: 0,
        life,
        size: def.shape === "heart" ? rand(6, 12) : def.shape === "bubble" ? rand(6, 16) : rand(3, 8),
        color: def.colors[i % def.colors.length],
        shape: def.shape,
        gravity: isBubble ? -40 : def.shape === "heart" ? -60 : 480,
        spin: rand(-4, 4),
        rot: Math.random() * Math.PI * 2,
      });
    }
  }

  function emitStream(x: number, y: number, color: string, shape: EffectDef["shape"], count: number) {
    for (let i = 0; i < count; i++) {
      pushParticle({
        x: x + rand(-4, 4),
        y: y + rand(-4, 4),
        vx: rand(-40, 40),
        vy: rand(-60, 20),
        age: 0,
        life: rand(0.5, 1.1),
        size: rand(2.5, 6),
        color,
        shape,
        gravity: 320,
        spin: rand(-3, 3),
        rot: Math.random() * Math.PI * 2,
      });
    }
  }

  function updateParticles(w: number, h: number, now: number) {
    // 保持手势时指尖一直冒粒子；鼠标模式移动也在冒
    const eff = gemRef.current ? EFFECTS[gemRef.current] : null;
    if (eff) {
      emitStream(sparkPosRef.current.x, sparkPosRef.current.y, eff.streamColor, eff.shape, eff.stream);
    } else if (modeRef.current === "mouse") {
      emitStream(
        sparkPosRef.current.x,
        sparkPosRef.current.y,
        `hsl(${Math.floor((now / 60) % 360)},85%,60%)`,
        "dot",
        2
      );
    }
    const arr = particlesRef.current;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.age += 1 / 60;
      if (p.age >= p.life) {
        arr.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * (1 / 60);
      p.x += p.vx * (1 / 60);
      p.y += p.vy * (1 / 60);
      p.rot += p.spin * (1 / 60);
      if (p.y > h + 30 || p.x < -30 || p.x > w + 30) {
        arr.splice(i, 1);
      }
    }
  }

  function draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    now: number,
    video: HTMLVideoElement | null
  ) {
    // 夜空渐变背景（摄像头模式下半透明，保证粒子醒目）
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1a1440");
    g.addColorStop(0.65, "#2b1e5e");
    g.addColorStop(1, "#3d2a72");
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
      // 压暗视频让粒子更醒目
      ctx.fillStyle = "rgba(20,14,50,0.45)";
      ctx.fillRect(0, 0, w, h);
    }

    // 粒子（形状分派）
    for (const p of particlesRef.current) {
      const a = 1 - p.age / p.life;
      drawParticle(ctx, p, a);
    }

    // 提示：没有手 / 没有手势
    if (modeRef.current === "camera") {
      if (!handSeenRef.current) {
        hint(ctx, w, h, "把手伸到镜头前，对着屏幕比手势");
      } else if (!gemRef.current) {
        hint(ctx, w, h, "试试 ✋ ✌️ ✊ 👍 ☝️ 🤟 👌 🫶 这八个魔法手势");
      }
    }
  }

  function hint(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
    ctx.textAlign = "center";
    ctx.font = "700 17px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "rgba(20,14,50,0.75)";
    ctx.lineWidth = 4;
    ctx.strokeText(text, w / 2, h * 0.14);
    ctx.fillText(text, w / 2, h * 0.14);
  }

  // ---------- 指针输入（鼠标模式） ----------
  function onPointerMove(e: React.PointerEvent) {
    if (phaseRef.current !== "playing" || modeRef.current !== "mouse") return;
    const rect = fieldRef.current!.getBoundingClientRect();
    sparkPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    palmPosRef.current = sparkPosRef.current;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (phaseRef.current !== "playing" || modeRef.current !== "mouse") return;
    const rect = fieldRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    sparkPosRef.current = { x, y };
    palmPosRef.current = { x, y };
    // 点击 = 随机特效爆发，与手势一样算解锁 +30 / 触发 +5（没有摄像头也能集齐 8 种）
    const kind = EFFECT_LIST[Math.floor(Math.random() * EFFECT_LIST.length)][0];
    const def = EFFECTS[kind];
    if (!unlockedRef.current.includes(kind)) {
      unlockedRef.current.push(kind);
      scoreRef.current += UNLOCK_SCORE;
      setUnlocked([...unlockedRef.current]);
      if (!spokeRef.current.has(kind)) {
        spokeRef.current.add(kind);
        speak(`解锁${def.name}！`, "xiaoyi", EXCITED_TONE);
      }
      beep(880, 0.12, 0.12);
    } else {
      scoreRef.current += TRIGGER_SCORE;
      beep(660, 0.08);
    }
    burstTotalRef.current++;
    setScore(scoreRef.current);
    setCurEffect(kind);
    emitBurst(kind, x, y);
  }

  // ---------- 渲染 ----------
  return (
    <div className="fixed inset-0 z-50 bg-[#1a1440] overflow-hidden">
      <video ref={videoRef} playsInline muted className="hidden" />

      <div
        ref={fieldRef}
        className="absolute inset-0"
        style={{ touchAction: "none", cursor: mode === "mouse" ? "crosshair" : undefined }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
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
            <div className="text-5xl font-black text-white drop-shadow-[0_3px_8px_rgba(0,0,0,0.55)]">
              {score}
            </div>
            <div className="text-xs text-white/80 font-bold">得分</div>
          </div>
          <div className="pointer-events-auto text-right space-y-2">
            <Pill>⏱ {timeLeft}s</Pill>
            {/* 解锁徽章墙 */}
            <div
              className="flex flex-wrap justify-end gap-1 text-lg max-w-44 ml-auto"
              aria-label={`已解锁 ${unlocked.length} 种特效`}
            >
              {EFFECT_LIST.map(([k, def]) => (
                <span
                  key={k}
                  title={def.name}
                  style={{ opacity: unlocked.includes(k) ? 1 : 0.25, filter: unlocked.includes(k) ? "none" : "grayscale(1)" }}
                >
                  {def.emoji}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* 当前手势名提示（切手势瞬间可见，方便家长辅导） */}
      {phase === "playing" && curEffect && (
        <div className="absolute inset-x-0 top-24 flex justify-center pointer-events-none">
          <span className="px-4 py-1.5 rounded-full bg-white/15 backdrop-blur text-white font-bold text-lg">
            {EFFECTS[curEffect].emoji} {EFFECTS[curEffect].name}
          </span>
        </div>
      )}

      {/* 开始/结算 */}
      {(phase === "intro" || phase === "loading") && (
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-gradient-to-b from-[#1a1440] to-[#3d2a72]">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-md max-h-full overflow-y-auto" style={{ boxShadow: "0 20px 50px rgba(20,14,50,0.6)" }}>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="text-5xl">✨</div>
              <div>
                <p className="text-2xl font-black text-gray-800">魔法手势</p>
                <p className="text-sm text-gray-500 mt-1">
                  挥挥小手变出粒子魔法：✋ 彩虹、✌️ 星星、✊ 烟花、👍 爱心、☝️ 泡泡、🤟 彩带、👌 光环、🫶 比心
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 text-2xl">
                {EFFECT_LIST.map(([k, def]) => (
                  <span key={k} title={def.name} className="flex flex-col items-center gap-0.5">
                    <span>{def.emoji}</span>
                    <span className="text-[10px] font-bold text-gray-500">{def.name}</span>
                  </span>
                ))}
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="primary" size="large" loading={phase === "loading"} onClick={() => start("camera")} className="w-full">
                📷 手势开玩（摄像头）
              </Button>
              <Button size="large" disabled={phase === "loading"} onClick={() => start("mouse")} className="w-full">
                🖱 鼠标 / 手指模式
              </Button>
              <p className="text-xs text-gray-400">
                {GAME_SECONDS} 秒：每个手势首解锁 +{UNLOCK_SCORE} 分，再触发 +{TRIGGER_SCORE} 分，集齐 8 种特效！
              </p>
            </div>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/45">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-md text-center" style={{ boxShadow: "0 20px 50px rgba(20,14,50,0.6)" }}>
            <div className="text-4xl tracking-widest">{StarRow(doneUnlocked.length)}</div>
            <p className="text-2xl font-black mt-2 text-gray-800">
              {doneUnlocked.length >= 8 ? "八种特效全解锁，魔法大师！" : doneUnlocked.length >= 4 ? "解锁了好几样魔法，真棒！" : "再玩一次，做更多的魔法手势！"}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              得分 {doneScore} · 解锁 {doneUnlocked.length}/8 种特效 · 用时 {GAME_SECONDS} 秒
            </p>
            <div className="flex justify-center gap-1.5 mt-2 text-2xl">
              {EFFECT_LIST.map(([k, def]) => (
                <span key={k} title={def.name} style={{ opacity: doneUnlocked.includes(k) ? 1 : 0.25 }}>
                  {def.emoji}
                </span>
              ))}
            </div>
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

// ---------- 粒子形状绘制 ----------

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  switch (p.shape) {
    case "star": {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      const r = p.size * 1.6;
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r : r * 0.45;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "heart": {
      ctx.fillStyle = p.color;
      const s = p.size / 1.8;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.35);
      ctx.bezierCurveTo(-s * 1.1, -s * 0.6, -s * 0.3, -s * 1.4, 0, -s * 0.5);
      ctx.bezierCurveTo(s * 0.3, -s * 1.4, s * 1.1, -s * 0.6, 0, s * 0.35);
      ctx.fill();
      break;
    }
    case "bubble": {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.stroke();
      // 高光
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath();
      ctx.arc(-p.size * 0.3, -p.size * 0.35, Math.max(1, p.size * 0.18), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "ring": {
      // 金色光环：随生命周期扩散淡出（半径 = size * 进度）
      const r = p.size * (2 + (p.age / p.life) * 5);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1.5, p.size * 0.5 * (1 - p.age / p.life));
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "ribbon": {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-p.size, 0);
      ctx.quadraticCurveTo(0, -p.size * 1.4, p.size, 0);
      ctx.stroke();
      break;
    }
    default: {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function StarRow(n: number): React.ReactNode {
  const stars = n >= 8 ? 3 : n >= 5 ? 2 : n >= 3 ? 1 : 0;
  return (
    <>
      {"⭐".repeat(stars)}
      <span style={{ opacity: 0.25 }}>{"⭐".repeat(3 - stars)}</span>
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
