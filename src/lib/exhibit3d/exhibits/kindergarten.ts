// 展品：文福幼儿园（西溪北苑园区）
//
// 这是「数据 → 模型」这条链路的第一件展品，也是唯一一件只有 oak 能做的展品：
// 校名、地址、班级、老师、课表都来自库里真实的记录（schools / enrollments / teachers）。
// 模型本身是手工建模的固定几何，数据插的是**名牌与说明**，不是楼的样子。
//
// 建模约定：以 y=0 为地面，+Z 为正面（朝向观众），单位约等于「米」的缩放版。
import { Builder, MAT, atlasQuad, bush, door, person, tree, windowPane } from "../builder";
import { shade, type Aabb, type Vec3 } from "../math";
import type { Atlas, UvRect } from "../atlas";
import { PLINTH_TOP } from "../hall";
import type { Hotspot } from "../renderer";

export interface KindergartenData {
  schoolName: string;
  address: string;
  className?: string;
  stage?: string;
}

export interface ExhibitBuildResult {
  hotspots: Hotspot[];
  center: Vec3;
  /** 展品实际占地，展厅外壳据此推导展台/地面/取景 */
  footprint: { w: number; d: number; cx: number; cz: number };
}

// ---- 配色：幼儿园就该是明快饱和的，配大量白色描边（动森感的来源之一）----
const C = {
  wall: "#fdf1d8",
  wallSide: "#f0e2c4",
  trim: "#ffffff",
  roof: "#e8836b",
  roofDark: "#d16f59",
  band: "#f7cd67",
  door: "#7fc8a9",
  doorDark: "#5fae8d",
  glass: "#a8dcf0",
  warm: "#ffe9a8",
  grass: "#8fd06a",
  grassDark: "#7cbd59",
  path: "#ecdfc2",
  pathEdge: "#d6c7a3",
  play: "#f4a988",
  playEdge: "#e0916f",
  sand: "#f5dfae",
  metal: "#cfd8dc",
  slide: "#f7cd67",
  slideDark: "#e5b74e",
  wood: "#c69a6a",
  red: "#e8534a",
};

/** 人字形坡屋顶：屋脊沿 X 向，前后两坡 + 两侧山墙三角 */
function pitchedRoof(
  b: Builder,
  w: number,
  d: number,
  y: number,
  rise: number,
  color: string | Vec3,
  overhang = 0.4
): void {
  const X = w / 2 + overhang;
  const Z = d / 2 + overhang;
  const dark = shade(color, 0.86);
  // 前后两坡
  b.quad([-X, y, Z], [X, y, Z], [X, y + rise, 0], [-X, y + rise, 0], color, MAT.PLAIN);
  b.quad([X, y, -Z], [-X, y, -Z], [-X, y + rise, 0], [X, y + rise, 0], dark, MAT.PLAIN);
  // 山墙三角（用墙体色，避免屋顶色糊成一片）
  b.tri([-w / 2, y, -d / 2], [-w / 2, y, d / 2], [-w / 2, y + rise, 0], C.wallSide, MAT.PLAIN);
  b.tri([w / 2, y, d / 2], [w / 2, y, -d / 2], [w / 2, y + rise, 0], C.wallSide, MAT.PLAIN);
  // 屋脊压边
  b.box(0, y + rise + 0.04, 0, w + overhang * 2 + 0.1, 0.1, 0.22, shade(color, 1.12), MAT.PLAIN);
  // 檐口
  b.box(0, y - 0.06, 0, w + overhang * 2, 0.14, d + overhang * 2, shade(color, 1.05), MAT.PLAIN);
}

