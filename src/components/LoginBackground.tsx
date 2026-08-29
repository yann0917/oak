"use client";

import { useEffect, useRef } from "react";

/* 动森风登录背景：云/太阳/气球/落叶/小花全部带鼠标视差，蝴蝶会躲开鼠标 */

const BUTTERFLIES = [
  { bx: 0.22, by: 0.3, color: "#19c8b9", wing: "#8fe6dc", size: 36 },
  { bx: 0.72, by: 0.24, color: "#f8a6b2", wing: "#fbcfd5", size: 30 },
];

const CLOUDS = [
  { top: "9vh", size: 140, duration: 90, delay: -30, depth: 14 },
  { top: "24vh", size: 100, duration: 120, delay: -80, depth: 20 },
  { top: "15vh", size: 170, duration: 75, delay: -55, depth: 10 },
];

const BALLOONS = [
  { left: "11vw", top: "32vh", size: 56, color: "#f7cd67", duration: 5, delay: 0, depth: 26 },
  { left: "86vw", top: "52vh", size: 46, color: "#f8a6b2", duration: 6, delay: -2.4, depth: 32 },
  { left: "20vw", top: "62vh", size: 40, color: "#82d5bb", duration: 5.5, delay: -1.2, depth: 20 },
];

const LEAVES = [
  { left: "18vw", size: 26, duration: 30, delay: -6, depth: 12, color: "#8ac68a" },
  { left: "48vw", size: 20, duration: 38, delay: -22, depth: 16, color: "#d1da49" },
  { left: "72vw", size: 30, duration: 34, delay: -14, depth: 10, color: "#82d5bb" },
  { left: "90vw", size: 22, duration: 42, delay: -32, depth: 14, color: "#8ac68a" },
];

const SPARKLES = [
  { left: "8vw", top: "12vh", size: 16, duration: 3.2, delay: 0 },
  { left: "38vw", top: "7vh", size: 12, duration: 4.1, delay: -1.2 },
  { left: "63vw", top: "36vh", size: 14, duration: 3.6, delay: -2.1 },
  { left: "92vw", top: "20vh", size: 12, duration: 4.6, delay: -0.6 },
];

const FLOWERS = [
  { left: "6vw", bottom: "16vh", size: 34, depth: 8 },
  { left: "93vw", bottom: "26vh", size: 28, depth: 12 },
  { left: "48vw", bottom: "9vh", size: 24, depth: 6 },
];

function Cloud({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.55} viewBox="0 0 120 66" aria-hidden>
      <g fill="#ffffff" opacity="0.92">
        <circle cx="32" cy="42" r="18" />
        <circle cx="58" cy="32" r="24" />
        <circle cx="88" cy="42" r="18" />
        <rect x="22" y="38" width="76" height="20" rx="10" />
      </g>
      <circle cx="58" cy="44" r="16" fill="#eef4f8" opacity="0.9" />
    </svg>
  );
}

function Balloon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size * 1.7} viewBox="0 0 60 102" aria-hidden>
      <ellipse cx="30" cy="28" rx="21" ry="25" fill={color} />
      <ellipse cx="23" cy="20" rx="6" ry="9" fill="#ffffff" opacity="0.45" />
      <path d="M26 51 L34 51 L30 58 Z" fill={color} />
      <path d="M30 58 q 9 20 -4 40" stroke="#c9b99a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Leaf({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M16 2 C 26 10, 26 22, 16 30 C 6 22, 6 10, 16 2 Z" fill={color} opacity="0.9" />
      <path d="M16 7 L16 27" stroke="#ffffff" strokeWidth="1.6" opacity="0.6" strokeLinecap="round" />
    </svg>
  );
}

