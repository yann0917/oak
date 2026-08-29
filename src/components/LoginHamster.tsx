"use client";

export type HamsterMode = "idle" | "cover" | "dizzy";

/**
 * 动森风小仓鼠：输入密码时捂眼睛（cover），平时睁眼（idle），
 * 密码输错变晕圈眼（dizzy）。纯手绘 SVG + CSS 过渡。
 */
export function LoginHamster({ mode }: { mode: HamsterMode }) {
  const covering = mode === "cover";
  const dizzy = mode === "dizzy";
  const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

  return (
    <div
      className={covering ? "ai-anim" : ""}
      style={{
        animation: covering ? "hamster-wiggle 0.55s ease-in-out infinite" : undefined,
        transition: `transform 0.25s ${EASE}`,
      }}
      aria-hidden
    >
      <svg width="66" height="61" viewBox="0 0 120 110">
        {/* 耳朵 */}
        <g style={{ transition: `transform 0.2s ${EASE}`, transformOrigin: "60px 90px" }}>
          <ellipse cx="28" cy="20" rx="14" ry="17" fill="#eec27f" />
          <ellipse cx="28" cy="23" rx="7" ry="9" fill="#f8c9d4" />
          <ellipse cx="92" cy="20" rx="14" ry="17" fill="#eec27f" />
          <ellipse cx="92" cy="23" rx="7" ry="9" fill="#f8c9d4" />
        </g>
        {/* 身体 */}
        <ellipse cx="60" cy="64" rx="44" ry="43" fill="#f6dfb2" />
        <ellipse cx="60" cy="74" rx="30" ry="30" fill="#fbf0d6" opacity="0.85" />
        {/* 腮红 */}
        <circle cx="33" cy="70" r="6" fill="#f8a6b2" opacity="0.65" />
        <circle cx="87" cy="70" r="6" fill="#f8a6b2" opacity="0.65" />

        {/* 眼睛：睁眼圆点 */}
        <g style={{ opacity: dizzy ? 0 : 1, transition: `opacity 0.15s ${EASE}` }}>
          <ellipse cx="43" cy="56" rx="5" ry="6.5" fill="#4a3728" />
          <ellipse cx="77" cy="56" rx="5" ry="6.5" fill="#4a3728" />
          <circle cx="45" cy="53.5" r="1.8" fill="#ffffff" />
          <circle cx="79" cy="53.5" r="1.8" fill="#ffffff" />
        </g>
        {/* 眼睛：晕圈 X 眼（输错时） */}
        <g
          stroke="#4a3728"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ opacity: dizzy ? 1 : 0, transition: `opacity 0.15s ${EASE}` }}
        >
          <path d="M38 51 L48 61 M48 51 L38 61" />
          <path d="M72 51 L82 61 M82 51 L72 61" />
        </g>

        {/* 鼻子和嘴 */}
        <ellipse cx="60" cy="67" rx="3.4" ry="2.6" fill="#b9835a" />
        <path
          d="M53 73 q 3.5 4 7 0 q 3.5 4 7 0"
          stroke="#b9835a"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />

        {/* 爪子：捂眼时上移到眼睛位置 */}
        <g
          style={{
            transform: covering ? "translateY(-15px)" : "translateY(0)",
            transition: `transform 0.2s ${EASE}`,
          }}
        >
          <ellipse cx="41" cy="76" rx="13" ry="10" fill="#f3d7a3" stroke="#e0bd82" strokeWidth="1.5" />
          <ellipse cx="79" cy="76" rx="13" ry="10" fill="#f3d7a3" stroke="#e0bd82" strokeWidth="1.5" />
          <circle cx="37" cy="74" r="1.6" fill="#e0bd82" />
          <circle cx="41" cy="72.5" r="1.6" fill="#e0bd82" />
          <circle cx="45" cy="74" r="1.6" fill="#e0bd82" />
          <circle cx="75" cy="74" r="1.6" fill="#e0bd82" />
          <circle cx="79" cy="72.5" r="1.6" fill="#e0bd82" />
          <circle cx="83" cy="74" r="1.6" fill="#e0bd82" />
        </g>
      </svg>
    </div>
  );
}
