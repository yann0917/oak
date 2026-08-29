// MediaPipe 共享加载器与手势/姿态工具（仅浏览器端使用）。
// 模型与 wasm 全部自托管（/models、/wasm），运行时不与外部 CDN 交互；
// 所有 /api/tasks-vision 的 import 都是动态的，避免打进服务端渲染图。
import type { HandLandmarker, PoseLandmarker, GestureRecognizer } from "@mediapipe/tasks-vision";

export interface PointLike {
  x: number;
  y: number;
  z?: number;
}

type Fileset = Awaited<ReturnType<typeof import("@mediapipe/tasks-vision").FilesetResolver.forVisionTasks>>;

// ---------- 懒加载单例（失败后自动重置，可重试） ----------

let filesetPromise: Promise<Fileset> | null = null;

function loadFileset(): Promise<Fileset> {
  if (!filesetPromise) {
    filesetPromise = (async () => {
      const { FilesetResolver } = await import("@mediapipe/tasks-vision");
      return FilesetResolver.forVisionTasks("/wasm");
    })().catch((e) => {
      filesetPromise = null;
      throw e;
    });
  }
  return filesetPromise;
}

let handPromise: Promise<HandLandmarker> | null = null;
let posePromise: Promise<PoseLandmarker> | null = null;
let gesturePromise: Promise<GestureRecognizer> | null = null;

/**
 * GPU 委托创建失败（Safari/Firefox 的 WebGL2 compute 不完整时，GPU 路径会抛错
 * 甚至"创建成功但永远返回空结果"）就退回 CPU——识别慢一点，但保证有结果。
 */
async function createWithFallback<T>(
  create: (delegate: "GPU" | "CPU") => Promise<T>
): Promise<T> {
  try {
    return await create("GPU");
  } catch (e) {
    console.warn("[mediapipe] GPU 委托不可用，退回 CPU 运行", e);
    return create("CPU");
  }
}

/** 手部 21 关键点（食指尖 = 刀尖 / 数手指）；检测双手，手掌正对镜头。 */
export function getHandLandmarker(): Promise<HandLandmarker> {
  if (!handPromise) {
    handPromise = (async () => {
      const { HandLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await loadFileset();
      return createWithFallback((delegate) =>
        HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.5,
        })
      );
    })().catch((e) => {
      handPromise = null;
      throw e;
    });
  }
  return handPromise;
}

/** 全身 33 关键点（手势舞姿态匹配），lite 模型兼顾中端设备。 */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!posePromise) {
    posePromise = (async () => {
      const { PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await loadFileset();
      return createWithFallback((delegate) =>
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task", delegate },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
      );
    })().catch((e) => {
      posePromise = null;
      throw e;
    });
  }
  return posePromise;
}

/** 内置手势识别：✊ Closed_Fist / ✋ Open_Palm / ✌️ Victory 等 8 种。 */
export function getGestureRecognizer(): Promise<GestureRecognizer> {
  if (!gesturePromise) {
    gesturePromise = (async () => {
      const { GestureRecognizer } = await import("@mediapipe/tasks-vision");
      const vision = await loadFileset();
      return createWithFallback((delegate) =>
        GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "/models/gesture_recognizer.task", delegate },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.4,
          minHandPresenceConfidence: 0.4,
          minTrackingConfidence: 0.5,
        })
      );
    })().catch((e) => {
      gesturePromise = null;
      throw e;
    });
  }
  return gesturePromise;
}

// ---------- 摄像头 ----------

/** 打开前置摄像头并把流挂到视频元素；浏览器在非 HTTPS 环境（除 localhost）会拒绝。
 * 个别环境 getUserMedia 会挂起不返回，这里加超时兜底，避免游戏一直卡在加载。 */
export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("unavailable");
  }
  const stream = await Promise.race([
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        const err = new Error("camera-timeout") as Error & { name: string };
        err.name = "TimeoutError";
        reject(err);
      }, 12000);
    }),
  ]);
  video.srcObject = stream;
  await video.play();
  return stream;
}

/** 把摄像头/模型错误转成给家长看的提示文案。 */
export function describeGameError(e: unknown): string {
  const err = e as { name?: string; message?: string } | null;
  const name = err?.name ?? "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "摄像头权限被拒绝了，请在浏览器地址栏允许摄像头后重试";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "没有找到摄像头，插上摄像头或改用鼠标/触屏模式";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "摄像头被其他应用占用了，关掉占用摄像头的应用再试";
  }
  if (name === "TimeoutError") {
    return "摄像头迟迟没有响应，请检查摄像头后重试";
  }
  if (name === "SecurityError" || name === "InsecureContext") {
    return "当前不是安全连接，请用 localhost 或 HTTPS 打开本页";
  }
  if (/media|wasm|model|fetch|network/i.test(err?.message ?? "")) {
    return "体感模型加载失败，请检查网络后刷新重试";
  }
  return "开启摄像头失败，请刷新重试或改用鼠标/触屏模式";
}

// ---------- 坐标工具 ----------

/** 手/姿态的关键点是"画面坐标"（未镜像），显示用画面经过 CSS 水平翻转，
 * 映射到屏幕空间时 x 取反：sx = (1 - x) * w。 */
export function toScreen(p: PointLike, w: number, h: number): { x: number; y: number } {
  return { x: (1 - p.x) * w, y: p.y * h };
}

