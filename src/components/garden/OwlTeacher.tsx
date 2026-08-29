"use client";

import { useEffect, useRef, useState } from "react";

export type OwlAction = "idle" | "ok" | "great" | "encourage" | "wrong";

/** 各动作播放时长（ms），播完回调 onActionComplete 让父级切回 idle */
const ACTION_MS: Record<OwlAction, number> = {
  idle: Infinity,
  ok: 1300,
  great: 1700,
  encourage: 1900,
  wrong: 1600,
};

interface OwlTeacherProps {
  action?: OwlAction;
  dialogText?: string;
  /** 每次说新话/换动作时 +1：作为 key 让 CSS 动画与气泡重新触发（连续同一动作也能重播） */
  nonce?: number;
  onActionComplete?: (action: OwlAction) => void;
  /** 戳一戳猫头鹰时回调，由父级决定播放什么动作/台词 */
  onPoke?: () => void;
}

/**
 * 学习园地吉祥物"猫头鹰老师"：SVG 手绘 + CSS 关键帧驱动（无需 Lottie 资源即可交互）。
 * - 眼珠跟随鼠标（触屏无鼠标时每隔几秒随机张望）
 * - idle 眨眼呼吸 / ok 点头 / great 拍翅膀冒星星 / encourage 挥翅膀加油 / wrong 摇头闭眼冒问号
 * - 动森风对话气泡 + WebAudio 合成的短促"咕噜"说话音（无音频资源）
 * 将来若用 LottieLab 导出 .lottie/.json（public/animations/owl-*.lottie），
 * 只需把 <svg> 部分换成 Lottie 播放器，Props 与父级接线保持不变。
 */
