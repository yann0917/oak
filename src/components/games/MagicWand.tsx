"use client";

// 魔法棒：轨迹 + 手势两段式状态机。
// 第一步"画圈蓄力"：指尖在空中画出一整圈（轨迹扫描 ≥330°）→ 顶部魔环点亮；
// 第二步"✊ 施放"：收起拳头保持 0.5 秒 → Z 字闪电劈向最近的怪兽。
// 怪兽沿小路逼近城堡，到门口会扣❤️；三批怪兽全部击退才算守城成功。
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "animal-island-ui";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { EXCITED_TONE, SORRY_TONE, speak, useVoiceMuted } from "@/lib/garden/speech";
import {
  describeGameError,
  drawHandSkeleton,
  extendedFingers2d,
  getHandLandmarker,
  lowPass,
  openCamera,
} from "@/lib/games/mediapipe";
import type { PointLike } from "@/lib/games/mediapipe";
import { toast } from "@/lib/toast";

type Phase = "intro" | "loading" | "playing" | "done";
type Stage = "charge" | "cast";

const CYCLE = 6; // 怪兽批数（每批 3 只）
const WAND_R = 92; // 魔环半径
const CHARGE_TARGET = 330; // 画圈扫过的角度（度）
const CAST_HOLD_MS = 500; // 握拳保持时长
const MONSTER_EMOJIS = ["👾", "🐙", "🥶", "🦖", "🧟", "👻", "🤖", "🌵", "🐲"];

interface Monster {
  id: number;
  emoji: string;
  x: number; // 归一化 0~1，向左走（靠近城堡）
  hp: number;
  dead: boolean;
  deadUntil: number;
  lastTick?: number;
}

interface ZapFx {
  tx: number;
  ty: number;
  mx: number;
  my: number;
  born: number;
}