/** 一阶低通滤波：压手部关键点抖动（prev 不存在时直接返回当前值）。 */
export function lowPass(prev: PointLike | null, cur: PointLike, alpha = 0.4): PointLike {
  if (!prev) return cur;
  return {
    x: prev.x * (1 - alpha) + cur.x * alpha,
    y: prev.y * (1 - alpha) + cur.y * alpha,
    z: prev.z !== undefined && cur.z !== undefined ? prev.z * (1 - alpha) + cur.z * alpha : cur.z,
  };
}

export function dist2d(a: PointLike, b: PointLike): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ---------- 手部：张开/收拳判定（✋✊） ----------

/**
 * 四指（食/中/无/小，不含拇指）伸直的数量，0~4。
 * ✋ 张开 ≥3，✊ 收拳 ≤1，中间值由调用方做滞回处理。
 * 用经典 2D 判定（指尖到腕 > 近端关节到腕），手掌正对镜头即可靠；
 * 刻意不含拇指——拇指姿态多样，判整手开合时反而引入噪声。
 */
export function extendedFingers2d(lm: PointLike[]): number {
  if (!lm || lm.length < 21) return -1;
  const wrist = lm[0];
  let n = 0;
  for (const [tip, pip] of FINGER_TIP_PIP) {
    if (
      dist2d(lm[tip], wrist) > dist2d(lm[pip], wrist) * 1.03
    ) n++;
  }
  return n;
}

const FINGER_TIP_PIP: [tip: number, pip: number][] = [
  [8, 6], // 食指
  [12, 10], // 中指
  [16, 14], // 无名指
  [20, 18], // 小指
];

// ---------- 手部：骨架连线（切水果/泡泡的指尖 + 骨架反馈用） ----------

// 手部 21 点连线（画骨架用）
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  lm: PointLike[],
  w: number,
  h: number,
  mirror = true
): void {
  if (!lm || lm.length < 21) return;
  const pts = lm.map(
    (p) => (mirror ? { x: (1 - p.x) * w, y: p.y * h } : { x: p.x * w, y: p.y * h })
  );
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
  }
  ctx.stroke();
  ctx.fillStyle = "#ffe066";
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // 食指尖描成刀尖
  const tip = pts[8];
  ctx.strokeStyle = "#ff5d5d";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 9, 0, Math.PI * 2);
  ctx.stroke();
}

// ---------- 姿态：关节角度 / 约束求值 ----------

/** 三点夹角（度）：顶点是 b，边为 b-a 与 b-c。 */
export function jointAngle(a: PointLike, b: PointLike, c: PointLike): number {
  const v1 = [a.x - b.x, a.y - b.y];
  const v2 = [c.x - b.x, c.y - b.y];
  const l1 = Math.hypot(v1[0], v1[1]);
  const l2 = Math.hypot(v2[0], v2[1]);
  if (l1 === 0 || l2 === 0) return 0;
  const cos = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// 归一化坐标下 y 向下增大；"高于"= y 更小。offset 为 y 差值的容忍范围。
export type PoseConstraint =
  | { kind: "angle"; pts: [number, number, number]; min: number; max: number } // 关节夹角范围
  | { kind: "above"; a: number; b: number; offset: number } // a.y < b.y + offset（a 高于 b）
  | { kind: "below"; a: number; b: number; offset: number } // a.y > b.y + offset（a 低于 b）
  | { kind: "near_y"; a: number; b: number; max: number } // 两点 y 差 < max（水平）
  | { kind: "prox"; a: number; b: number; max: number }; // 两点距离 < max（归一化）

export interface PoseCheck {
  pass: boolean;
  name: string; // 未满足的约束描述（用于提示）
}

/** 求值一组姿态约束，返回满足数/总数与未满足项的提示。 */
export function evaluatePose(
  lm: PointLike[],
  constraints: { check: PoseConstraint; name: string }[]
): { ratio: number; fails: string[] } {
  const fails: string[] = [];
  let ok = 0;
  for (const { check, name } of constraints) {
    let pass = false;
    switch (check.kind) {
      case "angle": {
        const deg = jointAngle(lm[check.pts[0]], lm[check.pts[1]], lm[check.pts[2]]);
        pass = deg >= check.min && deg <= check.max;
        break;
      }
      case "above":
        pass = lm[check.a].y < lm[check.b].y + check.offset;
        break;
      case "below":
        pass = lm[check.a].y > lm[check.b].y + check.offset;
        break;
      case "near_y":
        pass = Math.abs(lm[check.a].y - lm[check.b].y) < check.max;
        break;
      case "prox":
        pass = dist2d(lm[check.a], lm[check.b]) < check.max;
        break;
    }
    if (pass) ok++;
    else fails.push(name);
  }
  return { ratio: constraints.length ? ok / constraints.length : 0, fails };
}

/** 在预览画布上画姿态骨架（x 按镜像画面输出，与 scaleX(-1) 的视频对齐） */
export function drawPoseSkeleton(
  ctx: CanvasRenderingContext2D,
  lm: PointLike[],
  w: number,
  h: number
): void {
  if (!lm || lm.length < 33) return;
  const pts = lm.map((p) => ({ x: (1 - p.x) * w, y: p.y * h }));
  const lines: [number, number][] = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // 手臂
    [11, 23], [12, 24], [23, 24], // 躯干
    [23, 25], [25, 27], [24, 26], [26, 28], // 腿
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