/** 教学楼主楼：两层、白色描边、中间门厅带雨棚 */
function mainBuilding(b: Builder, cx: number, cz: number, sign: UvRect | null): void {
  const w = 9;
  const d = 5.2;
  const h1 = 1.9; // 一层
  const h2 = 1.6; // 二层
  const h = h1 + h2;
  const y0 = 0.22; // 台基顶面

  // 台基
  b.box(cx, y0 / 2, cz, w + 0.5, y0, d + 0.5, "#cfc3a8", MAT.PLAIN);
  b.box(cx, y0 + 0.03, cz, w + 0.22, 0.06, d + 0.22, "#e0d5bb", MAT.PLAIN);

  // 一层 / 二层墙体分成两块，接缝处给一条色带
  b.box(cx, y0 + h1 / 2, cz, w, h1, d, C.wall, MAT.PLAIN);
  b.box(cx, y0 + h1 + h2 / 2, cz, w, h2, d, shade(C.wall, 1.0), MAT.PLAIN);
  b.box(cx, y0 + h1, cz, w + 0.14, 0.17, d + 0.14, C.band, MAT.PLAIN);
  // 勒脚
  b.box(cx, y0 + 0.1, cz, w + 0.12, 0.2, d + 0.12, shade(C.wall, 0.9), MAT.PLAIN);

  const front = cz + d / 2;

  // 一层窗（门在正中，两侧各两扇）。幼儿园的窗就该大而多。
  for (const dx of [-3.1, -1.6, 1.6, 3.1]) {
    windowPane(b, cx + dx, y0 + 1.02, front, 1.25, 1.4, C.trim, C.glass);
  }
  // 二层窗（五扇，中间那扇暖光）
  for (const dx of [-3.2, -1.6, 0, 1.6, 3.2]) {
    const lit = dx === 0;
    windowPane(b, cx + dx, y0 + h1 + h2 / 2 - 0.05, front, 1.0, 1.15, C.trim, lit ? C.warm : C.glass);
    if (lit) b.box(cx + dx, y0 + h1 + h2 / 2 - 0.05, front + 0.055, 0.86, 1.0, 0.02, C.warm, MAT.EMISSIVE);
  }
  // 侧面窗
  for (const sx of [-1, 1]) {
    for (const dz of [-1.4, 0.4]) {
      b.push(cx + (sx * w) / 2, y0 + 1.02, cz + dz, 0, (sx * Math.PI) / 2);
      windowPane(b, 0, 0, 0, 1.1, 1.35, C.trim, C.glass);
      b.pop();
    }
  }

  // 门厅：门 + 两步台阶 + 雨棚（雨棚是幼儿园建筑最有辨识度的部件之一）
  door(b, cx, y0 + 0.85, front, 1.25, 1.7, C.trim, C.door, "#f2c94c");
  b.box(cx, y0 + 0.44, front + 0.55, 2.6, 0.16, 0.9, "#dcd0b5", MAT.PLAIN);
  b.box(cx, y0 + 0.28, front + 0.95, 3.1, 0.16, 0.7, "#cec2a6", MAT.PLAIN);
  // 雨棚：两根柱子撑一块弧顶
  for (const dx of [-1.35, 1.35]) {
    b.cylinder(cx + dx, y0 + 1.42, front + 0.72, 0.075, 0.07, 1.3, C.trim, MAT.PLAIN, 8);
  }
  b.box(cx, y0 + 2.12, front + 0.72, 3.4, 0.14, 1.5, C.band, MAT.PLAIN);
  b.box(cx, y0 + 2.05, front + 1.5, 3.4, 0.14, 0.16, shade(C.band, 1.1), MAT.PLAIN);
  b.box(cx, y0 + 2.19, front + 0.72, 2.6, 0.12, 0.9, shade(C.roof, 1.06), MAT.PLAIN);

  // 屋顶
  pitchedRoof(b, w, d, y0 + h, 1.35, C.roof, 0.45);

  // 屋顶上的小圆顶装饰 + 烟囱，破掉大屋面的单调
  b.cylinder(cx + 2.6, y0 + h + 1.5, cz - 0.9, 0.34, 0.3, 0.5, C.trim, MAT.PLAIN, 12);
  b.sphere(cx + 2.6, y0 + h + 1.78, cz - 0.9, 0.36, 0.28, 0.36, C.roof, MAT.PLAIN, 12, 8);
  b.box(cx - 3.1, y0 + h + 0.75, cz + 1.1, 0.5, 0.9, 0.5, shade(C.wall, 0.94), MAT.PLAIN);

  // 楼名横匾（数据来源：schools.name）
  if (sign) {
    b.box(cx, y0 + h1 + 0.05, front + 0.16, 4.6, 0.72, 0.16, C.trim, MAT.PLAIN);
    atlasQuad(b, sign, cx, y0 + h1 + 0.05, front + 0.26, 4.3, 0.56);
  }
}

