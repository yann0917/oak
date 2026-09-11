// 展厅 3D 渲染核 · 几何构建器
//
// 核心思想来自 whistlevale：几何不是用建模工具捏的，是用代码写的。
// 一个 push/pop 变换栈 + 几个图元，就能堆出整栋楼。
// 细节靠材质分带（着色器）而不是堆三角形——一个方块也可以读成一面墙。
import {
  add,
  basis,
  col,
  ident,
  len,
  mm,
  mul,
  norm,
  rx,
  ry,
  rz,
  scaling,
  shade,
  sub,
  trans,
  type Mat4,
  type Vec3,
} from "./math";

/**
 * 材质 ID —— 着色器按号分支。刻意只留很少几种，且**不含程序化噪声**：
 * 实测（whistlevale 动森化对比）per-cell 哈希着色在平涂后会被放大成怪异色斑，
 * 所以这里的花纹一律靠「几何本身 + 相邻块面明度差」，不靠着色器噪声。
 */
export const MAT = {
  /** 哑光漆面：墙面、纸、布 */
  PLAIN: 0,
  /** 金属：滑梯、旗杆、栏杆（加高光） */
  METAL: 1,
  /** 玻璃：窗、玻璃门（半透 + 天空反射） */
  GLASS: 2,
  /** 植物：树冠、草丛（轻微摆动） */
  FOLIAGE: 3,
  /** 地面：草地、塑胶场地（极轻微明度变化） */
  GROUND: 4,
  /** 自发光：灯、发光招牌 */
  EMISSIVE: 5,
  /** 亮面塑料：动森式玩具质感（滑梯面、游乐设施） */
  GLOSSY: 6,
  /** 名牌图集贴图（UV 直接采样 atlas）：招牌、说明牌、班牌 */
  ATLAS: 7,
} as const;

/** 每个顶点的浮点数：position(3) normal(3) color(3) mat(1) uv(2) */
export const FLOATS_PER_VERTEX = 12;

// 复用的圆/球采样点，避免每次 cylinder 都重算三角函数
const circleCache = new Map<number, number[][]>();
function circle(segments: number): number[][] {
  let pts = circleCache.get(segments);
  if (!pts) {
    pts = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push([Math.cos(a), Math.sin(a)]);
    }
    circleCache.set(segments, pts);
  }
  return pts;
}

const sphereCache = new Map<string, Vec3[]>();
function spherePoints(segments: number, rings: number): Vec3[] {
  const key = `${segments}x${rings}`;
  let pts = sphereCache.get(key);
  if (!pts) {
    pts = [];
    for (let j = 0; j <= rings; j++) {
      const phi = (j / rings) * Math.PI;
      const sy = Math.cos(phi);
      const sr = Math.sin(phi);
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        pts.push([Math.cos(theta) * sr, sy, Math.sin(theta) * sr]);
      }
    }
    sphereCache.set(key, pts);
  }
  return pts;
}

export class Builder {
  /** 交错顶点缓冲：position, normal, color, mat, uv */
  readonly data: number[] = [];
  private m: Mat4 = ident();
  private stack: Mat4[] = [];
  private normalM: Mat4 | null = null;
  private normalStack: (Mat4 | null)[] = [];

  /** 压栈并把当前变换再叠加一次 平移→旋转(先Z后X后Y)→缩放 */
  push(
    x = 0,
    y = 0,
    z = 0,
    ax = 0,
    ay = 0,
    az = 0,
    sx = 1,
    sy: number = sx,
    sz: number = sx
  ): this {
    this.stack.push(this.m);
    this.normalStack.push(this.normalM);
    this.normalM = null;
    this.m = mm(this.m, mm(trans(x, y, z), mm(ry(ay), mm(rx(ax), mm(rz(az), scaling(sx, sy, sz))))));
    return this;
  }

  /** 压栈并直接乘一个矩阵（basis 等已算好的基向量用） */
  matrix(m: Mat4): this {
    this.stack.push(this.m);
    this.normalStack.push(this.normalM);
    this.normalM = null;
    this.m = mm(this.m, m);
    return this;
  }

