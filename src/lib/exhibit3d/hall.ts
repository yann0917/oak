// 展厅外壳 —— 由引擎提供，展品只负责「站在上面的那个模型」
//
// 这是从 whistlevale 学到的结构：房间、地板、展台、名牌都是引擎代码，
// 内容方（或以后的贡献者）只需要做模型本身。所以所有展品共享同一套展厅语境。
//
// 尺寸一律由**展品实际占地**推导（早期版本用固定半径，结果展台比模型小、
// 名牌跑到模型前面把画面挡住了）。
import { Builder, MAT, atlasQuad, hash01 } from "./builder";
import { shade, type Vec3 } from "./math";
import type { UvRect } from "./atlas";

/**
 * 只出侧面的开口圆筒，**不带端盖**。
 *
 * 这里必须自己写而不用 Builder.cylinder：cylinder 会为半径>0 的端生成扇形盖，
 * 展墙半径接近 40，那张盖就是一张盖住整个模型的大圆盘——
 * 实测后果是「草地、展台、操场全部消失，只剩屋顶和门楣露在上面」，
 * 排查了很久。凡是拿 cylinder 当墙用，都要避开端盖。
 */
function openCylinder(
  b: Builder,
  radius: number,
  y0: number,
  y1: number,
  color: string,
  mat: number,
  segments = 48
): void {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    // 法线朝圆心（观众看的是墙的内表面）
    const n0: Vec3 = [-c0, 0, -s0];
    const n1: Vec3 = [-c1, 0, -s1];
    const b0: Vec3 = [c0 * radius, y0, s0 * radius];
    const b1: Vec3 = [c1 * radius, y0, s1 * radius];
    const t0: Vec3 = [c0 * radius, y1, s0 * radius];
    const t1: Vec3 = [c1 * radius, y1, s1 * radius];
    b.tri(b0, b1, t1, color, mat, [n0, n1, n1]);
    b.tri(b0, t1, t0, color, mat, [n0, n1, n0]);
  }
}

/** 展品脚底所站的平面高度（模型一律以 y=0 为地面建模） */
export const PLINTH_TOP = 1.7;

const FLOOR = "#dcd5c3";
const FLOOR_RIM = "#cec3a9";
const PLINTH_TOP_COLOR = "#f2e9d5";
const PLINTH_SIDE = "#d9cdb4";
const PLINTH_BASE = "#bcae93";

/** 展品实际占地（含门前小路、大门等所有伸出去的部分） */
export interface Footprint {
  w: number;
  d: number;
  /** 占地中心（模型局部坐标） */
  cx: number;
  cz: number;
}

export interface HallOptions {
  footprint: Footprint;
  /** 正面名牌（已排进图集） */
  plaque?: { rect: UvRect };
}

/** 展台相对占地的外扩系数：留出一圈石材边走，模型才像「摆」在展台上 */
const PLINTH_BLEED = 1.18;
/** 环形展墙半径相对展台半对角线的倍数 */
const WALL_RADIUS_FACTOR = 2.0;
/** 展墙往上的高度（要盖住相机俯视到最高时的视线） */
const WALL_MID = 20;
const WALL_H = 52;

/**
 * 名牌图集槽位的宽高比。必须与 scene.ts 里 `atlas.add("plinth-plaque", W, H, …)`
 * 的尺寸一致，否则牌面会被拉伸。
 */
export const PLATE_ASPECT = 1600 / 300;

/** 展台占地（含外扩），也决定地面尺寸与相机取景半径 */
export function plinthSize(footprint: Footprint) {
  return {
    w: footprint.w * PLINTH_BLEED,
    d: footprint.d * PLINTH_BLEED,
    cx: footprint.cx,
    cz: footprint.cz,
  };
}

/**
 * 环形展墙半径。渲染器要拿它来约束相机——相机会环绕展品，
 * 一旦跑到墙外，看到的就是墙的外表面，整个画面会被墙糊满。
 */
export function hallWallRadius(footprint: Footprint): number {
  const p = plinthSize(footprint);
  return Math.hypot(p.w / 2, p.d / 2) * WALL_RADIUS_FACTOR;
}

/**
 * 铺出展厅 + 展台 + 名牌。展品模型自己 translate(0, PLINTH_TOP, 0) 站上来。
 *
 * 一定要有那圈**环形展墙**：只铺地面的话，镜头一转四周全是空地板，
 * 大半个画面被空地吃掉，模型反而显小。墙把「空地」变成「展厅」，
 * 也让平涂光照在墙面上有个自然的明暗过渡（whistlevale 的房间正是起这个作用）。
 */
