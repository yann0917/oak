"use client";

// 切水果认汉字：核心循环 = 刀光轨迹 → 线段与圆碰撞 → 对半劈开 → 连击计分。
// 输入源：摄像头手部关键点（食指尖=刀尖）或鼠标/手指滑动，游戏逻辑完全复用同一套。
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Radio } from "animal-island-ui";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { EXCITED_TONE, SORRY_TONE, speak, useVoiceMuted } from "@/lib/garden/speech";
import { BUILTIN_CHARACTERS, type BuiltinCharacter } from "@/data/garden/characters";
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
const MAX_ITEMS = 12;
const BOMB_CHANCE = 0.15;

const FRUIT_EMOJIS = ["🍎", "🍊", "🍇", "🍓", "🍉", "🍑", "🍋", "🍒", "🥝", "🍈", "🥭", "🫐"];
const FRUIT_COLORS = [
  "#e04f3f", "#f08c00", "#8e44ad", "#e5537f", "#2f9e6e", "#f2b13d",
  "#f2c94c", "#d64541", "#8bc34a", "#e8a33d", "#f39c12", "#4f9e3f",
];
const DIFF_TIERS = [
  { label: "简单 · 启蒙高频字", tier: 1 },
  { label: "中等 · 常用字", tier: 2 },
  { label: "困难 · 进阶字", tier: 3 },
] as const;

type InputMode = "camera" | "mouse";
type Phase = "intro" | "loading" | "playing" | "done";

interface Fruit {
  id: number;
  c: BuiltinCharacter | null; // null = 炸弹
  emoji: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  bomb: boolean;
  dead: boolean;
  sliceAt?: number;
  cutAngle?: number;
  col: string;
}

interface Juice {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  col: string;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  born: number;
}

interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

interface ResultItem {
  itemKey: string;
  label: string;
  correct: boolean;
}

const PRAISE_OVER = [
  "哇！切了这么多，太厉害了！",
  "切开啦！汉字小达人！",
  "好厉害！我切我切我切切切！",
];