/** 副楼：单层多功能厅，靠主楼左侧，用连廊相接 */
function wingBuilding(b: Builder, cx: number, cz: number): void {
  const w = 4.2;
  const d = 4.4;
  const h = 2.5;
  b.box(cx, 0.11, cz, w + 0.4, 0.22, d + 0.4, "#cfc3a8", MAT.PLAIN);
  b.box(cx, 0.22 + h / 2, cz, w, h, d, shade(C.wall, 0.97), MAT.PLAIN);
  b.box(cx, 0.22 + 0.08, cz, w + 0.1, 0.16, d + 0.1, C.band, MAT.PLAIN);
  const front = cz + d / 2;
  for (const dx of [-1.1, 1.1]) {
    windowPane(b, cx + dx, 1.4, front, 0.95, 1.0, C.trim, C.glass);
  }
  for (const dz of [-1.0, 1.0]) {
    b.push(cx - w / 2, 1.4, cz + dz, 0, -Math.PI / 2);
    windowPane(b, 0, 0, 0, 0.9, 1.0, C.trim, C.glass);
    b.pop();
  }
  pitchedRoof(b, w, d, 0.22 + h, 1.05, shade(C.roof, 0.94), 0.38);
  // 连廊：主楼与副楼之间的玻璃廊
  b.box(cx + w / 2 + 0.9, 1.35, cz + 0.3, 1.8, 0.14, 1.5, C.trim, MAT.PLAIN);
  for (const dx of [-0.7, 0, 0.7]) {
    b.cylinder(cx + w / 2 + 0.9 + dx, 0.9, cz - 0.4, 0.06, 0.06, 1.0, C.trim, MAT.PLAIN, 6);
  }
}

/** 滑梯：梯子 + 平台 + 曲面滑道（滑道用扫掠四边形做真实弧度） */
function slide(b: Builder, cx: number, cz: number): void {
  const deckY = 1.15;
  const deckW = 0.9;
  // 四根立柱
  for (const dx of [-0.45, 0.45]) {
    for (const dz of [-0.45, 0.45]) {
      b.cylinder(cx + dx, deckY / 2, cz + dz, 0.085, 0.08, deckY, C.slideDark, MAT.GLOSSY, 8);
    }
  }
  // 平台
  b.box(cx, deckY, cz, deckW, 0.1, deckW, C.slide, MAT.GLOSSY);
  // 护栏
  for (const dz of [-0.45, 0.45]) {
    b.box(cx, deckY + 0.32, cz + dz, deckW, 0.55, 0.07, shade(C.slide, 1.1), MAT.GLOSSY);
  }
  b.box(cx - 0.45, deckY + 0.32, cz, 0.07, 0.55, deckW, shade(C.slide, 1.1), MAT.GLOSSY);
  // 梯子（从平台向 -Z 方向下来）
  for (let i = 0; i < 5; i++) {
    const y = 0.18 + i * 0.22;
    const z = cz - 0.6 - i * 0.02;
    b.box(cx, y, z - 0.25, 0.7, 0.06, 0.1, C.metal, MAT.METAL);
  }
  for (const dx of [-0.36, 0.36]) {
    b.beam([cx + dx, 0.05, cz - 0.55], [cx + dx, deckY, cz - 0.45], 0.045, C.slideDark, MAT.GLOSSY, 6);
  }
  // 滑道：从平台右边缘向前方落下，带一段加速下坠的弧度
  const steps = 14;
  const x0 = cx + 0.45;
  const len = 2.5;
  const drop = deckY - 0.12;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    // 抛体式下坠曲线：起步平缓、末端快
    const f = (t: number) => t * t * 0.55 + t * 0.45;
    const p0x = x0 + len * t0;
    const p1x = x0 + len * t1;
    const p0y = deckY - drop * f(t0);
    const p1y = deckY - drop * f(t1);
    const hw = 0.42;
    b.quad(
      [p0x, p0y, cz - hw],
      [p0x, p0y, cz + hw],
      [p1x, p1y + 0.02, cz + hw],
      [p1x, p1y + 0.02, cz - hw],
      i % 2 ? C.slide : shade(C.slide, 0.97),
      MAT.GLOSSY
    );
    // 两侧挡边
    for (const s of [-1, 1]) {
      b.quad(
        [p0x, p0y, cz + s * hw],
        [p0x, p0y + 0.2, cz + s * hw],
        [p1x, p1y + 0.2, cz + s * hw],
        [p1x, p1y, cz + s * hw],
        shade(C.slideDark, 1.05),
        MAT.GLOSSY
      );
    }
  }
}