export default function OwlTeacher({
  action = "idle",
  dialogText,
  nonce = 0,
  onActionComplete,
  onPoke,
}: OwlTeacherProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastMouseRef = useRef(0);
  const [eye, setEye] = useState({ x: 0, y: 0 });

  // 眼球追踪：rAF 节流的 mousemove，位移 clamp 到 [-1, 1]
  useEffect(() => {
    const apply = (clientX: number, clientY: number) => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = (clientX - (rect.left + rect.width / 2)) / 340;
      const dy = (clientY - (rect.top + rect.height / 2)) / 340;
      setEye({
        x: Math.max(-1, Math.min(1, dx)),
        y: Math.max(-1, Math.min(1, dy)),
      });
    };
    const onMouseMove = (e: MouseEvent) => {
      lastMouseRef.current = Date.now();
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        apply(e.clientX, e.clientY);
      });
    };
    // 触屏/静止时随机张望，保持画面有生命感
    const glance = window.setInterval(() => {
      if (Date.now() - lastMouseRef.current < 6000) return;
      setEye({ x: (Math.random() * 2 - 1) * 0.7, y: (Math.random() * 2 - 1) * 0.35 });
    }, 3600);
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.clearInterval(glance);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // 动作播完自动回 idle（idle 不回调）
  useEffect(() => {
    if (action === "idle") return;
    const t = window.setTimeout(() => onActionComplete?.(action), ACTION_MS[action]);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, nonce]);

  // 气泡出现时来一声短促的"动森语"
  useEffect(() => {
    if (!dialogText) return;
    try {
      const Ctx =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      audioRef.current ??= new Ctx();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const t0 = ctx.currentTime;
      [0, 0.09].forEach((off, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 640 + Math.random() * 300 + i * 150;
        gain.gain.setValueAtTime(0.0001, t0 + off);
        gain.gain.exponentialRampToValueAtTime(0.045, t0 + off + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.07);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + off);
        osc.stop(t0 + off + 0.1);
      });
    } catch {
      // 音频不可用（如无用户手势）时静默跳过
    }
  }, [dialogText, nonce]);

  const poke = () => {
    // 戳一戳猫头鹰：由父级决定播放什么（台词 + 动作）
    lastMouseRef.current = Date.now();
    onPoke?.();
  };

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute bottom-2 right-2 sm:bottom-8 sm:right-10 z-[5] flex flex-col items-center select-none"
    >
      {dialogText && (
        <div key={`b${nonce}`} className="owl-bubble mb-1.5 mr-6">
          {dialogText}
          <i className="owl-bubble-tail owl-bubble-tail-outer" />
          <i className="owl-bubble-tail owl-bubble-tail-inner" />
        </div>
      )}
      <div
        className="pointer-events-auto cursor-pointer"
        style={{
          transform: `translate(${eye.x * 6}px, ${eye.y * 4}px) rotate(${eye.x * 3}deg)`,
          transition: "transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        onClick={poke}
        role="presentation"
      >
        <svg
          key={`s${nonce}`}
          className={`owl owl--${action}`}
          width="128"
          height="128"
          viewBox="0 0 140 140"
          aria-hidden
        >
          <g className="owl-all">
            <g className="owl-breathe">
              {/* 爪子 */}
              <ellipse cx="59" cy="127" rx="7.5" ry="4" fill="#eb9f45" />
              <ellipse cx="81" cy="127" rx="7.5" ry="4" fill="#eb9f45" />
              {/* 身体 */}
              <ellipse cx="70" cy="88" rx="35" ry="38" fill="#b98e63" />
              {/* 肚皮 + 绒毛纹 */}
              <ellipse cx="70" cy="97" rx="22" ry="25" fill="#f8efd8" />
              <path d="M60 96 q5 5 10 0" stroke="#e0cfa5" strokeWidth="2" fill="none" strokeLinecap="round" />
              <path d="M70 104 q5 5 10 0" stroke="#e0cfa5" strokeWidth="2" fill="none" strokeLinecap="round" />
              <path d="M62 112 q4 4 8 0" stroke="#e0cfa5" strokeWidth="2" fill="none" strokeLinecap="round" />
              {/* 头部（点头/摇头作用于此组） */}
              <g className="owl-head">
                {/* 耳羽 */}
                <path d="M43 42 L50 22 L59 39 Z" fill="#b98e63" />
                <path d="M97 42 L90 22 L81 39 Z" fill="#b98e63" />
                <ellipse cx="70" cy="55" rx="33" ry="29" fill="#c49a6f" />
                {/* 面盘 */}
                <circle cx="56" cy="56" r="15" fill="#f8efd8" />
                <circle cx="84" cy="56" r="15" fill="#f8efd8" />
                {/* 眼白 + 眼珠（跟随鼠标）+ 高光 + 眼皮（眨眼） */}
                <circle cx="56" cy="55" r="10" fill="#ffffff" />
                <circle cx="84" cy="55" r="10" fill="#ffffff" />
                <g className="owl-pupil" style={{ transform: `translate(${eye.x * 3.6}px, ${eye.y * 2.6}px)` }}>
                  <circle cx="56" cy="55" r="4.8" fill="#4a3728" />
                  <circle cx="54.4" cy="53.2" r="1.7" fill="#ffffff" />
                  <circle cx="84" cy="55" r="4.8" fill="#4a3728" />
                  <circle cx="82.4" cy="53.2" r="1.7" fill="#ffffff" />
                </g>
                <ellipse className="owl-lid" cx="56" cy="55" rx="11" ry="11" fill="#f8efd8" />
                <ellipse className="owl-lid" cx="84" cy="55" rx="11" ry="11" fill="#f8efd8" />
                {/* 喙 */}
                <path d="M70 63 L64.5 69.5 Q70 74 75.5 69.5 Z" fill="#eb9f45" />
              </g>
              {/* 翅膀（拍打/挥舞作用于此） */}
              <ellipse className="owl-wing owl-wing-l" cx="37" cy="93" rx="9.5" ry="21" fill="#a37c55" />
              <ellipse className="owl-wing owl-wing-r" cx="103" cy="93" rx="9.5" ry="21" fill="#a37c55" />
            </g>
          </g>
          {/* great：冒星星 */}
          <polygon
            className="owl-star"
            style={{ ["--sx" as string]: "-16px", ["--sy" as string]: "-22px", animationDelay: "0s" }}
            points="0,-9 2.6,-2.6 9,0 2.6,2.6 0,9 -2.6,2.6 -9,0 -2.6,-2.6"
            fill="#ffd85e"
          />
          <polygon
            className="owl-star"
            style={{ ["--sx" as string]: "18px", ["--sy" as string]: "-26px", animationDelay: "0.12s" }}
            points="0,-7 2,-2 7,0 2,2 0,7 -2,2 -7,0 -2,-2"
            fill="#ff9ec4"
          />
          <polygon
            className="owl-star"
            style={{ ["--sx" as string]: "4px", ["--sy" as string]: "-38px", animationDelay: "0.24s" }}
            points="0,-6 1.8,-1.8 6,0 1.8,1.8 0,6 -1.8,1.8 -6,0 -1.8,-1.8"
            fill="#9edcf2"
          />
          {/* wrong：冒问号 */}
          <text className="owl-q" x="106" y="38" fontSize="30" fontWeight="900" fill="#f4736f" textAnchor="middle">
            ?
          </text>
        </svg>
      </div>
      <style>{OWL_CSS}</style>
    </div>
  );
}