function Butterfly({ color, wing, size }: { color: string; wing: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <g style={{ transformBox: "fill-box", transformOrigin: "100% 50%" }} className="ai-anim" >
        <ellipse cx="10" cy="14" rx="8" ry="11" fill={color} opacity="0.92" style={{ transformBox: "fill-box", transformOrigin: "100% 50%", animation: "ai-flap-l 0.5s ease-in-out infinite" }} />
        <circle cx="9" cy="20" r="4" fill={wing} style={{ transformBox: "fill-box", transformOrigin: "100% 50%", animation: "ai-flap-l 0.5s ease-in-out infinite" }} />
      </g>
      <g style={{ transformBox: "fill-box", transformOrigin: "0% 50%" }} className="ai-anim">
        <ellipse cx="30" cy="14" rx="8" ry="11" fill={color} opacity="0.92" style={{ transformBox: "fill-box", transformOrigin: "0% 50%", animation: "ai-flap-r 0.5s ease-in-out infinite" }} />
        <circle cx="31" cy="20" r="4" fill={wing} style={{ transformBox: "fill-box", transformOrigin: "0% 50%", animation: "ai-flap-r 0.5s ease-in-out infinite" }} />
      </g>
      <ellipse cx="20" cy="20" rx="2.6" ry="9" fill="#794f27" />
      <path d="M18 12 q -4 -6 -7 -7 M22 12 q 4 -6 7 -7" stroke="#794f27" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Flower({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse
          key={deg}
          cx="20"
          cy="11"
          rx="5.5"
          ry="8"
          fill="#f8a6b2"
          opacity="0.9"
          transform={`rotate(${deg} 20 20)`}
        />
      ))}
      <circle cx="20" cy="20" r="5" fill="#f7cd67" />
    </svg>
  );
}

function Sparkle({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M10 1 L12 8 L19 10 L12 12 L10 19 L8 12 L1 10 L8 8 Z" fill="#f5c31c" />
    </svg>
  );
}

function Sun() {
  return (
    <svg width="130" height="130" viewBox="0 0 100 100" aria-hidden>
      <g stroke="#f5c31c" strokeWidth="4" strokeLinecap="round" opacity="0.7" className="ai-anim" style={{ animation: "ai-spin-slow 46s linear infinite", transformOrigin: "50% 50%" }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <line
            key={i}
            x1="50"
            y1="14"
            x2="50"
            y2="24"
            transform={`rotate(${i * 30} 50 50)`}
          />
        ))}
      </g>
      <circle cx="50" cy="50" r="22" fill="#f7cd67" opacity="0.85" />
      <circle cx="43" cy="44" r="7" fill="#ffffff" opacity="0.4" />
    </svg>
  );
}

