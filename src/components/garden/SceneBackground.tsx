"use client";

/**
 * 学习园地全屏场景背景（纯 CSS/SVG 动效，无图片资源）。
 * 配色对齐 animal-island-ui 色板（动森 13 色）：
 *   app-green #8ac68a · app-teal #82d5bb · yellow-green #ecdf52 · lime-green #d1da49
 *   brown #9a835a · app-yellow #f7cd67 · app-orange #e59266 · warm-peach-pink #e18c6f
 *   羊皮纸底 #f7f3df · 暖棕文字 #725d42 —— 整体走暖粉彩而非高饱和卡通色。
 * 动效：白云飘 / 飞鸟振翅 / 湖面游鱼 / 森林摇曳 / ACNH 草地纹理；均用 transform（GPU 友好），
 * 振荡类动画统一 cubic-bezier(0.4, 0, 0.2, 1)，prefers-reduced-motion 时静止。
 */

interface DriftProps {
  top: string;
  duration: number;
  delay: number;
}

export default function SceneBackground() {
  return (
    <div className="garden-scene absolute inset-0 overflow-hidden" aria-hidden>
      {/* 天空：暖调浅蓝，地平线过渡到羊皮纸色 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #a5ddf2 0%, #cdebf6 42%, #ecf5e2 64%, #f6efd0 100%)",
        }}
      />
      {/* 太阳（app-yellow 暖光，轻微呼吸） */}
      <div
        className="absolute rounded-full"
        style={{
          width: 130,
          height: 130,
          right: "10%",
          top: "5%",
          background:
            "radial-gradient(circle, #fff5c2 0%, #f7cd67 55%, rgba(247, 205, 103, 0) 74%)",
          animation: "garden-sun-pulse 5s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        }}
      />
      {/* 白云（奶油白，缓缓飘过） */}
      <Cloud top="9%" size={1} duration={95} delay={-20} />
      <Cloud top="18%" size={0.7} duration={72} delay={-55} />
      <Cloud top="5%" size={0.55} duration={110} delay={-80} />
      <Cloud top="25%" size={0.45} duration={85} delay={-35} />
      {/* 飞鸟（暖棕描边，振翅起伏） */}
      <Bird top="13%" size={1} duration={34} delay={-8} />
      <Bird top="21%" size={0.7} duration={47} delay={-28} />
      <Bird top="9%" size={0.85} duration={40} delay={-19} />
      {/* 远山：yellow-green 系粉彩 */}
      <div
        className="absolute rounded-[50%]"
        style={{ width: "70%", height: 260, left: "-18%", top: "46%", background: "#cfe09c" }}
      />
      <div
        className="absolute rounded-[50%]"
        style={{ width: "80%", height: 300, right: "-25%", top: "44%", background: "#bdd489" }}
      />
      {/* 湖面：app-teal 系湖水 */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: "58%",
          height: "16%",
          background: "linear-gradient(180deg, #97d9c3 0%, #6ec3aa 100%)",
        }}
      />
      {/* 湖面波光 */}
      <div
        className="absolute rounded-full"
        style={{
          left: "12%",
          top: "62%",
          width: 120,
          height: 5,
          background: "rgba(255, 253, 242, 0.55)",
          animation: "garden-bob-y-sm 4s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          right: "18%",
          top: "68%",
          width: 90,
          height: 4,
          background: "rgba(255, 253, 242, 0.5)",
          animation: "garden-bob-y-sm 5.2s cubic-bezier(0.4, 0, 0.2, 1) infinite",
          animationDelay: "-2s",
        }}
      />
      {/* 游鱼（app-orange / warm-peach-pink / app-yellow） */}
      <Fish top="61%" size={1} duration={26} delay={-6} color="#e59266" />
      <Fish top="66%" size={0.75} duration={35} delay={-19} color="#e8a08c" reverse />
      <Fish top="70%" size={0.55} duration={44} delay={-31} color="#f7cd67" />
      {/* 草地：app-green 系暖绿 */}
      <div
        className="absolute left-0 right-0 bottom-0"
        style={{
          height: "30%",
          background: "linear-gradient(180deg, #c2e0a6 0%, #b0d491 45%, #a4cb80 100%)",
        }}
      />
      {/* ACNH 式草地小纹理：圆润的叶芽与小圆点 */}
      <svg
        className="absolute left-0 right-0 bottom-0"
        width="100%"
        height="30%"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="acnh-grass" width="96" height="84" patternUnits="userSpaceOnUse" patternTransform="rotate(-6)">
            <path d="M22 34 q7 -9 14 0 q-7 3 -14 0 Z" fill="#8fbd72" opacity="0.4" />
            <path d="M62 66 q6 -8 12 0 q-6 3 -12 0 Z" fill="#8fbd72" opacity="0.35" />
            <circle cx="14" cy="70" r="3.2" fill="#8fbd72" opacity="0.32" />
            <circle cx="82" cy="18" r="2.8" fill="#8fbd72" opacity="0.32" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#acnh-grass)" />
      </svg>
      {/* 小路：羊皮纸沙色 */}
      <div
        className="absolute"
        style={{
          left: "50%",
          bottom: "-14%",
          width: "120%",
          height: "34%",
          transform: "translateX(-50%)",
          background:
            "radial-gradient(ellipse at center, #f3e3b8 0%, #eeddA2 55%, rgba(238, 221, 162, 0) 72%)",
        }}
      />
      {/* 森林（brown 树干 + app-green 树冠，轻摇曳） */}
      <Tree left="20%" bottom="27.5%" scale={0.55} duration={6.4} delay={-3.5} />
      <Tree left="73%" bottom="27%" scale={0.6} duration={5.9} delay={-1.2} />
      <Tree left="1%" bottom="26%" scale={1.02} duration={5.2} delay={0} />
      <Tree left="9.5%" bottom="27.5%" scale={0.78} duration={6.1} delay={-2} />
      <Tree left="88%" bottom="26.5%" scale={0.94} duration={5} delay={-2.6} />
      <Tree left="95.5%" bottom="27.5%" scale={0.72} duration={6.6} delay={-4} />
      {/* 灌木丛 */}
      <div
        className="absolute rounded-[50%]"
        style={{ left: "14%", bottom: "24%", width: 110, height: 40, background: "#96ca8c" }}
      />
      <div
        className="absolute rounded-[50%]"
        style={{ left: "15.5%", bottom: "26%", width: 70, height: 34, background: "#a6d69c" }}
      />
      <div
        className="absolute rounded-[50%]"
        style={{ right: "13%", bottom: "24.5%", width: 120, height: 42, background: "#96ca8c" }}
      />
      <div
        className="absolute rounded-[50%]"
        style={{ right: "11.5%", bottom: "26.5%", width: 74, height: 34, background: "#a6d69c" }}
      />
      {/* 草丛（轻摆） */}
      <Grass left="24%" bottom="7%" />
      <Grass left="33%" bottom="15%" delay={-1.5} />
      <Grass left="6%" bottom="18%" delay={-0.8} />
      <Grass left="64%" bottom="5%" delay={-2.2} />
      <Grass left="78%" bottom="13%" delay={-0.4} />
      <Grass left="93%" bottom="19%" delay={-1.1} />
      {/* 花草点缀（emoji 插图，轻摆） */}
      <Flower emoji="🌼" left="4%" bottom="7%" size={30} delay={0} />
      <Flower emoji="🌸" left="10%" bottom="16%" size={24} delay={-1.2} />
      <Flower emoji="🌻" left="95%" bottom="8%" size={30} delay={-0.6} />
      <Flower emoji="🌷" left="87%" bottom="19%" size={24} delay={-1.8} />
      <Flower emoji="🌼" left="57%" bottom="3%" size={22} delay={-2.4} />
      <Flower emoji="🌸" left="70%" bottom="9%" size={22} delay={-0.9} />
      <style>{SCENE_CSS}</style>
    </div>
  );
}

/** 白云：外层横向漂移，内层缩放（避免 transform 冲突） */
function Cloud({ top, size, duration, delay }: DriftProps & { size: number }) {
  return (
    <div
      className="absolute left-0"
      style={{ top, animation: `garden-drift ${duration}s linear ${delay}s infinite` }}
    >
      <div style={{ transform: `scale(${size})`, transformOrigin: "top left" }}>
        <div className="relative" style={{ filter: "drop-shadow(0 4px 10px rgba(154, 131, 90, 0.16))" }}>
          <div className="rounded-full" style={{ width: 110, height: 38, background: "#fffdf4" }} />
          <div className="absolute rounded-full" style={{ width: 52, height: 52, left: 16, top: -26, background: "#fffdf4" }} />
          <div className="absolute rounded-full" style={{ width: 40, height: 40, left: 58, top: -18, background: "#fffdf4" }} />
        </div>
      </div>
    </div>
  );
}

/** 飞鸟：横向飞过 + 上下起伏，双翅绕翼根扇动（暖棕描边） */
function Bird({ top, size, duration, delay }: DriftProps & { size: number }) {
  return (
    <div
      className="absolute left-0"
      style={{ top, animation: `garden-drift ${duration}s linear ${delay}s infinite` }}
    >
      <div style={{ animation: "garden-bob-y 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite" }}>
        <svg
          width={34 * size}
          height={16 * size}
          viewBox="0 0 34 16"
          style={{ transform: `scale(${size})`, transformOrigin: "top left", overflow: "visible" }}
        >
          <path
            className="bird-wing bird-wing-l"
            d="M17 10 Q9 1 2 6"
            stroke="#7a6650"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
          />
          <path
            className="bird-wing bird-wing-r"
            d="M17 10 Q25 1 32 6"
            stroke="#7a6650"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

/** 游鱼：湖中横穿 + 轻微起伏，尾巴摆动；reverse 时头朝左游 */
function Fish({
  top,
  size,
  duration,
  delay,
  color,
  reverse,
}: DriftProps & { size: number; color: string; reverse?: boolean }) {
  return (
    <div
      className="absolute left-0"
      style={{
        top,
        animation: `${reverse ? "garden-swim-rev" : "garden-swim"} ${duration}s linear ${delay}s infinite`,
      }}
    >
      <div style={{ animation: "garden-bob-y-sm 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite" }}>
        <svg
          width={48 * size}
          height={24 * size}
          viewBox="0 0 48 24"
          style={{
            transform: reverse ? "scaleX(-1)" : undefined,
            transformOrigin: "center",
            overflow: "visible",
          }}
        >
          <path className="fish-tail" d="M14 12 L2 4 Q5.5 12 2 20 Z" fill={color} />
          <ellipse cx="28" cy="12" rx="15" ry="9" fill={color} />
          <path d="M25 3.5 Q28.5 0.5 31.5 4 Q29 6 25 3.5 Z" fill={color} />
          <circle cx="36.5" cy="10" r="1.8" fill="#725d42" />
          <path
            d="M22 12 q4 4 9 1"
            stroke="rgba(255, 253, 242, 0.5)"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

/** 大树：brown 树干 + app-green 系树冠，整树绕根部轻摆 */
function Tree({
  left,
  bottom,
  scale,
  duration,
  delay,
}: {
  left: string;
  bottom: string;
  scale: number;
  duration: number;
  delay: number;
}) {
  return (
    <div
      className="absolute"
      style={{
        left,
        bottom,
        transformOrigin: "bottom center",
        animation: `garden-sway ${duration}s cubic-bezier(0.4, 0, 0.2, 1) ${delay}s infinite alternate`,
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "bottom center" }}>
        <svg width="120" height="160" viewBox="0 0 120 160">
          {/* 树干：顶端藏在树冠里，一直画到地面 */}
          <rect x="53" y="90" width="14" height="70" rx="6" fill="#9a835a" />
          {/* 树冠：两侧圆先画，主圆压在上面，下缘盖住树干顶端不留缝 */}
          <circle cx="30" cy="82" r="25" fill="#a9d3a3" />
          <circle cx="90" cy="78" r="25" fill="#79b679" />
          <circle cx="60" cy="62" r="38" fill="#8ac68a" />
          {/* 高光 */}
          <circle cx="42" cy="38" r="14" fill="#c5e5bd" opacity="0.85" />
          <circle cx="76" cy="28" r="11" fill="#b3dcae" opacity="0.75" />
        </svg>
      </div>
    </div>
  );
}

/** 草丛：三根小草叶 */
function Grass({ left, bottom, delay = 0 }: { left: string; bottom: string; delay?: number }) {
  return (
    <div
      className="absolute"
      style={{
        left,
        bottom,
        transformOrigin: "bottom center",
        animation: `garden-sway-sm 3.2s cubic-bezier(0.4, 0, 0.2, 1) ${delay}s infinite alternate`,
      }}
    >
      <svg width="26" height="18" viewBox="0 0 26 18" style={{ overflow: "visible" }}>
        <path d="M4 18 Q3 9 1 5" stroke="#7db06b" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M13 18 Q13 7 13 3" stroke="#8cbe76" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M22 18 Q23 9 25 5" stroke="#7db06b" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** 小花：emoji 插图轻轻摇曳 */
function Flower({
  emoji,
  left,
  bottom,
  size,
  delay = 0,
}: {
  emoji: string;
  left: string;
  bottom: string;
  size: number;
  delay?: number;
}) {
  return (
    <div
      className="absolute"
      style={{
        left,
        bottom,
        fontSize: size,
        lineHeight: 1,
        transformOrigin: "bottom center",
        animation: `garden-sway-sm 3.6s cubic-bezier(0.4, 0, 0.2, 1) ${delay}s infinite alternate`,
      }}
    >
      {emoji}
    </div>
  );
}

const SCENE_CSS = `
.garden-scene { transform-style: flat; }
.bird-wing { transform-box: fill-box; }
.bird-wing-l { transform-origin: 100% 100%; animation: garden-flap-l 0.42s cubic-bezier(0.4, 0, 0.2, 1) infinite alternate; }
.bird-wing-r { transform-origin: 0% 100%; animation: garden-flap-r 0.42s cubic-bezier(0.4, 0, 0.2, 1) infinite alternate; }
.fish-tail { transform-box: fill-box; transform-origin: 100% 50%; animation: garden-tail 0.55s cubic-bezier(0.4, 0, 0.2, 1) infinite alternate; }

@keyframes garden-drift { from { transform: translateX(-18vw); } to { transform: translateX(112vw); } }
@keyframes garden-swim { from { transform: translateX(-14vw); } to { transform: translateX(114vw); } }
@keyframes garden-swim-rev { from { transform: translateX(114vw); } to { transform: translateX(-14vw); } }
@keyframes garden-bob-y { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes garden-bob-y-sm { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes garden-sway { from { transform: rotate(-1.6deg); } to { transform: rotate(1.6deg); } }
@keyframes garden-sway-sm { from { transform: rotate(-5deg); } to { transform: rotate(5deg); } }
@keyframes garden-flap-l { from { transform: rotate(-30deg); } to { transform: rotate(12deg); } }
@keyframes garden-flap-r { from { transform: rotate(30deg); } to { transform: rotate(-12deg); } }
@keyframes garden-tail { from { transform: rotate(-16deg); } to { transform: rotate(16deg); } }
@keyframes garden-sun-pulse { 0%, 100% { transform: scale(1); opacity: 0.95; } 50% { transform: scale(1.06); opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .garden-scene * { animation: none !important; }
}
`;