/** 秋千：A 字架 + 横梁 + 两只座 */
function swings(b: Builder, cx: number, cz: number): void {
  const topY = 1.85;
  const spread = 0.95;
  for (const s of [-1, 1]) {
    const near: Vec3 = [cx + s * spread, topY, cz - 0.55];
    const far: Vec3 = [cx + s * spread, topY, cz + 0.55];
    b.beam([cx + s * (spread + 0.34), 0.05, cz - 0.8], near, 0.07, C.wood, MAT.PLAIN, 6);
    b.beam([cx + s * (spread + 0.34), 0.05, cz + 0.8], far, 0.07, C.wood, MAT.PLAIN, 6);
  }
  b.beam([cx - spread, topY, cz], [cx + spread, topY, cz], 0.075, C.metal, MAT.METAL, 8);
  for (const dx of [-0.42, 0.42]) {
    for (const s of [-1, 1]) {
      b.beam([cx + dx, topY - 0.02, cz], [cx + dx, 0.72, cz + s * 0.16], 0.022, "#8a9aa0", MAT.METAL, 5);
    }
    b.box(cx + dx, 0.68, cz, 0.42, 0.06, 0.3, "#6fb8d8", MAT.GLOSSY);
  }
}

/** 沙坑：木框 + 沙面 + 一把小铲子 */
function sandbox(b: Builder, cx: number, cz: number, w = 2.6, d = 2.0): void {
  const hw = w / 2;
  const hd = d / 2;
  b.box(cx, 0.11, cz - hd, w, 0.22, 0.14, C.wood, MAT.PLAIN);
  b.box(cx, 0.11, cz + hd, w, 0.22, 0.14, shade(C.wood, 1.08), MAT.PLAIN);
  b.box(cx - hw, 0.11, cz, 0.14, 0.22, d, C.wood, MAT.PLAIN);
  b.box(cx + hw, 0.11, cz, 0.14, 0.22, d, shade(C.wood, 1.08), MAT.PLAIN);
  b.box(cx, 0.12, cz, w - 0.2, 0.06, d - 0.2, C.sand, MAT.PLAIN);
  // 沙上的小铲子和小桶，让沙坑不是一块死平的黄
  b.cylinder(cx + 0.6, 0.2, cz + 0.3, 0.16, 0.13, 0.16, "#f28b8b", MAT.GLOSSY, 10);
  b.beam([cx - 0.5, 0.16, cz - 0.2], [cx - 0.15, 0.42, cz + 0.15], 0.02, "#7fc8a9", MAT.GLOSSY, 5);
  b.box(cx - 0.15, 0.42, cz + 0.15, 0.22, 0.2, 0.04, "#7fc8a9", MAT.GLOSSY);
}

/** 攀爬架：弧形爬杆阵列 */
function climber(b: Builder, cx: number, cz: number): void {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const x = cx - 1.0 + i * 0.5;
    const h = 1.2 - Math.abs(i - (n - 1) / 2) * 0.18;
    b.cylinder(x, h / 2, cz, 0.06, 0.06, h, ["#f7cd67", "#82d5bb", "#889df0", "#f2a1a1", "#8ac68a"][i], MAT.GLOSSY, 8);
  }
  b.beam([cx - 1.0, 1.16, cz], [cx + 1.0, 1.16, cz], 0.06, C.metal, MAT.METAL, 8);
}

