"use client";

// 手势舞打卡（关键帧版）：把舞蹈拆成 6 个"定格姿势"，用 PoseLandmarker 逐帧算
// 当前姿势与目标姿势的关节角度匹配度，达标并保持 1.5 秒就盖一个动作印章，集齐放烟花。
// 关节角度对比天然抗身高体型差异；检测不到人时给"站到镜头前"的提示。
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Progress } from "animal-island-ui";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { EXCITED_TONE, speak, useVoiceMuted } from "@/lib/garden/speech";
import {
  describeGameError,
  evaluatePose,
  getPoseLandmarker,
  openCamera,
  type PoseConstraint,
} from "@/lib/games/mediapipe";
import { toast } from "@/lib/toast";

// 姿态关键点下标：0 鼻 11/12 肩 13/14 肘 15/16 腕 23/24 髋 25/26 膝 27/28 踝
const L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_WR = 15, R_WR = 16;
const L_HIP = 23, R_HIP = 24, L_KNEE = 25, R_KNEE = 26, L_ANK = 27, R_ANK = 28;

interface PoseDef {
  name: string;
  emoji: string;
  fact: string; // 夺章时喊的话
  constraints: { check: PoseConstraint; name: string }[];
}

const POSES: PoseDef[] = [
  {
    name: "大树向上",
    emoji: "🌳",
    fact: "大树长高啦！",
    constraints: [
      { check: { kind: "angle", pts: [L_EL, L_SH, L_HIP], min: 140, max: 180 }, name: "左手臂再举高" },
      { check: { kind: "angle", pts: [R_EL, R_SH, R_HIP], min: 140, max: 180 }, name: "右手臂再举高" },
    ],
  },
  {
    name: "飞机展翅",
    emoji: "✈️",
    fact: "飞机起飞啦！",
    constraints: [
      { check: { kind: "angle", pts: [L_EL, L_SH, L_HIP], min: 65, max: 115 }, name: "左手臂放平" },
      { check: { kind: "angle", pts: [R_EL, R_SH, R_HIP], min: 65, max: 115 }, name: "右手臂放平" },
      { check: { kind: "near_y", a: L_WR, b: L_SH, max: 0.16 }, name: "左手腕到肩膀高度" },
      { check: { kind: "near_y", a: R_WR, b: R_SH, max: 0.16 }, name: "右手腕到肩膀高度" },
    ],
  },
  {
    name: "超人出发",
    emoji: "🦸",
    fact: "起飞去救人！",
    constraints: [
      { check: { kind: "angle", pts: [L_EL, L_SH, L_HIP], min: 150, max: 180 }, name: "左手往上举" },
      { check: { kind: "angle", pts: [R_EL, R_SH, R_HIP], min: 0, max: 60 }, name: "右手往下放" },
    ],
  },
  {
    name: "小青蛙蹲",
    emoji: "🐸",
    fact: "呱呱，蹲住啦！",
    constraints: [
      { check: { kind: "angle", pts: [L_HIP, L_KNEE, L_ANK], min: 45, max: 140 }, name: "左膝盖弯一下" },
      { check: { kind: "angle", pts: [R_HIP, R_KNEE, R_ANK], min: 45, max: 140 }, name: "右膝盖弯一下" },
    ],
  },
  {
    name: "金鸡独立",
    emoji: "🦩",
    fact: "单脚站稳！真厉害！",
    constraints: [
      { check: { kind: "angle", pts: [L_HIP, L_KNEE, L_ANK], min: 150, max: 180 }, name: "左脚站直" },
      { check: { kind: "angle", pts: [R_HIP, R_KNEE, R_ANK], min: 40, max: 130 }, name: "右腿抬起来" },
      { check: { kind: "above", a: R_ANK, b: L_ANK, offset: -0.04 }, name: "右脚抬得比左脚高" },
    ],
  },
  {
    name: "恭喜合十",
    emoji: "🙏",
    fact: "谢谢大家，礼成！",
    constraints: [
      { check: { kind: "prox", a: L_WR, b: R_WR, max: 0.17 }, name: "两只手靠近一点" },
      { check: { kind: "below", a: L_WR, b: L_SH, offset: 0.02 }, name: "手收到胸前" },
      { check: { kind: "angle", pts: [L_SH, L_EL, L_WR], min: 60, max: 145 }, name: "左肘弯一弯" },
    ],
  },
];

