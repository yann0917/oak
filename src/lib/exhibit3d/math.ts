// 展厅 3D 渲染核 · 向量与矩阵
// 参考 whistlevale 的手写 WebGL2 思路，但只保留展品需要的最小集合：
// 没有后处理、没有粒子、没有地形；光照走「动森式」平涂分带，不走照片感 PBR。
export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function mul(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function len(a: Vec3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

export function norm(a: Vec3): Vec3 {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function lerpV(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function clamp(x: number, a = 0, b = 1): number {
  return x < a ? a : x > b ? b : x;
}

/** 确定性伪随机：同样的输入永远得到同样的输出（程序化细节不能抖） */
export function hash(x: number, z: number): number {
  const a = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return a - Math.floor(a);
}

export function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

// ---------- 颜色 ----------

const colorCache = new Map<string, Vec3>();

/** "#rrggbb" → 线性 0..1 三元组（带缓存，几何构建里调用极频繁） */
export function col(hex: string): Vec3 {
  const hit = colorCache.get(hex);
  if (hit) return hit;
  const h = parseInt(hex.slice(1), 16);
  const c: Vec3 = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  colorCache.set(hex, c);
  return c;
}

/** 明度缩放，用于程序化区分相邻块面（避免大片死平） */
export function shade(c: string | Vec3, k: number): Vec3 {
  const b = typeof c === "string" ? col(c) : c;
  return [clamp(b[0] * k), clamp(b[1] * k), clamp(b[2] * k)];
}

// ---------- 矩阵 ----------

export function ident(): Mat4 {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function mm(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

export function trans(x: number, y: number, z: number): Mat4 {
  const a = ident();
  a[12] = x;
  a[13] = y;
  a[14] = z;
  return a;
}

export function scaling(x: number, y = x, z = x): Mat4 {
  const a = ident();
  a[0] = x;
  a[5] = y;
  a[10] = z;
  return a;
}

export function rx(t: number): Mat4 {
  const a = ident();
  const c = Math.cos(t);
  const s = Math.sin(t);
  a[5] = c;
  a[6] = s;
  a[9] = -s;
  a[10] = c;
  return a;
}

export function ry(t: number): Mat4 {
  const a = ident();
  const c = Math.cos(t);
  const s = Math.sin(t);
  a[0] = c;
  a[2] = -s;
  a[8] = s;
  a[10] = c;
  return a;
}

export function rz(t: number): Mat4 {
  const a = ident();
  const c = Math.cos(t);
  const s = Math.sin(t);
  a[0] = c;
  a[1] = s;
  a[4] = -s;
  a[5] = c;
  return a;
}

export function transform(p: Vec3, m: Mat4): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

/**
 * 法线的逆转置。非等比缩放下直接用模型矩阵会把法线拉歪，
 * 法线矩阵必须与顶点矩阵分开算。
 */
export function normalMatrix(m: Mat4): Mat4 {
  const a = m[0], b = m[1], c = m[2];
  const d = m[4], e = m[5], f = m[6];
  const g = m[8], h = m[9], i = m[10];
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C || 1;
  const o = ident();
  o[0] = A / det;
  o[1] = B / det;
  o[2] = C / det;
  o[4] = (c * h - b * i) / det;
  o[5] = (a * i - c * g) / det;
  o[6] = (b * g - a * h) / det;
  o[8] = (b * f - c * e) / det;
  o[9] = (c * d - a * f) / det;
  o[10] = (a * e - b * d) / det;
  return o;
}

export function lookAt(eye: Vec3, target: Vec3): Mat4 {
  const z = norm(sub(eye, target));
  const x = norm(cross([0, 1, 0], z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

export function perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

export function ortho(l: number, r: number, b: number, t: number, n: number, f: number): Mat4 {
  return new Float32Array([
    2 / (r - l), 0, 0, 0,
    0, 2 / (t - b), 0, 0,
    0, 0, -2 / (f - n), 0,
    -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1,
  ]);
}

/** 以 a→b 为局部 +Z 轴构造基向量（梁、沿线摆放的构件用） */
export function basis(p: Vec3, f: Vec3): Mat4 {
  const fw = norm(f);
  const ref: Vec3 = Math.abs(fw[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0];
  const right = norm(cross(ref, fw));
  const up = cross(fw, right);
  return new Float32Array([
    right[0], right[1], right[2], 0,
    up[0], up[1], up[2], 0,
    fw[0], fw[1], fw[2], 0,
    p[0], p[1], p[2], 1,
  ]);
}

// ---------- 射线（点击展品用） ----------

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

/** 射线与轴对齐盒求交，返回进入距离；未命中返回 -1 */
export function rayAabb(origin: Vec3, dir: Vec3, box: Aabb): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const d = dir[i];
    const o = origin[i];
    if (Math.abs(d) < 1e-8) {
      if (o < box.min[i] || o > box.max[i]) return -1;
      continue;
    }
    let t1 = (box.min[i] - o) / d;
    let t2 = (box.max[i] - o) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin >= 0 ? tmin : -1;
}