/** 旗杆与升旗台：中国学校操场的固定配置 */
function flagpole(b: Builder, cx: number, cz: number): void {
  b.cylinder(cx, 0.14, cz, 0.62, 0.6, 0.28, "#e6dcc4", MAT.PLAIN, 16);
  b.cylinder(cx, 0.3, cz, 0.52, 0.5, 0.06, "#f3ebd6", MAT.PLAIN, 16);
  b.cylinder(cx, 2.4, cz, 0.055, 0.04, 4.2, C.metal, MAT.METAL, 10);
  b.sphere(cx, 4.56, cz, 0.1, 0.1, 0.1, "#f2c94c", MAT.METAL, 10, 7);
  // 红旗：两面三角拼出飘动感
  b.quad([cx + 0.05, 4.42, cz], [cx + 0.05, 4.06, cz], [cx + 1.25, 4.16, cz + 0.14], [cx + 1.25, 4.36, cz + 0.1], C.red, MAT.PLAIN);
  b.tri([cx + 1.25, 4.16, cz + 0.14], [cx + 1.25, 4.36, cz + 0.1], [cx + 0.72, 4.26, cz + 0.05], shade(C.red, 0.86), MAT.PLAIN);
  // 一颗小黄星
  b.sphere(cx + 0.3, 4.31, cz + 0.03, 0.075, 0.075, 0.02, "#f7cd67", MAT.EMISSIVE, 8, 5);
}

/** 种植角：幼儿园的标配。木框 + 土 + 几行小苗 */
function plantingBed(b: Builder, cx: number, cz: number, w: number, d: number): void {
  const hw = w / 2;
  const hd = d / 2;
  b.box(cx, 0.14, cz - hd, w, 0.28, 0.16, C.wood, MAT.PLAIN);
  b.box(cx, 0.14, cz + hd, w, 0.28, 0.16, shade(C.wood, 1.1), MAT.PLAIN);
  b.box(cx - hw, 0.14, cz, 0.16, 0.28, d, C.wood, MAT.PLAIN);
  b.box(cx + hw, 0.14, cz, 0.16, 0.28, d, shade(C.wood, 1.1), MAT.PLAIN);
  b.box(cx, 0.17, cz, w - 0.24, 0.14, d - 0.24, "#8a6a4a", MAT.PLAIN);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      const x = cx - w * 0.3 + i * w * 0.3;
      const z = cz - d * 0.28 + j * d * 0.19;
      b.sphere(x, 0.32, z, 0.12, 0.14, 0.12, i % 2 ? "#6fae4e" : "#8fd06a", MAT.FOLIAGE, 7, 5);
    }
  }
}

/** 长椅：木条座 + 金属脚 */
function bench(b: Builder, cx: number, cz: number): void {
  b.push(cx, 0, cz);
  for (let i = 0; i < 3; i++) b.box(0, 0.44, (i - 1) * 0.16, 1.6, 0.08, 0.14, C.wood, MAT.PLAIN);
  for (let i = 0; i < 2; i++) b.box(0, 0.62 + i * 0.15, -0.27, 1.6, 0.09, 0.07, shade(C.wood, 1.08), MAT.PLAIN);
  for (const s of [-1, 1]) {
    b.box(s * 0.68, 0.22, 0.02, 0.1, 0.44, 0.52, C.metal, MAT.METAL);
    b.beam([s * 0.7, 0.26, -0.32], [s * 0.7, 0.9, -0.32], 0.04, C.metal, MAT.METAL, 6);
  }
  b.pop();
}

/** 大门：两根门柱 + 门楣 + 校名牌（校名来自 schools.name） */
function gate(b: Builder, cx: number, cz: number, sign: UvRect | null): void {
  const halfW = 2.1;
  for (const s of [-1, 1]) {
    b.box(cx + s * halfW, 0.16, cz, 1.0, 0.32, 1.0, "#d9ccb0", MAT.PLAIN);
    b.box(cx + s * halfW, 1.85, cz, 0.72, 3.4, 0.72, C.trim, MAT.PLAIN);
    b.box(cx + s * halfW, 3.6, cz, 0.86, 0.16, 0.86, C.band, MAT.PLAIN);
    b.sphere(cx + s * halfW, 3.82, cz, 0.3, 0.26, 0.3, C.roof, MAT.PLAIN, 10, 7);
  }
  // 门楣
  b.box(cx, 4.05, cz, halfW * 2 + 0.9, 0.9, 0.9, C.band, MAT.PLAIN);
  b.box(cx, 4.55, cz, halfW * 2 + 1.2, 0.16, 1.1, shade(C.roof, 1.05), MAT.PLAIN);
  if (sign) {
    b.box(cx, 4.05, cz + 0.47, halfW * 2 + 0.4, 0.72, 0.1, "#ffffff", MAT.PLAIN);
    atlasQuad(b, sign, cx, 4.05, cz + 0.535, halfW * 2 + 0.2, 0.6);
  }
  // 两侧的矮墙墩
  for (const s of [-1, 1]) {
    b.box(cx + s * (halfW + 1.35), 0.62, cz, 1.5, 1.24, 0.66, "#e8dfc8", MAT.PLAIN);
    b.box(cx + s * (halfW + 1.35), 1.28, cz, 1.66, 0.14, 0.8, shade(C.band, 1.05), MAT.PLAIN);
  }
}

