"use client";

// 番茄钟：专注 25 / 短休 5 / 长休 15 循环，document.title 同步倒计时，
// 专注数按天记在 localStorage；结束用 WebAudio 提示音
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Progress } from "animal-island-ui";

type Mode = "focus" | "short" | "long";

const MODES: Record<Mode, { label: string; emoji: string; minutes: number }> = {
  focus: { label: "专注", emoji: "🍅", minutes: 25 },
  short: { label: "短休息", emoji: "☕", minutes: 5 },
  long: { label: "长休息", emoji: "🌙", minutes: 15 },
};

const LONG_BREAK_EVERY = 4; // 每 4 个番茄长休一次

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.18, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {}
}

export default function TimerPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("focus");
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(MODES.focus.minutes * 60); // 秒
  // SSR 期间 window 不存在，客户端 hydration 时再读 localStorage
  const [focusCount, setFocusCount] = useState(() =>
    typeof window === "undefined" ? 0 : Number(localStorage.getItem(`oak-pomo-focus-${todayKey()}`) ?? 0)
  );
  const [sessionFocus, setSessionFocus] = useState(0);
  const timerRef = useRef<number | null>(null);

  // 切换模式时重置倒计时
  const switchMode = (m: Mode) => {
    setMode(m);
    setLeft(MODES[m].minutes * 60);
    setRunning(false);
  };

  const tick = (m: Mode, extra: number) => {
    setLeft((prev) => {
      const next = prev - 1;
      if (next <= 0) {
        setRunning(false);
        beep();
        const nextMode: Mode =
          m === "focus" ? (extra + 1 >= LONG_BREAK_EVERY ? "long" : "short") : "focus";
        if (m === "focus") {
          setSessionFocus((c) => c + 1);
          const key = `oak-pomo-focus-${todayKey()}`;
          const count = Number(localStorage.getItem(key) ?? 0) + 1;
          localStorage.setItem(key, String(count));
          setFocusCount(count);
        }
        if (nextMode !== m) {
          setMode(nextMode);
          return MODES[nextMode].minutes * 60;
        }
        return 0;
      }
      return next;
    });
  };

  useEffect(() => {
    if (!running) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => tick(mode, sessionFocus), 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode]);

  // document.title 同步倒计时
  useEffect(() => {
    const base = "Oak - 我记";
    if (running) {
      const mm = String(Math.floor(left / 60)).padStart(2, "0");
      const ss = String(left % 60).padStart(2, "0");
      document.title = `${mm}:${ss} ${MODES[mode].label} · ${base}`;
    } else {
      document.title = base;
    }
  }, [left, running, mode]);

  const total = MODES[mode].minutes * 60;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="h-dvh flex flex-col" style={{ background: "var(--animal-bg-color)" }}>
      <header
        className="flex items-center gap-3 px-4 h-14 shrink-0 border-b"
        style={{
          background: "var(--animal-bg-color)",
          borderColor: "var(--animal-border-color-light)",
        }}
      >
        <Button size="small" onClick={() => router.back()}>
          返回
        </Button>
        <span className="font-bold" style={{ color: "var(--animal-text-color)" }}>
          番茄钟
        </span>
        <span className="text-xs ml-auto text-secondary">今日已完成 {focusCount} 个番茄</span>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-md w-full mx-auto flex flex-col items-center gap-6">
        {/* 模式切换 */}
        <div className="flex gap-2 w-full">
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <Button
              key={m}
              size="small"
              className="flex-1"
              type={mode === m ? "primary" : "default"}
              onClick={() => switchMode(m)}
            >
              {MODES[m].emoji} {MODES[m].label} {MODES[m].minutes} 分
            </Button>
          ))}
        </div>

        {/* 大倒计时 */}
        <div className="w-full bg-white rounded-[32px] p-8 text-center" style={{ boxShadow: "0 12px 32px rgba(61,52,40,0.08)" }}>
          <div
            className="text-7xl font-black tabular-nums"
            style={{ color: mode === "focus" ? "var(--animal-error-color)" : "var(--animal-primary-color-active)" }}
          >
            {mm}:{ss}
          </div>
          <div className="mt-2 text-sm text-secondary">{MODES[mode].emoji} {MODES[mode].label}</div>
          <div className="mt-4">
            <Progress percent={Math.round(((total - left) / total) * 100)} showInfo={false} />
          </div>
          <div className="flex gap-3 mt-6 justify-center">
            <Button type="primary" size="large" className="flex-1" onClick={() => setRunning((r) => !r)}>
              {running ? "暂停" : left < total ? "继续" : "开始"}
            </Button>
            <Button size="large" onClick={() => {
              setRunning(false);
              setLeft(total);
            }}>
              重置
            </Button>
          </div>
          <div className="mt-4 text-xs text-secondary">
            本次会话：已专注 {sessionFocus} 个 · 每 {LONG_BREAK_EVERY} 个番茄进入长休息
          </div>
        </div>

        <p className="text-xs text-secondary text-center">
          提示音会在计时结束时响起；浏览器标签页同步显示剩余时间。
        </p>
      </main>
    </div>
  );
}
