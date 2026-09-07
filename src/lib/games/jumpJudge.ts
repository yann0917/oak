// 跳跃小达人判定核心（纯函数，无 React/UI 依赖，便于单测）
// 臀部高度相对"站立基线"的抬升量判定；基线仅接近站姿时 EMA 平滑（跳起/蹲下都锁定），
// 阈值按肩-踝身高归一化：镜头远近、孩子高矮都不影响。

export const GAME_SECONDS = 30;
export const JUMP_RATIO = 0.07; // 起跳：臀部高于基线 ≥ 身高的 7%（约 7cm，幼儿园孩子轻跳也能算）
export const CLAP_ANKLE_RATIO = 0.01; // 拍手且双踝抬升 < 1% 身高 → 判定为"脚没动"的拍手，抑制计分
export const LAND_RATIO = 0.04; // 落回：低于基线 4% 身高以内才重新布防
export const BASE_LOCK_RATIO = 0.03; // 接近站姿（|差值| < 3% 身高）才平基线，蹲/跳都锁定
export const BASE_ALPHA = 0.06; // 站立基线 EMA 系数（越小越稳、跟镜头移动越慢）
export const HIP_SMOOTH_ALPHA = 0.4; // 臀部高度低通系数
export const MIN_JUMP_INTERVAL = 350; // 相邻两次起跳至少间隔

/** 单帧跳跃判定输入 */
export interface JumpFrameIn {
  hipY: number; // 低通后的臀部 y（归一化）
  ankleY: number; // 低通后的双踝平均 y（归一化）
  height: number; // 肩到踝距离（身高参考，>0）
  base: number | null; // 臀部站立基线（上次残留）
  baseAnkle: number | null; // 踝部站立基线（上次残留）
  ankleVisible: boolean; // 踝关键点可见性（拍手抑制的附属条件）
  handsClapping: boolean; // 双手在胸前拍打（拍手的可靠特征在手）
  armed: boolean;
  lastJumpAt: number;
  now: number;
}

export interface JumpFrameOut {
  base: number;
  baseAnkle: number;
  armed: boolean;
  jumped: boolean;
  lastJumpAt: number;
  power: number; // 0~1 反馈条
}

/**
 * 单帧起跳判定：臀部高于基线 ≥ 身高 7% 且已布防 → 记一跳。
 * 拍手防误报靠"拍打组合"（双腕胸前靠近）且脚未明显移动时抑制；
 * 注意不要把"脚必须离地"当作硬门槛——全身姿态模型对快速跳跃中踝点的估计
 * 常常几乎不动，踝约束会让真实跳跃完全无法计分。
 * 基线只在接近站姿时 EMA 平滑（跳起/蹲下锁定，防污染）。
 */
export function judgeJumpFrame(f: JumpFrameIn): JumpFrameOut {
  const base = f.base ?? f.hipY;
  const baseAnkle = f.baseAnkle ?? f.ankleY;
  const hipDelta = base - f.hipY; // 臀部高于基线的量（正 = 跳起，负 = 蹲下）
  const ankleDelta = baseAnkle - f.ankleY; // 双脚抬离地面的量（仅用于拍手复核）
  const power = Math.min(1, Math.max(0, hipDelta / (JUMP_RATIO * f.height * 1.4)));
  let jumped = false;
  let armed = f.armed;
  let lastJumpAt = f.lastJumpAt;
  // 拍手组合 + 脚确实没动（可见且低于 1% 身高）→ 抑制；孩子跳起时脚必动，哪怕模型响应弱也不压
  const clapSuppressed =
    f.handsClapping && f.ankleVisible && ankleDelta < CLAP_ANKLE_RATIO * f.height;
  if (hipDelta > JUMP_RATIO * f.height && !clapSuppressed && f.armed && f.now - f.lastJumpAt > MIN_JUMP_INTERVAL) {
    jumped = true;
    armed = false;
    lastJumpAt = f.now;
  } else if (hipDelta < LAND_RATIO * f.height) {
    armed = true;
  }
  let nextBase = base;
  let nextBaseAnkle = baseAnkle;
  if (Math.abs(hipDelta) < BASE_LOCK_RATIO * f.height) {
    nextBase = base * (1 - BASE_ALPHA) + f.hipY * BASE_ALPHA;
    // 踝基线跟随站姿更新（仅用于拍手复核：人走动后拍手仍能对齐"脚没动"基线）
    nextBaseAnkle = baseAnkle * (1 - BASE_ALPHA) + f.ankleY * BASE_ALPHA;
  }
  return { base: nextBase, baseAnkle: nextBaseAnkle, armed, jumped, lastJumpAt, power };
}