export default function MagicWand() {
  const router = useRouter();
  const { currentChild } = useChildren();
  const [voiceMuted, setVoiceMuted] = useVoiceMuted();

  const [phase, setPhase] = useState<Phase>("intro");
  const [mode, setMode] = useState<"camera" | "mouse" | null>(null);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<Stage>("charge");
  const [sweepPct, setSweepPct] = useState(0); // 蓄力进度 0~1
  const [batch, setBatch] = useState(1);
  const [kills, setKills] = useState(0);
  const [casted, setCasted] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [zapFlash, setZapFlash] = useState(0); // 闪电动画 nonce
  const [handOpen, setHandOpen] = useState<number | null>(null); // 张开度显示
  const [doneStats, setDoneStats] = useState({ kills: 0, casted: 0, win: false });

  const fieldRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const loopTokenRef = useRef(0);

  const phaseRef = useRef<Phase>("intro");
  const modeRef = useRef<"camera" | "mouse" | null>(null);
  const lastNowRef = useRef(0);
  const cursorRef = useRef({ x: -100, y: -100 });
  const lastSmoothRef = useRef<PointLike | null>(null);
  const handRef = useRef<PointLike[] | null>(null);
  const handVisibleRef = useRef(false);
  const stageRef = useRef<Stage>("charge");
  const pathRef = useRef<{ x: number; y: number }[]>([]);
  const sweepRef = useRef(0);
  const chargedRef = useRef(false);
  const closedSinceRef = useRef<number | null>(null);
  const monstersRef = useRef<Monster[]>([]);
  const zapRef = useRef<ZapFx | null>(null);
  const nextIdRef = useRef(0);
  const batchRef = useRef(1);
  const killsRef = useRef(0);
  const castedRef = useRef(0);
  const heartsRef = useRef(3);
  const savedRef = useRef(false);
  const resultsRef = useRef<{ itemKey: string; label: string; correct: boolean }[]>([]);
  const handOpenRef = useRef<number | null>(null); // 最新张开度（循环内读）

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

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
    if (resultsRef.current.length === 0) return;
    savedRef.current = true;
    api("/api/garden-records", {
      method: "POST",
      body: JSON.stringify({
        childId: currentChild.id,
        activity: "magic-wand",
        difficulty: "简单",
        durationSec: 60,
        results: resultsRef.current,
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentChild]);

  const start = async (m: "camera" | "mouse") => {
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
      // 开局：三批怪兽
      batchRef.current = 1;
      killsRef.current = 0;
      castedRef.current = 0;
      heartsRef.current = 3;
      resultsRef.current = [];
      savedRef.current = false;
      spawnBatch();
      setBatch(1);
      setKills(0);
      setCasted(0);
      setHearts(3);
      setStage("charge");
      stageRef.current = "charge";
      setSweepPct(0);
      sweepRef.current = 0;
      chargedRef.current = false;
      pathRef.current = [];
      setPhase("playing");
      const token = ++loopTokenRef.current;
      phaseRef.current = "playing";
      rafRef.current = requestAnimationFrame((t) => loop(t, landmarker, token));
      speak("魔法棒！在空中画圈蓄力，握拳施放！", "xiaoyi");
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

  function spawnBatch() {
    monstersRef.current = [];
    const batchIdx = batchRef.current - 1;
    for (let i = 0; i < 3; i++) {
      monstersRef.current.push({
        id: nextIdRef.current++,
        emoji: MONSTER_EMOJIS[(batchIdx * 3 + i) % MONSTER_EMOJIS.length],
        x: 0.92 - i * 0.16, // 右侧排队往左走
        hp: 1,
        dead: false,
        deadUntil: 0,
      });
    }
  }

  function finishRound(win: boolean) {
    if (phaseRef.current !== "playing") return;
    setDoneStats({ kills: killsRef.current, casted: castedRef.current, win });
    setPhase("done");
    phaseRef.current = "done";
    speak(
      win ? "守城成功！魔法棒大显神威！" : "城堡还有点危险，再练一次魔法棒吧！",
      "xiaoyi",
      win ? EXCITED_TONE : SORRY_TONE
    );
  }

  function onKill(m: Monster) {
    killsRef.current++;
    castedRef.current++;
    setKills(killsRef.current);
    setCasted(castedRef.current);
    resultsRef.current.push({
      itemKey: `mw:kill:${m.id}`,
      label: `击退${m.emoji}`,
      correct: true,
    });
    speak("咔嚓！闪电击退怪兽！", "xiaoyi", EXCITED_TONE);
  }

  function onMiss() {
    castedRef.current++;
    setCasted(castedRef.current);
    resultsRef.current.push({ itemKey: "mw:miss", label: "空放魔法", correct: false });
    speak("没有打中，先画圈瞄准最近的那只！", "xiaoyi", SORRY_TONE);
  }

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
    const w = field.clientWidth;
    const h = field.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 输入：食指尖（镜像映射）或指针
    if (modeRef.current === "camera" && video && video.readyState >= 2) {
      try {
        const res = landmarker.detectForVideo(video, now);
        if (res.landmarks.length > 0) {
          const tip = res.landmarks[0][8];
          const smooth = lowPass(lastSmoothRef.current, tip, 0.45);
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
          handVisibleRef.current = true;
          const open = extendedFingers2d(res.landmarks[0]);
          handOpenRef.current = open;
          setHandOpen((prev) => (prev === open ? prev : open));
        } else {
          handVisibleRef.current = false;
          lastSmoothRef.current = null;
          handRef.current = null;
          handOpenRef.current = null;
          setHandOpen((prev) => (prev === null ? prev : null));
        }
      } catch (e) {
        console.warn("[magic-wand] 识别帧异常", e);
      }
    }

    update(now, dt, w, h);
    draw(ctx, w, h, now, video);
  }

  function update(now: number, dt: number, w: number, h: number) {
    const t = now / 1000;
    // 怪兽前进（x 归一化坐标向左，约 20 秒走到城门）
    for (const m of monstersRef.current) {
      if (m.dead) continue;
      m.x -= 0.043 * dt;
    }
    // 到达城堡门口 → 扣心
    for (const m of monstersRef.current) {
      if (m.dead) continue;
      if (m.x < 0.06) {
        m.dead = true;
        m.deadUntil = t;
        heartsRef.current--;
        setHearts(heartsRef.current);
        speak("啊噢，怪兽跑到门口啦！", "xiaoyi", SORRY_TONE);
        if (heartsRef.current <= 0) {
          finishRound(false);
          return;
        }
      }
    }
    // 全部击退 → 下一批 or 胜利
    const alive = monstersRef.current.filter((m) => !m.dead).length;
    if (alive === 0) {
      if (batchRef.current >= CYCLE) {
        finishRound(true);
        return;
      }
      batchRef.current++;
      setBatch(batchRef.current);
      spawnBatch();
    }

    if (stageRef.current === "charge") {
      // 画圈蓄力：窗口内轨迹扫过的总角度
      const cur = cursorRef.current;
      const path = pathRef.current;
      const last = path[path.length - 1];
      if (!last || Math.hypot(cur.x - last.x, cur.y - last.y) > 8) {
        path.push({ x: cur.x, y: cur.y });
        if (path.length > 90) path.shift();
      }
      if (path.length > 12) {
        const cx = path.reduce((s, p) => s + p.x, 0) / path.length;
        const cy = path.reduce((s, p) => s + p.y, 0) / path.length;
        const radius = Math.hypot(path[path.length - 1].x - cx, path[path.length - 1].y - cy);
        let sweep = 0;
        let prev: number | null = null;
        for (const p of path) {
          const a = Math.atan2(p.y - cy, p.x - cx);
          if (prev !== null) {
            let d = a - prev;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            sweep += Math.abs(d);
          }
          prev = a;
        }
        const deg = (sweep * 180) / Math.PI;
        if (radius > 40 && deg > CHARGE_TARGET && !chargedRef.current) {
          chargedRef.current = true;
          setStage("cast");
          stageRef.current = "cast";
          pathRef.current = [];
          setSweepPct(1);
          speak("蓄力完成！握拳施放！", "xiaoyi", EXCITED_TONE);
        } else if (!chargedRef.current) {
          const pct = Math.min(0.99, deg / CHARGE_TARGET);
          sweepRef.current = pct;
          setSweepPct((prevPct) => (Math.abs(prevPct - pct) > 0.01 ? pct : prevPct));
        }
      }
    } else {
      // 施放：✊ 按住 0.5s / 鼠标点施放按钮
      const open = handOpenRef.current;
      if (open !== null && open <= 1 && handVisibleRef.current) {
        if (closedSinceRef.current === null) closedSinceRef.current = now;
        if (now - closedSinceRef.current >= CAST_HOLD_MS) {
          closedSinceRef.current = null;
          castZap();
        }
      } else {
        closedSinceRef.current = null;
      }
    }
  }

  function castZap() {
    const monsters = monstersRef.current.filter((m) => !m.dead);
    if (monsters.length === 0) {
      onMiss();
      return;
    }
    // 目标：离城堡（左侧）最近 = x 最小的存活怪兽
    const target = monsters.reduce((a, b) => (a.x < b.x ? a : b));
    const w = fieldRef.current!.clientWidth;
    const h = fieldRef.current!.clientHeight;
    const mPx = { x: target.x * w, y: h * 0.62 };
    const wandPx = { x: w * 0.5, y: h * 0.2 };
    zapRef.current = { tx: wandPx.x, ty: wandPx.y, mx: mPx.x, my: mPx.y, born: performance.now() };
    setZapFlash((n) => n + 1);
    target.hp -= 1;
    target.x += 0.18; // 被击退后退
    if (target.hp <= 0) {
      target.dead = true;
      target.deadUntil = performance.now() / 1000;
      onKill(target);
    } else {
      castedRef.current++;
      setCasted(castedRef.current);
    }
    // 施放后重新蓄力
    setStage("charge");
    stageRef.current = "charge";
    setSweepPct(0);
    sweepRef.current = 0;
    chargedRef.current = false;
    pathRef.current = [];
  }

  // ---------- 绘制 ----------

  function draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    now: number,
    video: HTMLVideoElement | null
  ) {
    const t = now / 1000;
    // 夜空渐变
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1b2450");
    g.addColorStop(0.65, "#2b3a7a");
    g.addColorStop(1, "#14203f");
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
      ctx.fillStyle = "rgba(15,20,50,0.55)";
      ctx.fillRect(0, 0, w, h);
    }

    // 城堡（左侧门口）
    ctx.textAlign = "center";
    ctx.font = `${Math.round(h * 0.13)}px serif`;
    ctx.fillText("🏰", w * 0.05, h * 0.72);

    // 小路
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 14]);
    ctx.beginPath();
    ctx.moveTo(w * 0.06, h * 0.62);
    ctx.lineTo(w * 0.97, h * 0.62);
    ctx.stroke();
    ctx.setLineDash([]);

    // 怪兽
    for (const m of monstersRef.current) {
      if (m.dead) continue;
      const bounce = Math.sin(t * 5 + m.id) * 6;
      const px = m.x * w;
      const py = h * 0.62 + bounce - h * 0.06;
      ctx.font = `${Math.round(h * 0.11)}px serif`;
      ctx.fillText(m.emoji, px, py);
      // 血条
      ctx.fillStyle = "rgba(255,80,80,0.9)";
      ctx.fillRect(px - 18, py - h * 0.115, 36, 5);
    }

    // 魔环（右上）——蓄力进度
    const cx = w * 0.5;
    const cy = h * 0.2;
    ctx.beginPath();
    ctx.arc(cx, cy, WAND_R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,228,102,0.35)";
    ctx.lineWidth = 10;
    ctx.stroke();
    if (sweepPct > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, WAND_R, -Math.PI / 2, -Math.PI / 2 + sweepPct * Math.PI * 2);
      ctx.strokeStyle = sweepPct >= 1 ? "#7bed7b" : "#ffd94d";
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.stroke();
    }
    ctx.font = "700 15px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(
      stageRef.current === "charge"
        ? sweepPct > 0 ? `蓄力 ${Math.round(sweepPct * 100)}%（画一整圈）` : "在空中画一个大圈"
        : "✊ 握拳施放！",
      cx,
      cy + WAND_R + 24
    );

    // 闪电（Z 字形）
    const zap = zapRef.current;
    if (zap) {
      const age = (now - zap.born) / 600;
      if (age < 1) {
        ctx.globalAlpha = 1 - age;
        ctx.strokeStyle = "#ffe066";
        ctx.lineWidth = 6;
        ctx.shadowColor = "#ffe066";
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.moveTo(zap.tx, zap.ty);
        const segs = 6;
        for (let i = 1; i <= segs; i++) {
          const x = zap.tx + ((zap.mx - zap.tx) * i) / segs;
          const y =
            zap.ty + ((zap.my - zap.ty) * i) / segs + (i === segs ? 0 : (i % 2 === 0 ? 1 : -1) * 16);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      } else {
        zapRef.current = null;
      }
    }

    // 手部骨架 / 手势状态
    if (modeRef.current === "camera") {
      if (handVisibleRef.current && handRef.current) {
        drawHandSkeleton(ctx, handRef.current, w, h);
        ctx.font = "700 14px sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillText((handOpenRef.current ?? 3) <= 1 ? "✊ 收拳" : "✋ 张开", w * 0.5, h * 0.9);
      } else {
        ctx.font = "700 15px sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText("把手伸到镜头前画圈", w * 0.5, h * 0.9);
      }
    }
  }

  // ---------- 指针输入 ----------

  function onPointerMove(e: React.PointerEvent) {
    if (phaseRef.current !== "playing" || modeRef.current !== "mouse") return;
    const rect = fieldRef.current!.getBoundingClientRect();
    cursorRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ---------- 渲染 ----------

  const showPreview = phase === "playing";
  return (
    <div className="fixed inset-0 z-50 bg-[#0d1330] overflow-hidden">
      {/* 检测视频常驻挂载 */}
      <video ref={videoRef} playsInline muted className="hidden" />

      <div
        ref={fieldRef}
        className="absolute inset-0"
        style={{ touchAction: "none", cursor: mode === "mouse" ? "crosshair" : undefined }}
        onPointerMove={onPointerMove}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>

      {/* HUD */}
      {phase === "playing" && (
        <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4 pt-3 select-none pointer-events-none">
          <div className="pointer-events-auto flex flex-col gap-2">
            <Pill onClick={() => finishRound(killsRef.current >= CYCLE * 3 ? true : heartsRef.current > 0)}>结束</Pill>
            <Pill onClick={() => setVoiceMuted(!voiceMuted)} ariaLabel={voiceMuted ? "开启语音" : "关闭语音"}>
              {voiceMuted ? "🔇" : "🔊"}
            </Pill>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-white drop-shadow">
              击退 {kills} / {CYCLE * 3}
            </div>
            <div className="mt-1 text-lg tracking-wider" aria-label={`剩余 ${hearts} 颗心`}>
              {"❤️".repeat(Math.max(0, hearts))}
              <span style={{ opacity: 0.25 }}>{"❤️".repeat(Math.max(0, 3 - hearts))}</span>
            </div>
          </div>
          <div className="pointer-events-auto text-right space-y-2">
            <Pill>👾 第 {batch}/{CYCLE} 批</Pill>
            {/* 鼠标模式：施放按钮 */}
            {mode === "mouse" && stage === "cast" && (
              <div
                role="button"
                tabIndex={0}
                onClick={castZap}
                onKeyDown={(e) => e.key === "Enter" && castZap()}
                className="px-6 py-3 rounded-full text-white font-black text-xl bg-gradient-to-b from-amber-400 to-orange-500 shadow-[0_6px_0_#b45f1b] cursor-pointer select-none"
              >
                ⚡ 施放！
              </div>
            )}
          </div>
        </div>
      )}

      {/* 开始/结算 */}
      {(phase === "intro" || phase === "loading") && (
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-gradient-to-b from-[#1b2450] to-[#14203f]">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-md max-h-full overflow-y-auto" style={{ boxShadow: "0 20px 50px rgba(20,25,60,0.5)" }}>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="text-5xl">🪄</div>
              <div>
                <p className="text-2xl font-black text-gray-800">魔法棒</p>
                <p className="text-sm text-gray-500 mt-1">① 在空中画一个大圈蓄力 ② ✊ 握拳闪电击退怪兽，守住城堡！</p>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="primary" size="large" loading={phase === "loading"} onClick={() => start("camera")} className="w-full">
                📷 挥手玩（摄像头）
              </Button>
              <Button size="large" disabled={phase === "loading"} onClick={() => start("mouse")} className="w-full">
                🖱 鼠标 / 手指模式
              </Button>
              <p className="text-xs text-gray-400">画圈时手掌正对镜头，握拳保持 0.5 秒施放</p>
            </div>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-md text-center" style={{ boxShadow: "0 20px 50px rgba(20,25,60,0.6)" }}>
            <div className="text-6xl">{doneStats.win ? "🏆" : "🏯"}</div>
            <p className="text-2xl font-black mt-2 text-gray-800">
              {doneStats.win ? "守城成功！" : "城堡失守…"}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              击退 {doneStats.kills} / {CYCLE * 3} 只怪兽 · 施放 {doneStats.casted} 次魔法
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