const OWL_CSS = `
.owl-bubble {
  pointer-events: auto;
  position: relative;
  background: #fffdf2;
  color: var(--animal-text-color, #5d4a37);
  border: 3px solid #b08968;
  border-radius: 18px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 6px 18px rgba(61, 52, 40, 0.16);
  animation: owl-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.owl-bubble-tail {
  position: absolute;
  bottom: -11px;
  right: 22px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 12px solid #b08968;
}
.owl-bubble-tail-inner { bottom: -6px; border-top-color: #fffdf2; border-left-width: 6px; border-right-width: 6px; border-top-width: 8px; right: 24px; }
.owl-lid { transform-box: fill-box; transform-origin: 50% 0%; transform: scaleY(0); animation: owl-blink 4.4s ease-in-out infinite; }
.owl-pupil { transition: transform 0.12s ease-out; }
.owl-breathe { transform-box: fill-box; transform-origin: 50% 90%; animation: owl-bob 2.6s ease-in-out infinite; }
.owl-wing { transform-box: fill-box; }
.owl-wing-l { transform-origin: 85% 12%; }
.owl-wing-r { transform-origin: 15% 12%; }
.owl-star { opacity: 0; transform-box: fill-box; }
.owl-q { opacity: 0; }
.owl-all, .owl-head { transform-box: fill-box; transform-origin: 50% 85%; }

/* ok：点头 */
.owl--ok .owl-head { animation: owl-nod 1.2s ease-in-out; }
/* great：拍翅膀 + 冒星星 */
.owl--great .owl-wing-l { animation: owl-flap-l 0.42s ease-in-out 3; }
.owl--great .owl-wing-r { animation: owl-flap-r 0.42s ease-in-out 3; }
.owl--great .owl-star { animation: owl-star-pop 0.95s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
/* encourage：挥右翅 + 蹦跳 */
.owl--encourage .owl-wing-r { animation: owl-wave 0.38s ease-in-out 4; }
.owl--encourage .owl-all { animation: owl-hop 0.46s ease-in-out 2; }
/* wrong：摇头 + 闭眼 + 问号 */
.owl--wrong .owl-head { animation: owl-shake 0.55s ease-in-out 2; }
.owl--wrong .owl-lid { animation: none; transform: scaleY(1); }
.owl--wrong .owl-q { animation: owl-q-bounce 1.5s ease-out both; }

@keyframes owl-blink { 0%, 91%, 100% { transform: scaleY(0); } 94%, 96% { transform: scaleY(1); } }
@keyframes owl-bob { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2.5px) scale(1.015); } }
@keyframes owl-nod { 0%, 100% { transform: translateY(0) rotate(0deg); } 40% { transform: translateY(6px) rotate(8deg); } 70% { transform: translateY(2px) rotate(3deg); } }
@keyframes owl-shake { 0%, 100% { transform: translateX(0) rotate(0deg); } 20% { transform: translateX(-5px) rotate(-6deg); } 40% { transform: translateX(5px) rotate(6deg); } 60% { transform: translateX(-4px) rotate(-4deg); } 80% { transform: translateX(3px) rotate(3deg); } }
@keyframes owl-flap-l { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-58deg); } }
@keyframes owl-flap-r { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(58deg); } }
@keyframes owl-wave { 0%, 100% { transform: rotate(0deg); } 30% { transform: rotate(-78deg); } 55% { transform: rotate(-34deg); } 80% { transform: rotate(-72deg); } }
@keyframes owl-hop { 0%, 100% { transform: translateY(0); } 40%, 60% { transform: translateY(-7px); } }
@keyframes owl-star-pop { 0% { transform: translate(0, 6px) scale(0) rotate(0deg); opacity: 0; } 30% { opacity: 1; } 100% { transform: translate(var(--sx, 0), var(--sy, -24px)) scale(1.15) rotate(24deg); opacity: 0; } }
@keyframes owl-q-bounce { 0% { transform: translateY(10px) scale(0.4); opacity: 0; } 30% { transform: translateY(-4px) scale(1.15); opacity: 1; } 55% { transform: translateY(0) scale(1); } 80% { opacity: 1; } 100% { transform: translateY(-7px); opacity: 0; } }
@keyframes owl-pop { 0% { transform: translateY(10px) scale(0.6); opacity: 0; } 60% { transform: translateY(-3px) scale(1.06); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .owl *, .owl-bubble { animation: none !important; }
}
`;