  pop(): this {
    this.m = this.stack.pop() ?? ident();
    this.normalM = this.normalStack.pop() ?? null;
    return this;
  }

  vertex(p: Vec3, n: Vec3, color: string | Vec3, mat: number, uv?: [number, number]): void {
    const m = this.m;
    const rgb = typeof color === "string" ? col(color) : color;
    const d = this.data;
    d.push(
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
      n[0],
      n[1],
      n[2],
      rgb[0],
      rgb[1],
      rgb[2],
      mat,
      uv ? uv[0] : 0,
      uv ? uv[1] : 0
    );
  }

  /** 三角形；不传法线时按 (b-a)×(c-a) 自动求，顶点顺序决定朝向 */
  tri(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    color: string | Vec3,
    mat = 0,
    normals?: [Vec3, Vec3, Vec3],
    uv?: [number, number][]
  ): void {
    let ns = normals;
    if (!ns) {
      const e1 = sub(b, a);
      const e2 = sub(c, a);
      const n = norm([
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ]);
      ns = [n, n, n];
    }
    this.vertex(a, ns[0], color, mat, uv ? uv[0] : undefined);
    this.vertex(b, ns[1], color, mat, uv ? uv[1] : undefined);
    this.vertex(c, ns[2], color, mat, uv ? uv[2] : undefined);
  }

  quad(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    d: Vec3,
    color: string | Vec3,
    mat = 0,
    n?: Vec3,
    uv?: [number, number][]
  ): void {
    const ns: [Vec3, Vec3, Vec3] | undefined = n ? [n, n, n] : undefined;
    this.tri(a, b, c, color, mat, ns, uv ? [uv[0], uv[1], uv[2]] : undefined);
    this.tri(a, c, d, color, mat, ns, uv ? [uv[0], uv[2], uv[3]] : undefined);
  }