/** 门前小路：一块块铺装，比一整块平板更有信息量 */
function paving(b: Builder, x0: number, z0: number, x1: number, z1: number, width = 2.2): void {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const dist = Math.hypot(dx, dz) || 1;
  const step = 0.92;
  const n = Math.max(2, Math.round(dist / 1.05));
  // 两条路都是轴对齐的，按主轴决定砖块与路缘的朝向
  const alongX = Math.abs(dx) > Math.abs(dz);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + dx * t;
    const z = z0 + dz * t;
    const slabColor = i % 2 ? C.path : shade(C.path, 0.96);
    b.box(x, 0.045, z, alongX ? step : width, 0.09, alongX ? width : step, slabColor, MAT.PLAIN);
    for (const s of [-1, 1]) {
      const off = width / 2 + 0.12;
      b.box(
        x + (alongX ? 0 : s * off),
        0.035,
        z + (alongX ? s * off : 0),
        alongX ? step : 0.16,
        0.07,
        alongX ? 0.16 : step,
        C.pathEdge,
        MAT.PLAIN
      );
    }
  }
}

/**
 * 组装整个园区。sign 系列 UV 来自名牌图集（校名/门牌）。
 * 返回可点击部位，供页面做「点哪儿说哪儿」。
 */
export function buildKindergarten(
  b: Builder,
  atlas: Atlas,
  data: KindergartenData
): ExhibitBuildResult {
  // 校名分成两处用：门楣（大字）与楼匾（与门楣同款但小一点）
  const gateSign = atlas.add(
    "gate-sign",
    1024,
    144,
    atlas.sign(1024, 144, data.schoolName, "#fdf6e3", "#4f6b52")
  );
  const hallSign = atlas.add(
    "hall-sign",
    1024,
    128,
    atlas.plaque(1024, 128, data.schoolName, data.className ? `${data.className} · ${data.stage ?? ""}` : undefined)
  );

  // ---- 草地底盘：要盖住铺装与大门（大门在 z≈11），否则门会飘在石材上 ----
  const plotW = 24;
  const plotD = 22;
  const plotCz = 1.5;
  b.push(0, 0, plotCz);
  b.slab(plotW, plotD, 0.5, -0.25, 2.6, C.grassDark, MAT.GROUND, 18);
  b.slab(plotW - 0.24, plotD - 0.24, 0.1, 0.03, 2.5, C.grass, MAT.GROUND, 18);
  b.pop();
  // 草地上的深浅块，避免大片同色（纯几何，不用着色器噪声）
  for (let i = 0; i < 16; i++) {
    const x = ((i * 53) % 21) - 10.5;
    const z = ((i * 31) % 19) - 8 + plotCz;
    b.push(x, 0, z);
    b.slab(1.6 + (i % 3) * 0.5, 1.2 + (i % 2) * 0.5, 0.02, 0.075, 0.6, shade(C.grass, 0.965), MAT.GROUND, 8);
    b.pop();
  }

  // ---- 建筑 ----
  mainBuilding(b, -1.0, -1.0, hallSign);
  wingBuilding(b, -7.6, -1.0);

  // ---- 铺装与大门 ----
  paving(b, -1.6, 10.2, -1.6, 1.8, 2.3);
  paving(b, -1.6, 3.4, 7.4, 3.4, 1.8);
  gate(b, -1.6, 10.9, gateSign);

  // ---- 操场与游乐设施 ----
  const playCx = 4.4;
  const playCz = 6.0;
  b.slab(8.4, 5.6, 0.24, 0.12, 1.2, C.playEdge, MAT.PLAIN, 14);
  b.slab(8.1, 5.3, 0.08, 0.24, 1.1, C.play, MAT.PLAIN, 14);
  // 塑胶场地上的跑道线
  b.slab(7.2, 4.4, 0.02, 0.3, 1.0, shade(C.play, 1.05), MAT.PLAIN, 14);

  slide(b, playCx - 2.6, playCz - 0.9);
  swings(b, playCx + 1.9, playCz - 1.3);
  sandbox(b, playCx - 0.4, playCz + 1.5);
  climber(b, playCx + 2.9, playCz + 1.4);

  // ---- 旗台 ----
  flagpole(b, -6.2, 7.2);

  // ---- 左前方的种植角与休息区：这片空地不填会显得园区很空 ----
  plantingBed(b, -9.4, 3.6, 3.6, 2.1);
  plantingBed(b, -9.4, 6.6, 3.6, 2.1);
  plantingBed(b, -4.2, 9.6, 2.8, 1.8);
  bench(b, -7.0, 10.4);
  bench(b, -5.0, 2.6);

  // ---- 绿化 ----
  tree(b, -2.9, 7.0, 3.2, "#7fc45f", C.wood, 1);
  tree(b, -8.9, 1.4, 2.9, "#8fd06a", C.wood, 2);
  tree(b, 9.4, 0.4, 3.1, "#74bd55", C.wood, 3);
  tree(b, -10.4, -3.6, 2.7, "#7fc45f", C.wood, 4);
  tree(b, 10.2, -3.4, 2.8, "#8fd06a", C.wood, 5);
  tree(b, 6.8, 10.6, 2.6, "#74bd55", C.wood, 6);
  tree(b, 10.6, 7.6, 2.7, "#7fc45f", C.wood, 7);
  tree(b, -6.4, -5.0, 3.0, "#8fd06a", C.wood, 8);
  tree(b, 2.4, -5.6, 2.8, "#7fc45f", C.wood, 9);
  tree(b, 8.0, -5.2, 2.6, "#74bd55", C.wood, 10);
  // 建筑与铺装之间的小花坛
  for (let i = 0; i < 6; i++) {
    bush(b, -4.9 + i * 1.5, 1.9, 0.42, i % 2 ? "#8fd06a" : "#a8dd7d");
  }
  bush(b, -9.2, 5.2, 0.5, "#8fd06a");
  bush(b, 1.4, 9.4, 0.46, "#a8dd7d");
  bush(b, -7.9, -4.4, 0.44, "#8fd06a");
  bush(b, -11.0, 8.4, 0.5, "#a8dd7d");
  bush(b, 5.4, 1.4, 0.42, "#8fd06a");
  bush(b, 0.4, 1.6, 0.38, "#a8dd7d");
  bush(b, -11.2, -0.6, 0.46, "#8fd06a");

  // ---- 小人：让操场有「在用」的感觉 ----
  person(b, playCx - 1.5, playCz + 0.6, 0.26, "#f2a1a1", 0.95);
  person(b, playCx + 0.9, playCz + 0.2, 0.26, "#889df0", 0.9);
  person(b, playCx + 2.2, playCz + 1.9, 0.26, "#f7cd67", 1.0);
  person(b, -1.6, 4.6, 0.26, "#82d5bb", 0.95);
  person(b, 1.9, 5.0, 0.26, "#e59266", 0.9);

  // ---- 可点击部位 ----
  const hotspots: Hotspot[] = [
    {
      id: "building",
      label: "教学楼",
      box: {
        min: [-6.2, 0, -4.2],
        max: [4.2, 6.2, 2.4],
      },
    },
    {
      id: "wing",
      label: "多功能厅",
      box: { min: [-10.2, 0, -3.6], max: [-5.2, 4.0, 1.6] },
    },
    {
      id: "playground",
      label: "操场",
      box: { min: [0.0, 0, 3.0], max: [9.0, 3.0, 9.0] },
    },
    {
      id: "flag",
      label: "升旗台",
      // 只包住旗台底座与一段旗杆：给太高会把门楣上方的点击也抢过来
      box: { min: [-6.9, 0, 5.5], max: [-5.5, 2.0, 6.9] },
    },
    {
      id: "gate",
      label: "大门",
      box: { min: [-4.6, 0, 10.2], max: [1.4, 5.0, 11.6] },
    },
  ];

  return {
    hotspots,
    // 取景中心压在模型中部：给太高会让展台掉到画面下方、上半留空
    center: [0, PLINTH_TOP + 0.6, plotCz],
    footprint: { w: plotW, d: plotD, cx: 0, cz: plotCz },
  };
}