export default function LoginBackground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const butterflyRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sim = useRef({
    mx: 0,
    my: 0,
    tx: 0,
    ty: 0,
    px: -9999,
    py: -9999,
    flies: [] as { x: number; y: number; vx: number; vy: number }[],
  });

  useEffect(() => {
    const s = sim.current;
    s.flies = BUTTERFLIES.map((b) => ({
      x: b.bx * window.innerWidth,
      y: b.by * window.innerHeight,
      vx: 0,
      vy: 0,
    }));

    const onMove = (e: PointerEvent) => {
      s.tx = (e.clientX / window.innerWidth) * 2 - 1;
      s.ty = (e.clientY / window.innerHeight) * 2 - 1;
      s.px = e.clientX;
      s.py = e.clientY;
    };
    const onLeave = () => {
      s.px = -9999;
      s.py = -9999;
    };

    let raf = 0;
    const loop = (t: number) => {
      // 视差量平滑趋近目标
      s.mx += (s.tx - s.mx) * 0.05;
      s.my += (s.ty - s.my) * 0.05;
      const root = rootRef.current;
      if (root) {
        root.style.setProperty("--mx", s.mx.toFixed(4));
        root.style.setProperty("--my", s.my.toFixed(4));
      }
      // 蝴蝶：漫游 + 回巢 + 躲鼠标
      BUTTERFLIES.forEach((b, i) => {
        const bf = s.flies[i];
        const el = butterflyRefs.current[i];
        if (!bf || !el) return;
        bf.vx += Math.sin(t / 900 + i * 2.4) * 0.028;
        bf.vy += Math.cos(t / 1150 + i * 1.8) * 0.026;
        bf.vx += (b.bx * window.innerWidth - bf.x) * 0.0016;
        bf.vy += (b.by * window.innerHeight - bf.y) * 0.0016;
        const dx = bf.x - s.px;
        const dy = bf.y - s.py;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 160) {
          const f = ((160 - d) / 160) * 2.2;
          bf.vx += (dx / d) * f;
          bf.vy += (dy / d) * f;
        }
        bf.vx *= 0.94;
        bf.vy *= 0.94;
        bf.x += bf.vx;
        bf.y += bf.vy;
        bf.x = Math.max(24, Math.min(window.innerWidth - 24, bf.x));
        bf.y = Math.max(24, Math.min(window.innerHeight - 24, bf.y));
        el.style.transform = `translate3d(${bf.x - 20}px, ${bf.y - 20}px, 0) rotate(${Math.max(-24, Math.min(24, bf.vx * 8))}deg) scaleX(${bf.vx < 0 ? -1 : 1})`;
      });
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  const parallax = (dx: number, dy: number) => ({
    transform: `translate3d(calc(var(--mx, 0) * ${dx}px), calc(var(--my, 0) * ${dy}px), 0)`,
  });

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* 太阳 */}
      <div className="absolute" style={{ right: "6vw", top: "7vh", ...parallax(7, 5) }}>
        <Sun />
      </div>

      {/* 云朵：视差 + 横向漂移 */}
      {CLOUDS.map((c, i) => (
        <div key={i} className="absolute" style={{ top: c.top, left: 0, ...parallax(c.depth, c.depth * 0.5) }}>
          <div
            className="ai-anim"
            style={{ animation: `ai-drift ${c.duration}s linear ${c.delay}s infinite` }}
          >
            <Cloud size={c.size} />
          </div>
        </div>
      ))}

      {/* 气球：视差 + 上下飘 */}
      {BALLOONS.map((b, i) => (
        <div key={i} className="absolute" style={{ left: b.left, top: b.top, ...parallax(b.depth, b.depth * 0.7) }}>
          <div
            className="ai-anim"
            style={{ animation: `ai-bob ${b.duration}s ease-in-out ${b.delay}s infinite` }}
          >
            <Balloon size={b.size} color={b.color} />
          </div>
        </div>
      ))}

      {/* 落叶：下落 + 左右摇摆（外层下落、内层摇摆、外层视差） */}
      {LEAVES.map((l, i) => (
        <div key={i} className="absolute" style={{ left: l.left, top: 0, ...parallax(l.depth, l.depth) }}>
          <div
            className="ai-anim"
            style={{ animation: `ai-fall ${l.duration}s linear ${l.delay}s infinite` }}
          >
            <div
              className="ai-anim"
              style={{ animation: `ai-sway ${2.8 + i * 0.4}s ease-in-out infinite` }}
            >
              <Leaf size={l.size} color={l.color} />
            </div>
          </div>
        </div>
      ))}

      {/* 小花 */}
      {FLOWERS.map((f, i) => (
        <div key={i} className="absolute" style={{ left: f.left, bottom: f.bottom, ...parallax(f.depth, f.depth) }}>
          <div className="ai-anim" style={{ animation: `ai-bob ${4 + i}s ease-in-out ${-i}s infinite` }}>
            <Flower size={f.size} />
          </div>
        </div>
      ))}

      {/* 闪烁星星 */}
      {SPARKLES.map((sp, i) => (
        <div
          key={i}
          className="absolute ai-anim"
          style={{
            left: sp.left,
            top: sp.top,
            animation: `ai-twinkle ${sp.duration}s ease-in-out ${sp.delay}s infinite`,
          }}
        >
          <Sparkle size={sp.size} />
        </div>
      ))}

      {/* 蝴蝶（鼠标互动） */}
      {BUTTERFLIES.map((b, i) => (
        <div
          key={i}
          ref={(el) => {
            butterflyRefs.current[i] = el;
          }}
          className="absolute left-0 top-0 will-change-transform"
        >
          <Butterfly color={b.color} wing={b.wing} size={b.size} />
        </div>
      ))}
    </div>
  );
}