  /** 轴对齐长方体；六个面的明度各不相同（顶亮、底暗），这是「立体感」最省事的来源 */
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string | Vec3,
    mat = 0
  ): this {
    const X = w / 2;
    const Y = h / 2;
    const Z = d / 2;
    this.push(x, y, z);
    const side = typeof color === "string" ? shade(color, 0.97) : shade(color, 0.97);
    this.quad([-X, -Y, Z], [X, -Y, Z], [X, Y, Z], [-X, Y, Z], color, mat);
    this.quad([X, -Y, -Z], [-X, -Y, -Z], [-X, Y, -Z], [X, Y, -Z], side, mat);
    this.quad([X, -Y, Z], [X, -Y, -Z], [X, Y, -Z], [X, Y, Z], side, mat);
    this.quad([-X, -Y, -Z], [-X, -Y, Z], [-X, Y, Z], [-X, Y, -Z], side, mat);
    this.quad([-X, Y, Z], [X, Y, Z], [X, Y, -Z], [-X, Y, -Z], shade(color, 1.06), mat);
    this.quad([-X, -Y, -Z], [X, -Y, -Z], [X, -Y, Z], [-X, -Y, Z], shade(color, 0.72), mat);
    this.pop();
    return this;
  }

  cylinder(
    x: number,
    y: number,
    z: number,
    r1: number,
    r2: number,
    h: number,
    color: string | Vec3,
    mat = 0,
    segments = 12,
    ax = 0,
    az = 0
  ): this {
    this.push(x, y, z, ax, 0, az);
    const pts = circle(segments);
    for (let i = 0; i < segments; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const pa: Vec3 = [a[0] * r1, -h / 2, a[1] * r1];
      const pb: Vec3 = [b[0] * r1, -h / 2, b[1] * r1];
      const pc: Vec3 = [b[0] * r2, h / 2, b[1] * r2];
      const pd: Vec3 = [a[0] * r2, h / 2, a[1] * r2];
      const na = norm([a[0], (r1 - r2) / h, a[1]]);
      const nb = norm([b[0], (r1 - r2) / h, b[1]]);
      this.tri(pa, pd, pc, color, mat, [na, na, nb]);
      this.tri(pa, pc, pb, color, mat, [na, nb, nb]);
      if (r2 > 0) this.tri([0, h / 2, 0], pc, pd, shade(color, 1.08), mat);
      if (r1 > 0) this.tri([0, -h / 2, 0], pa, pb, shade(color, 0.82), mat);
    }
    this.pop();
    return this;
  }

  /** 椭球；动森的树冠、灌木、云都是球压出来的 */
  sphere(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: string | Vec3,
    mat = 0,
    segments = 10,
    rings = 7
  ): this {
    this.push(x, y, z, 0, 0, 0, sx, sy, sz);
    const pts = spherePoints(segments, rings);
    const stride = segments + 1;
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < segments; i++) {
        const k = j * stride + i;
        const a = pts[k];
        const b = pts[k + stride];
        const c = pts[k + stride + 1];
        const d = pts[k + 1];
        this.tri(a, c, b, color, mat);
        this.tri(a, d, c, color, mat);
      }
    }
    this.pop();
    return this;
  }

  /** 两点之间的梁（栏杆、枝条、斜撑） */
  beam(a: Vec3, b: Vec3, r: number, color: string | Vec3, mat = 0, sides = 6): this {
    const f = sub(b, a);
    this.matrix(basis(mul(add(a, b), 0.5), f));
    this.cylinder(0, 0, 0, r, r, len(f), color, mat, sides, Math.PI / 2);
    this.pop();
    return this;
  }

  /** 圆角平台（模型底盘）；动森的一切都站在圆角底座上 */
  slab(
    w: number,
    d: number,
    h: number,
    y: number,
    r: number,
    color: string | Vec3,
    mat = 0,
    cornerSteps = 8
  ): this {
    const outline = roundRect(w, d, r, cornerSteps);
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      this.quad(
        [a[0], y - h / 2, a[1]],
        [b[0], y - h / 2, b[1]],
        [b[0], y + h / 2, b[1]],
        [a[0], y + h / 2, a[1]],
        color,
        mat
      );
      // 顶面扇形三角，保证从上往下看是实心
      this.tri([0, y + h / 2, 0], [b[0], y + h / 2, b[1]], [a[0], y + h / 2, a[1]], color, mat);
    }
    return this;
  }

  /** 顶点数（内存与面数观测用） */
  get vertexCount(): number {
    return this.data.length / FLOATS_PER_VERTEX;
  }
}

/** 圆角矩形轮廓（逆时针），slab 用 */
export function roundRect(w: number, d: number, r: number, steps = 8): [number, number][] {
  const out: [number, number][] = [];
  const corners: [number, number, number][] = [
    [w / 2 - r, d / 2 - r, 0],
    [-w / 2 + r, d / 2 - r, Math.PI / 2],
    [-w / 2 + r, -d / 2 + r, Math.PI],
    [w / 2 - r, -d / 2 + r, Math.PI * 1.5],
  ];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= steps; i++) {
      const t = a0 + (i * Math.PI * 0.5) / steps;
      out.push([cx + Math.cos(t) * r, cz + Math.sin(t) * r]);
    }
  }
  return out;
}

// ---------- 常用构件（多个展品共享） ----------

/** 窗：外框 + 玻璃。动森感的窗要有明显白框 */
export function windowPane(
  b: Builder,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  frame = "#ffffff",
  glass = "#9fd4e8"
): void {
  b.box(x, y, z, w + 0.1, h + 0.1, 0.06, frame, MAT.PLAIN);
  b.box(x, y, z + 0.04, w, h, 0.03, glass, MAT.GLASS);
  b.box(x, y, z + 0.06, 0.035, h, 0.025, frame, MAT.PLAIN);
  b.box(x, y - 0.02, z + 0.06, w, 0.034, 0.025, frame, MAT.PLAIN);
}