export function buildHall(b: Builder, opts: HallOptions): void {
  const p = plinthSize(opts.footprint);
  const halfDiag = Math.hypot(p.w / 2, p.d / 2);
  // 地面只要盖到墙根即可（再大就从墙外露出去了）
  const floorW = halfDiag * 2.25;

  // ---- 环形展墙：开口向上，相机在墙内环绕，不会挡镜头 ----
  const wallR = halfDiag * WALL_RADIUS_FACTOR;
  b.push(p.cx, 0, p.cz);
  openCylinder(b, wallR, WALL_MID - WALL_H / 2, WALL_MID + WALL_H / 2, "#ece4d2", MAT.PLAIN, 48);
  // 墙裙：贴地一条略深的带子，交代墙与地的交界
  openCylinder(b, wallR - 0.06, 0, 3.2, "#dbd1b8", MAT.PLAIN, 48);
  openCylinder(b, wallR - 0.02, 3.2, 3.46, "#c8bda2", MAT.PLAIN, 48);
  b.pop();

  // ---- 地面：一块大圆角台面，侧面压深一点交代厚度 ----
  b.push(p.cx, 0, p.cz);
  b.slab(floorW, floorW, 0.9, -0.45, halfDiag * 0.8, FLOOR_RIM, MAT.PLAIN, 22);
  b.slab(floorW, floorW, 0.06, 0.03, halfDiag * 0.8, FLOOR, MAT.GROUND, 22);
  // 内嵌缝线，暗示这是可以绕着看的展台底盘
  b.slab(p.w * 1.5, p.d * 1.5, 0.03, 0.07, halfDiag * 0.5, shade(FLOOR, 0.965), MAT.GROUND, 22);
  b.pop();

  // ---- 展台 ----
  const top = PLINTH_TOP;
  b.push(p.cx, 0, p.cz);
  b.slab(p.w * 1.1, p.d * 1.1, 0.24, 0.14, Math.min(p.w, p.d) * 0.16, PLINTH_BASE, MAT.PLAIN, 16);
  b.slab(p.w, p.d, top - 0.42, (top - 0.3) / 2, Math.min(p.w, p.d) * 0.15, PLINTH_SIDE, MAT.PLAIN, 16);
  b.slab(p.w * 1.04, p.d * 1.04, 0.14, top - 0.14, Math.min(p.w, p.d) * 0.16, shade(PLINTH_SIDE, 1.04), MAT.PLAIN, 16);
  b.slab(p.w * 0.98, p.d * 0.98, 0.08, top - 0.03, Math.min(p.w, p.d) * 0.14, PLINTH_TOP_COLOR, MAT.GROUND, 16);
  b.pop();

  // ---- 名牌：斜贴在展台正面 ----
  //
  // 三个约束缺一不可，任一违反都会出明显的视觉 bug：
  //  1. 倾角要够大（≈35°，博物馆标签的标准角度），否则俯视时牌面被看成一条侧棱，字读不出来；
  //  2. 牌面必须整块在展台暴露的立面上——比展台高的话上半截会扎进展台内部，
  //     露出来的切边在画面上就是一道横的黑边（踩过）；
  //  3. 整块牌连底板都要在展台立面之外，不能穿进去。
  if (opts.plaque) {
    const tilt = 0.62;
    const gapBelow = 0.32;
    const plateH = Math.min((top - gapBelow - 0.14) / Math.cos(tilt), 1.62);
    const plateW = plateH * PLATE_ASPECT;
    const hh = plateH / 2;
    const yc = gapBelow + hh * Math.cos(tilt);
    const zc = p.cz + p.d / 2 + 0.14 + hh * Math.sin(tilt);
    b.push(p.cx, yc, zc, -tilt);
    // 底板与牌面同尺寸、只在后方探出一点
    b.box(0, 0, -0.04, plateW, plateH, 0.08, "#6b5a41", MAT.PLAIN);
    atlasQuad(b, opts.plaque.rect, 0, 0, 0.008, plateW, plateH);
    b.pop();
  }
}

/**
 * 展台顶面的一圈小装饰钉：纯几何，避免大片死平（不用着色器噪声）。
 * 也顺带给「这是模型底座」的暗示。
 */
export function plinthStuds(b: Builder, footprint: Footprint): void {
  const p = plinthSize(footprint);
  const n = 20;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = p.cx + Math.cos(a) * p.w * 0.42;
    const z = p.cz + Math.sin(a) * p.d * 0.42;
    b.sphere(x, PLINTH_TOP + 0.05, z, 0.09, 0.05, 0.09, hash01(i) > 0.5 ? "#cbbe9f" : "#b9ab90", MAT.PLAIN, 7, 5);
  }
}

/** 展示场馆的背景色（清屏色）：暖白，高调 */
export const HALL_CLEAR: Vec3 = [0.9, 0.9, 0.88];