export default function FruitSlice() {
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
  const [slicedCount, setSlicedCount] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [doneScore, setDoneScore] = useState(0);

  const fieldRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 游戏实体全走 ref，避免每帧 setState 触发重渲染
  const fruitsRef = useRef<Fruit[]>([]);
  const juiceRef = useRef<Juice[]>([]);
  const floatsRef = useRef<FloatText[]>([]);
  const trailRef = useRef<TrailPoint[]>([]);
  const bladeRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastSmoothRef = useRef<PointLike | null>(null);
  const cursorRef = useRef({ x: -100, y: -100 });
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
  const slicedRef = useRef(0);
  const lastCutAtRef = useRef(-10);
  const startAtRef = useRef(0);
  const nextIdRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const bombOnScreenRef = useRef(false);
  const resultsRef = useRef<ResultItem[]>([]);
  const savedRef = useRef(false);
  const shakeUntilRef = useRef(0);

  const pool = useMemo(() => BUILTIN_CHARACTERS[tier as 1 | 2 | 3], [tier]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // 60 秒倒计时驱动 HUD
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
    savedRef.current = true;
    api("/api/garden-records", {
      method: "POST",
      body: JSON.stringify({
        childId: currentChild.id,
        activity: "fruit-slice",
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
    setDoneScore(scoreRef.current);
    setBestCombo(bestComboRef.current);
    setSlicedCount(slicedRef.current);
    setPhase("done");
    speak(PRAISE_OVER[Math.floor(Math.random() * PRAISE_OVER.length)], "xiaoyi", EXCITED_TONE);
  }

  const start = async (m: InputMode) => {
    setMode(m);
    setPhase("loading");
    setError("");
    try {
      stopStream();
      const landmarker = await getHandLandmarker();
      if (m === "camera") {
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
        // 摄像头不行就退回鼠标/手指，不让游戏玩不上
        toast(describeGameError(e), "warning");
        setHint("没有启用摄像头，试试用手指或鼠标在屏幕上滑动切水果吧");
        start("mouse");
      } else {
        setError(describeGameError(e));
        setPhase("intro");
      }
    }
     
  };

  function resetRound() {
    fruitsRef.current = [];
    juiceRef.current = [];
    floatsRef.current = [];
    trailRef.current = [];
    bladeRef.current = null;
    resultsRef.current = [];
    scoreRef.current = 0;
    comboRef.current = 0;
    bestComboRef.current = 0;
    slicedRef.current = 0;
    lastCutAtRef.current = -10;
    lastSpawnRef.current = 0;
    bombOnScreenRef.current = false;
    savedRef.current = false;
    setScore(0);
    setCombo(0);
    setTimeLeft(GAME_SECONDS);
  }

  // ---------- 更新循环 ----------

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

    // 手部关键点 → 刀尖（低通滤波压抖动）
    if (modeRef.current === "camera" && video && video.readyState >= 2) {
      const res = landmarker.detectForVideo(video, now);
      if (res.landmarks.length > 0) {
        const tip = res.landmarks[0][8]; // 食指尖
        const smooth = lowPass(lastSmoothRef.current, tip, 0.45);
        lastSmoothRef.current = smooth;
        cursorRef.current = videoToScreen(smooth, w, h, video.videoWidth, video.videoHeight);
        handRef.current = res.landmarks[0];
        handVisibleRef.current = true;
      } else {
        handVisibleRef.current = false;
        lastSmoothRef.current = null;
      }
    }

    update(dt, w, h, now);
    draw(ctx, w, h, now, video);
  }

  function videoToScreen(p: PointLike, w: number, h: number, vw: number, vh: number) {
    const s = Math.max(w / vw, h / vh);
    const dw = vw * s;
    const dh = vh * s;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    // 画面水平翻转（镜像）+ 裁剪对齐到画布
    return { x: w - (dx + p.x * dw), y: dy + p.y * dh };
  }

  function update(dt: number, w: number, h: number, now: number) {
    const t = now / 1000;
    // 生成水果
    const inView = fruitsRef.current.filter((f) => !f.dead).length;
    if (t - lastSpawnRef.current > 0.8 && inView < MAX_ITEMS) {
      lastSpawnRef.current = t;
      spawnFruit(w, h);
    }

    for (const f of fruitsRef.current) {
      if (f.dead) continue;
      f.vy += 640 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
      if (f.sliceAt === undefined && f.y > h + f.r * 2) f.dead = true;
    }

    // 果汁粒子
    for (const j of juiceRef.current) {
      j.vy += 900 * dt;
      j.x += j.vx * dt;
      j.y += j.vy * dt;
    }
    juiceRef.current = juiceRef.current.filter((j) => j.y < h + 40);
    floatsRef.current = floatsRef.current.filter((ft) => t - ft.born < 1.4);

    // 刀光轨迹 + 切割判定（线段与圆碰撞）
    const blade = bladeRef.current;
    const cur = cursorRef.current;
    if (blade) {
      const segLen = Math.hypot(cur.x - blade.x, cur.y - blade.y);
      if (segLen > 0) {
        const speed = segLen / Math.max(dt, 0.001);
        if (speed > 240 || segLen > 14) {
          for (const f of fruitsRef.current) {
            if (f.dead || f.sliceAt !== undefined) continue;
            if (segDist(blade, cur, f.x, f.y) < f.r + 6) {
              if (f.bomb) explodeBomb(f, now);
              else cutFruit(f, now, blade, cur);
            }
          }
        }
      }
    }
    trailRef.current.push({ x: cur.x, y: cur.y, t: now });
    trailRef.current = trailRef.current.filter((p) => now - p.t < 200);
    bladeRef.current = { x: cur.x, y: cur.y, t: now };

    // 清理：落地或切开后 0.9s
    fruitsRef.current = fruitsRef.current.filter(
      (f) => f.sliceAt === undefined ? !f.dead : t - f.sliceAt < 0.9
    );
  }

  function spawnFruit(w: number, h: number) {
    const bomb = !bombOnScreenRef.current && Math.random() < BOMB_CHANCE;
    const c = bomb ? null : pool[Math.floor(Math.random() * pool.length)];
    const fromSide = Math.random() < 0.3;
    const r = Math.max(46, Math.min(64, Math.min(w, h) * 0.13));
    const emoji = bomb ? "💣" : FRUIT_EMOJIS[Math.floor(Math.random() * FRUIT_EMOJIS.length)];
    const col = bomb
      ? "#4a4a52"
      : FRUIT_COLORS[Math.floor(Math.random() * FRUIT_COLORS.length)];
    let f: Fruit;
    if (fromSide) {
      const left = Math.random() < 0.5;
      f = {
        id: nextIdRef.current++, c, emoji,
        x: left ? -r : w + r,
        y: h * (0.3 + Math.random() * 0.5),
        vx: (left ? 1 : -1) * (340 + Math.random() * 140),
        vy: -(420 + Math.random() * 160),
        r,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 3,
        bomb,
        dead: false,
        col,
      };
    } else {
      f = {
        id: nextIdRef.current++, c, emoji,
        x: w * (0.12 + Math.random() * 0.76),
        y: h + r,
        vx: (Math.random() - 0.5) * 180,
        vy: -(620 + Math.random() * 240),
        r,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 3,
        bomb,
        dead: false,
        col,
      };
    }
    fruitsRef.current.push(f);
    bombOnScreenRef.current = bomb;
  }

  function cutFruit(
    f: Fruit,
    now: number,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) {
    f.sliceAt = now / 1000;
    f.cutAngle = Math.atan2(to.y - from.y, to.x - from.x);
    slicedRef.current++;
    const t = now / 1000;
    if (t - lastCutAtRef.current < 2.5) comboRef.current++;
    else comboRef.current = 1;
    lastCutAtRef.current = t;
    bestComboRef.current = Math.max(bestComboRef.current, comboRef.current);
    scoreRef.current += 10 + (comboRef.current - 1) * 2;
    setScore(scoreRef.current);
    setCombo(comboRef.current > 1 ? comboRef.current : 0);
    // 汁水粒子
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 180;
      juiceRef.current.push({
        x: f.x,
        y: f.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        r: 3 + Math.random() * 5,
        col: f.col,
      });
    }
    if (f.c) {
      floatsRef.current.push({
        x: f.x,
        y: f.y,
        text: `${f.c.char} · ${f.c.pinyin} · ${f.c.word}`,
        born: t,
      });
      resultsRef.current.push({ itemKey: `fs:${f.c.char}`, label: `切中「${f.c.char}」`, correct: true });
      speak(`${f.c.char}，${f.c.word}`, "xiaoyi", EXCITED_TONE);
    }
  }

  function explodeBomb(f: Fruit, now: number) {
    f.sliceAt = now / 1000;
    f.dead = true;
    bombOnScreenRef.current = false;
    comboRef.current = 0;
    setCombo(0);
    scoreRef.current = Math.max(0, scoreRef.current - 10);
    setScore(scoreRef.current);
    shakeUntilRef.current = now + 350;
    resultsRef.current.push({ itemKey: "bomb", label: "炸弹", correct: false });
    // 波及周围水果
    for (const other of fruitsRef.current) {
      if (other === f || other.dead || other.sliceAt !== undefined) continue;
      if (Math.hypot(other.x - f.x, other.y - f.y) < f.r + other.r + 30) {
        other.sliceAt = now / 1000;
      }
    }
    speak("哎呀，炸弹！", "xiaoyi", SORRY_TONE);
  }

  function draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    now: number,
    video: HTMLVideoElement | null
  ) {
    const t = now / 1000;
    // 背景：摄像头画面（弱化显示）或天空渐变
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
      ctx.fillStyle = "rgba(20,30,60,0.52)";
      ctx.fillRect(0, 0, w, h);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#9fd8f5");
      g.addColorStop(0.6, "#cdeefb");
      g.addColorStop(1, "#f3f7e2");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // 镜头震动（切炸弹）
    ctx.save();
    if (now < shakeUntilRef.current) {
      ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    }

    for (const f of fruitsRef.current) {
      if (f.sliceAt !== undefined) drawHalf(ctx, f, t);
      else drawWhole(ctx, f);
    }

    // 果汁
    ctx.globalAlpha = 0.85;
    for (const j of juiceRef.current) {
      ctx.fillStyle = j.col;
      ctx.beginPath();
      ctx.arc(j.x, j.y, j.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 漂浮文字（拼音 + 组词）
    ctx.textAlign = "center";
    for (const ft of floatsRef.current) {
      const age = (t - ft.born) / 1.4;
      ctx.globalAlpha = 1 - age;
      const fs = 15 + age * 5;
      ctx.font = `800 ${fs}px sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(40,30,10,0.6)";
      ctx.lineWidth = 4;
      ctx.strokeText(ft.text, ft.x, ft.y - 30 - age * 60);
      ctx.fillText(ft.text, ft.x, ft.y - 30 - age * 60);
      ctx.globalAlpha = 1;
    }

    // 刀光轨迹
    const trail = trailRef.current;
    if (trail.length > 1) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < trail.length; i++) {
        const a = i / trail.length;
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.95})`;
        ctx.lineWidth = 2 + a * 9;
        ctx.shadowColor = "rgba(255,200,80,0.9)";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    // 手部骨架反馈（摄像头模式）
    if (modeRef.current === "camera") {
      if (handVisibleRef.current && handRef.current) {
        drawHandSkeleton(ctx, handRef.current, w, h);
      } else {
        const msg = "把手放到摄像头前，划动就开始切";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 4;
        ctx.font = "700 16px sans-serif";
        ctx.strokeText(msg, w / 2, h * 0.14);
        ctx.fillText(msg, w / 2, h * 0.14);
      }
    }
    ctx.restore();
  }

  function drawWhole(ctx: CanvasRenderingContext2D, f: Fruit) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    ctx.fillStyle = f.col;
    ctx.beginPath();
    ctx.arc(0, 0, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = `${Math.round(f.r * 0.9)}px serif`;
    ctx.textAlign = "center";
    ctx.fillText(f.emoji, 0, -f.r * 0.32);
    if (f.c) {
      const bw = Math.max(44, f.r);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      roundRect(ctx, -bw / 2, f.r * 0.28 - 2, bw, f.r * 0.62, 12);
      ctx.fill();
      ctx.fillStyle = "#43311f";
      ctx.font = `900 ${Math.round(f.r * 0.5)}px sans-serif`;
      ctx.fillText(f.c.char, 0, f.r * 0.72);
    }
    ctx.restore();
  }

  function drawHalf(ctx: CanvasRenderingContext2D, f: Fruit, t: number) {
    const age = t - f.sliceAt!;
    const dir = f.cutAngle ?? 0;
    // 两个半圆沿切割方向平移分开，逐渐淡出
    for (const sign of [-1, 1]) {
      const off = sign * (1 + age * 60);
      const cx = f.x + Math.cos(dir + Math.PI / 2) * off;
      const cy = f.y + Math.sin(dir + Math.PI / 2) * off;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(f.rot);
      ctx.globalAlpha = Math.max(0, 1 - age * 1.1);
      ctx.beginPath();
      ctx.arc(0, 0, f.r, sign === -1 ? 0 : Math.PI, sign === -1 ? Math.PI : Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = f.col;
      ctx.fill();
      ctx.clip();
      ctx.font = `${Math.round(f.r * 0.9)}px serif`;
      ctx.textAlign = "center";
      ctx.fillText(f.emoji, 0, -f.r * 0.32);
      if (f.c) {
        ctx.fillStyle = "#43311f";
        ctx.font = `900 ${Math.round(f.r * 0.5)}px sans-serif`;
        ctx.fillText(f.c.char, 0, f.r * 0.72);
      }
      ctx.restore();
    }
  }

  // ---------- 指针输入（鼠标/手指） ----------

  function onPointerMove(e: React.PointerEvent) {
    if (phaseRef.current !== "playing" || modeRef.current !== "mouse") return;
    const rect = fieldRef.current!.getBoundingClientRect();
    cursorRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ---------- 渲染 ----------

  return (
    <div className="fixed inset-0 z-50 bg-[#0e1b33] overflow-hidden">
      {/* 检测用隐藏视频（摄像头模式） */}
      <video ref={videoRef} playsInline muted className="hidden" />
      <div
        ref={fieldRef}
        className="absolute inset-0"
        style={{ touchAction: "none" }}
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
              <div className="mt-2 px-3 py-1.5 rounded-xl bg-black/40 text-white/90 text-xs max-w-44">{hint}</div>
            )}
          </div>
        </div>
      )}

      {/* 开始界面 */}
      {(phase === "intro" || phase === "loading") && (
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-gradient-to-b from-[#87ceeb] via-[#bfe6f5] to-[#f3f7e2]">
          <div
            className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-md max-h-full overflow-y-auto"
            style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="text-5xl">🍉</div>
              <div>
                <p className="text-2xl font-black text-gray-800">切水果认汉字</p>
                <p className="text-sm text-gray-500 mt-1">手一挥切开水果，字就念给你听！小心炸弹💣</p>
              </div>
              <div className="w-full text-left">
                <p className="text-sm font-bold text-gray-800 mb-2">选择字库难度</p>
                <Radio
                  value={String(tier)}
                  onChange={(v) => setTier(Number(v) as 1 | 2 | 3)}
                  direction="vertical"
                  options={DIFF_TIERS.map((d) => ({ label: d.label, value: String(d.tier) }))}
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
                📷 开启摄像头开玩
              </Button>
              <Button
                size="large"
                disabled={phase === "loading"}
                onClick={() => start("mouse")}
                className="w-full"
              >
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
            <div className="text-4xl tracking-widest">
              {RatingStars(doneScore)}
            </div>
            <p className="text-2xl font-black mt-2 text-gray-800">
              {doneScore >= 300 ? "汉字小达人！" : doneScore >= 150 ? "切得好棒！" : "继续加油，再试一次！"}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <Stat label="得分" value={String(doneScore)} />
              <Stat label="切中" value={`${slicedCount} 个`} />
              <Stat label="最多连击" value={`x${Math.max(1, bestCombo)}`} />
            </div>
            <p className="text-xs text-gray-500 mt-3">
              切过的字都在学习记录里，回合时长 {formatDuration(GAME_SECONDS)}，切到炸弹会被扣分哦
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

function RatingStars(score: number): React.ReactNode {
  const n = score >= 300 ? 3 : score >= 150 ? 2 : score >= 60 ? 1 : 0;
  return (
    <>
      {"⭐".repeat(n)}
      <span style={{ opacity: 0.25 }}>{"⭐".repeat(3 - n)}</span>
    </>
  );
}

/** 点到线段的最短距离 */
function segDist(a: { x: number; y: number }, b: { x: number; y: number }, cx: number, cy: number): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((cx - a.x) * dx + (cy - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(cx - (a.x + t * dx), cy - (a.y + t * dy));
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-amber-50 py-3 px-2">
      <div className="text-xl font-black text-gray-800">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