/** 门：门框 + 门板 + 把手 */
export function door(
  b: Builder,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  frame = "#ffffff",
  panel = "#7fc8a9",
  knob = "#f2c94c"
): void {
  b.box(x, y, z, w + 0.14, h + 0.12, 0.07, frame, MAT.PLAIN);
  b.box(x, y, z + 0.05, w, h, 0.05, panel, MAT.PLAIN);
  b.sphere(x + w * 0.32, y, z + 0.09, 0.035, 0.035, 0.03, knob, MAT.METAL, 8, 5);
}

/** 动森式树：一根细干 + 二三个压扁的球冠，球冠略带明度差 */
export function tree(
  b: Builder,
  x: number,
  z: number,
  h = 2.4,
  leaf = "#7fc45f",
  trunk = "#a9784f",
  seed = 0
): void {
  // 树干半径跟着树高走：固定细干在高树上会看着「飘」，树冠像断了
  b.cylinder(x, h * 0.26, z, h * 0.055, h * 0.042, h * 0.52, trunk, MAT.PLAIN, 8);
  const top = h * 0.62;
  b.sphere(x, top, z, h * 0.34, h * 0.3, h * 0.34, leaf, MAT.FOLIAGE, 10, 7);
  b.sphere(
    x + 0.16 * h * (hash01(seed) - 0.5) * 2,
    top + h * 0.24,
    z + 0.16 * h * (hash01(seed + 7) - 0.5) * 2,
    h * 0.23,
    h * 0.2,
    h * 0.23,
    shade(leaf, 1.09),
    MAT.FOLIAGE,
    9,
    6
  );
  b.sphere(
    x - 0.2 * h,
    top - h * 0.1,
    z + 0.12 * h,
    h * 0.18,
    h * 0.16,
    h * 0.18,
    shade(leaf, 0.93),
    MAT.FOLIAGE,
    9,
    6
  );
}

/** 灌木/花丛：单个压扁球 */
export function bush(
  b: Builder,
  x: number,
  z: number,
  s = 0.4,
  color = "#8fd06a"
): void {
  b.sphere(x, s * 0.7, z, s, s * 0.75, s, color, MAT.FOLIAGE, 9, 6);
}

/** 简易小人：动森式无脸角色，圆头 + 圆身 */
export function person(
  b: Builder,
  x: number,
  z: number,
  y: number,
  shirt = "#f2a1a1",
  scale = 1
): void {
  const s = scale;
  b.cylinder(x, y + 0.3 * s, z, 0.1 * s, 0.115 * s, 0.42 * s, shirt, MAT.PLAIN, 9);
  b.sphere(x, y + 0.62 * s, z, 0.135 * s, 0.14 * s, 0.13 * s, "#f6d5b0", MAT.PLAIN, 9, 6);
  b.sphere(x, y + 0.72 * s, z, 0.145 * s, 0.1 * s, 0.14 * s, "#5b4636", MAT.PLAIN, 9, 6);
}

export function hash01(n: number): number {
  const a = Math.sin(n * 12.9898) * 43758.5453;
  return a - Math.floor(a);
}

/**
 * 把图集里的一块牌面贴成一块四边形。
 * UV 顺序与 Atlas 的翻转约定配套（画布顶边 = v1），正反面都能看（渲染器关了背面剔除）。
 */
export function atlasQuad(
  b: Builder,
  rect: { u0: number; v0: number; u1: number; v1: number },
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  ay = 0,
  ax = 0
): void {
  b.push(x, y, z, ax, ay);
  const hw = w / 2;
  const hh = h / 2;
  b.quad(
    [-hw, -hh, 0],
    [hw, -hh, 0],
    [hw, hh, 0],
    [-hw, hh, 0],
    "#ffffff",
    MAT.ATLAS,
    [0, 0, 1],
    [
      [rect.u0, rect.v0],
      [rect.u1, rect.v0],
      [rect.u1, rect.v1],
      [rect.u0, rect.v1],
    ]
  );
  b.pop();
}