const HOLD_SEC = 1.5;
const MATCH_RATIO = 0.76;

type Phase = "intro" | "loading" | "playing" | "done";

export default function GestureDance() {
  const router = useRouter();
  const { currentChild } = useChildren();
  const [voiceMuted, setVoiceMuted] = useVoiceMuted();

  const [phase, setPhase] = useState<Phase>("intro");
  const [poseIdx, setPoseIdx] = useState(0);
  const [stamps, setStamps] = useState<{ name: string; emoji: string }[]>([]);
  const [holdRatio, setHoldRatio] = useState(0);
  const [tips, setTips] = useState<string[]>([]);
  const [bodySeen, setBodySeen] = useState(false);
  const [error, setError] = useState("");
  const [durationSec, setDurationSec] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skelRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const fitStartRef = useRef<number | null>(null); // 达标开始时刻
  const poseIdxRef = useRef(0);
  const stampsRef = useRef<{ name: string; emoji: string }[]>([]);
  const phaseRef = useRef<Phase>("intro");
  const savedRef = useRef(false);
  const roundStartRef = useRef(0);
  const loopTokenRef = useRef(0);

  const pose = POSES[poseIdx];
  // 手势舞必须用摄像头：预览只在游玩阶段显示，但 video 元素始终挂载
  const showPreview = phase === "playing";

  const bodySeenRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    poseIdxRef.current = poseIdx;
  }, [poseIdx]);

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
    if (stampsRef.current.length === 0) return; // 没盖到章就不写记录
    savedRef.current = true;
    setDurationSec(Math.round((performance.now() - roundStartRef.current) / 1000));
    api("/api/garden-records", {
      method: "POST",
      body: JSON.stringify({
        childId: currentChild.id,
        activity: "gesture-dance",
        difficulty: "简单",
        durationSec: Math.round((performance.now() - roundStartRef.current) / 1000),
        results: stampsRef.current.map((s) => ({
          itemKey: `gd:${s.name}`,
          label: `${s.emoji} ${s.name}`,
          correct: true,
        })),
      }),
    }).catch(() => {});
     
  }, [phase, currentChild]);

  const start = async () => {
    if (phase === "loading") return;
    setPhase("loading");
    setError("");
    try {
      stopStream();
      const landmarker = await getPoseLandmarker();
      const video = videoRef.current!;
      const stream = await openCamera(video);
      streamRef.current = stream;
      await new Promise<void>((res) => {
        if (video.readyState >= 2) return res();
        video.onloadeddata = () => res();
      });
      // 新开一轮：清空印章从头盖
      stampsRef.current = [];
      setStamps([]);
      setPoseIdx(0);
      poseIdxRef.current = 0;
      setHoldRatio(0);
      setTips([]);
      fitStartRef.current = null;
      savedRef.current = false;
      roundStartRef.current = performance.now();
      const token = ++loopTokenRef.current;
      phaseRef.current = "playing";
      setPhase("playing");
      rafRef.current = requestAnimationFrame(() => detectLoop(landmarker, token));
    } catch (e) {
      toast(describeGameError(e), "warning");
      setError(describeGameError(e));
      setPhase("intro");
    }
     
  };

  function detectLoop(landmarker: Awaited<ReturnType<typeof getPoseLandmarker>>, token: number) {
    // 先续帧再判断：第一帧若在 React 提交前触发，旧写法会"返回即死"
    if (token !== loopTokenRef.current) return;
    rafRef.current = requestAnimationFrame(() => detectLoop(landmarker, token));
    if (phaseRef.current !== "playing") return;
    const video = videoRef.current;
    if (video && video.readyState >= 2) {
      const now = performance.now();
      const res = landmarker.detectForVideo(video, now);
      const lm: NormalizedLandmark[] | undefined = res.landmarks?.[0];
      const canvas = skelRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d")!;
        const cw = canvas.clientWidth;
        const ch = canvas.clientHeight;
        ctx.clearRect(0, 0, cw, ch);
        drawPoseSkeleton(ctx, lm, cw, ch);
      }
      if (lm && lm.length >= 33) {
        if (!bodySeenRef.current) setBodySeen(true);
        bodySeenRef.current = true;
        const def = POSES[poseIdxRef.current];
        const { ratio, fails } = evaluatePose(lm, def.constraints);
        setTips(fails.slice(0, 2));
        if (ratio >= MATCH_RATIO) {
          if (fitStartRef.current === null) {
            fitStartRef.current = now;
            setHoldRatio(0);
          }
          const held = (now - fitStartRef.current) / 1000;
          setHoldRatio(Math.min(1, held / HOLD_SEC));
          if (held >= HOLD_SEC) {
            fitStartRef.current = null;
            setHoldRatio(1);
            stampAndAdvance(def);
          }
        } else {
          fitStartRef.current = null;
          setHoldRatio(0);
        }
      } else {
        bodySeenRef.current = false;
        setBodySeen(false);
        fitStartRef.current = null;
        setHoldRatio(0);
      }
    }
  }

  function stampAndAdvance(def: PoseDef) {
    if (!stampsRef.current.some((s) => s.name === def.name)) {
      stampsRef.current.push({ name: def.name, emoji: def.emoji });
      setStamps([...stampsRef.current]);
    }
    speak(def.fact, "xiaoyi", EXCITED_TONE);
    // 停顿一下，让孩子看到盖章效果再换下一个动作
    setTimeout(() => {
      const next = poseIdxRef.current + 1;
      if (next >= POSES.length) {
        phaseRef.current = "done";
        setPhase("done");
      } else {
        setPoseIdx(next);
        poseIdxRef.current = next;
        setTips([]);
        fitStartRef.current = null;
        setHoldRatio(0);
      }
    }, 900);
  }

  const acc = stamps.length;
  const done = phase === "done";

  return (
    <div>
      {(phase === "intro" || phase === "loading") && (
        <div className="max-w-lg mx-auto">
          <div
            className="bg-white rounded-[32px] p-6 sm:p-8 text-center"
            style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}
          >
            <div className="text-5xl">💃</div>
            <p className="text-2xl font-black mt-2" style={{ color: "var(--animal-text-color)" }}>
              手势舞打卡
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
              照着图画摆姿势，保持 {HOLD_SEC} 秒就盖一个章，集满 6 个放烟花！
            </p>
            <div className="mt-4 flex justify-center gap-2 flex-wrap text-2xl">
              {POSES.map((p) => (
                <span key={p.name} className="opacity-40" title={p.name}>
                  {p.emoji}
                </span>
              ))}
            </div>
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            <Button type="primary" size="large" loading={phase === "loading"} onClick={start} className="mt-5 w-full">
              📷 开始摆姿势
            </Button>
            <p className="text-xs mt-3" style={{ color: "var(--animal-text-color-secondary)" }}>
              摄像头要照到全身：退后一点，面向镜头站好
            </p>
          </div>
        </div>
      )}

      {phase === "playing" && (
        <div>
          <div className="flex items-center gap-3">
            <Button size="small" type="text" onClick={() => setPhase("done")}>
              结束
            </Button>
            <span className="text-sm font-bold" style={{ color: "var(--animal-text-color)" }}>
              进度 {acc}/{POSES.length}
            </span>
            <div className="flex-1">
              <Progress percent={(acc / POSES.length) * 100} size="small" showInfo={false} duration={0.3} />
            </div>
            <button className="text-lg" onClick={() => setVoiceMuted(!voiceMuted)} aria-label={voiceMuted ? "开启语音" : "关闭语音"}>
              {voiceMuted ? "🔇" : "🔊"}
            </button>
          </div>

          <div className="mt-4">
            {/* 当前动作卡片 + 印章墙 */}
            <div className="bg-white rounded-[32px] p-5 text-center" style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.14)" }}>
              {pose && (
                <>
                  <div className="text-6xl">{pose.emoji}</div>
                  <p className="text-xl font-black mt-2" style={{ color: "var(--animal-text-color)" }}>
                    {pose.name}
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                    像这样摆，保持 {HOLD_SEC} 秒
                  </p>
                  <div className="mt-3 h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-400 transition-all duration-150"
                      style={{ width: `${Math.round(holdRatio * 100)}%` }}
                    />
                  </div>
                  {!bodySeen ? (
                    <p className="text-xs mt-3 text-orange-500">没有看到人影，站到摄像头前试一试</p>
                  ) : tips.length > 0 ? (
                    <p className="text-xs mt-3 text-orange-500" style={{ color: "var(--animal-text-color-secondary)" }}>
                      再调整一下：{tips.join(" · ")}
                    </p>
                  ) : (
                    <p className="text-xs mt-3 font-bold text-green-600">姿势很好，保持住保持住…</p>
                  )}
                </>
              )}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {POSES.map((p) => {
                  const got = stamps.some((s) => s.name === p.name);
                  return (
                    <div
                      key={p.name}
                      className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center text-xl border-2 ${
                        got ? "bg-green-50 border-green-300" : "bg-gray-50 border-transparent opacity-50"
                      }`}
                      title={p.name}
                    >
                      <span>{p.emoji}</span>
                      <span className="text-[9px] font-bold mt-0.5" style={{ color: got ? "#2e7d32" : "var(--animal-text-color-secondary)" }}>
                        {got ? "✓ 已盖" : p.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {done && (
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 text-center" style={{ boxShadow: "0 20px 50px rgba(61,52,40,0.18)" }}>
            <div className="text-5xl">🎆</div>
            <p className="text-2xl font-black mt-2" style={{ color: "var(--animal-text-color)" }}>
              {acc >= POSES.length ? "六个印章全收齐，放烟花啦！" : "本跳完成，已盖 " + acc + " 个印章"}
            </p>
            <div className="mt-3 flex justify-center gap-1.5 flex-wrap text-2xl">
              {POSES.map((p) => (
                <span key={p.name} title={p.name}>
                  {stamps.some((s) => s.name === p.name) ? p.emoji : <span className="opacity-30">{p.emoji}</span>}
                </span>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <Button type="primary" size="large" onClick={start} className="flex-1">
                再跳一遍
              </Button>
              <Button size="large" onClick={() => router.push("/garden/games")} className="flex-1">
                返回游戏
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 摄像头检测/预览（镜像 + 骨架）：常驻挂载，避免启动流程里 videoRef 取不到 */}
      <div
        className={`relative mx-auto mt-4 max-w-md overflow-hidden rounded-3xl border-4 bg-black/60 ${
          showPreview ? "block" : "hidden"
        }`}
        style={{ borderColor: "var(--animal-border-color-light)" }}
      >
        <video ref={videoRef} playsInline muted className="block w-full" style={{ transform: "scaleX(-1)" }} />
        <canvas ref={skelRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        {holdRatio > 0 && holdRatio < 1 && (
          <div className="absolute bottom-2 inset-x-0 text-center">
            <span className="px-3 py-1 rounded-full bg-white/80 text-sm font-bold text-green-700">
              保持住… {Math.round(holdRatio * 100)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** 在预览画布上画姿态骨架（y 同向，x 镜像与视频一致） */
function drawPoseSkeleton(
  ctx: CanvasRenderingContext2D,
  lm: NormalizedLandmark[] | undefined,
  w: number,
  h: number
) {
  if (!lm || lm.length < 33) return;
  const pts = lm.map((p) => ({ x: (1 - p.x) * w, y: p.y * h }));
  const lines: [number, number][] = [
    [11, 12],
    [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [24, 26], [26, 28],
    [0, 11], [0, 12],
  ];
  ctx.strokeStyle = "rgba(96, 214, 112, 0.95)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [a, b] of lines) {
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
  }
  ctx.stroke();
  ctx.fillStyle = "#fdf8ec";
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}
