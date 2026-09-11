// 展厅 3D 渲染核 · 渲染器
//
// 与 whistlevale 的取舍差异（都是刻意的）：
//  - 开 MSAA（antialias:true）而不自己做后处理：平涂画风里清晰的边缘比后处理效果重要，
//    省掉一整条 scene FBO → 后处理 → 屏幕的通路。
//  - 分辨率仍然封顶（照搬那条最值钱的经验），避免高 DPI 大屏把填充率吃光。
//  - 没有昼夜循环、没有粒子、没有雾：展品是「打开展柜看到的模型」，不是可探索的世界。
import { FLOATS_PER_VERTEX } from "./builder";
import {
  add,
  cross,
  mul,
  norm,
  ortho,
  lookAt,
  mm,
  perspective,
  rayAabb,
  sub,
  clamp,
  type Aabb,
  type Mat4,
  type Vec3,
} from "./math";
import { FRAG, SHADOW_FRAG, SHADOW_VERT, VERT } from "./shaders";

export interface Hotspot {
  id: string;
  label: string;
  box: Aabb;
}

export interface ExhibitSceneData {
  /** 交错顶点：position(3) normal(3) color(3) mat(1) uv(2)。**会投射阴影** */
  vertices: number[];
  /**
   * 展厅外壳（地面/展台/展墙）的顶点。**只接收阴影、不投射**。
   *
   * 必须分开：展墙有几十米高，如果参与阴影投射，它会挡住阳光、
   * 给整个展品盖上一层巨影（实测：地面只剩环境光，整幅画面发灰发暗）。
   * 阴影贴图也该只花在展品身上，分辨率才够用。
   */
  hallVertices?: number[];
  /** 取景中心（模型几何中心，y 一般在底座之上） */
  center: Vec3;
  /** 包围半径：决定相机默认距离、阴影正交盒大小、缩放范围 */
  radius: number;
  /** 可点击部位（轴对齐盒） */
  hotspots: Hotspot[];
  /** 默认机位（弧度）；不传则用 45° 侧前方 */
  defaultYaw?: number;
  defaultPitch?: number;
  /** 背景清屏色（0..1） */
  background?: Vec3;
  /**
   * 环形展墙半径。相机会环绕展品，必须被约束在墙内——
   * 一旦跑到墙外，看到的是墙的外表面，整个画面会被墙糊满。
   * 不传则不做约束（露天展品）。
   */
  wallRadius?: number;
}

interface Mesh {
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  count: number;
}

const SUN_DIR: Vec3 = [-0.45, 0.78, 0.44];
const SHADOW_SIZE = 2048;
/** 视野角（弧度）。pick() 与 render() 必须用同一个，否则点击位置对不上画面 */
const FOV = 0.62;

export class ExhibitRenderer {
  private gl: WebGL2RenderingContext;
  private mainProgram: WebGLProgram;
  private shadowProgram: WebGLProgram;
  private uniforms = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private mesh: Mesh | null = null;
  private hallMesh: Mesh | null = null;
  private data: ExhibitSceneData | null = null;
  private atlasTexture: WebGLTexture;
  private shadowFbo: WebGLFramebuffer;
  private shadowTex: WebGLTexture;
  private screenW = 0;
  private screenH = 0;

  // 相机
  private yaw = Math.PI * 0.24;
  private pitch = 0.52;
  private distance = 40;
  private target: Vec3 = [0, 0, 0];
  private eye: Vec3 = [0, 0, 0];
  private vp: Mat4 = perspective(1, 1, 0.1, 100);
  private lightVP: Mat4 = perspective(1, 1, 0.1, 100);
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, atlasCanvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("需要 WebGL 2 支持才能查看立体展品");
    this.gl = gl;

    this.mainProgram = this.program(VERT, FRAG);
    this.shadowProgram = this.program(SHADOW_VERT, SHADOW_FRAG);

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0.09, 0.11, 0.13, 1);

    // 阴影：只写深度
    this.shadowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // 名牌图集
    this.atlasTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  private program(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (src: string, type: number) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error("着色器编译失败: " + gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(vs, gl.VERTEX_SHADER));
    gl.attachShader(p, compile(fs, gl.FRAGMENT_SHADER));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("着色器链接失败: " + gl.getProgramInfoLog(p));
    }
    return p;
  }

  private loc(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    let map = this.uniforms.get(p);
    if (!map) {
      map = new Map();
      this.uniforms.set(p, map);
    }
    if (!map.has(name)) map.set(name, this.gl.getUniformLocation(p, name));
    return map.get(name) ?? null;
  }

  /** 上传一段交错顶点数据为一个可绘制对象 */
  private uploadMesh(vertices: number[]): Mesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    const stride = FLOATS_PER_VERTEX * 4;
    const sizes = [3, 3, 3, 1, 2];
    const offsets = [0, 12, 24, 36, 40];
    for (let i = 0; i < sizes.length; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, sizes[i], gl.FLOAT, false, stride, offsets[i]);
    }
    gl.bindVertexArray(null);
    return { vao, buffer, count: vertices.length / FLOATS_PER_VERTEX };
  }

  private dropMesh(mesh: Mesh | null): void {
    if (!mesh) return;
    this.gl.deleteVertexArray(mesh.vao);
    this.gl.deleteBuffer(mesh.buffer);
  }

  /** 上传展品几何。重复调用会替换旧模型并释放旧缓冲。 */
  load(data: ExhibitSceneData): void {
    this.dropMesh(this.mesh);
    this.dropMesh(this.hallMesh);
    this.mesh = this.uploadMesh(data.vertices);
    this.hallMesh = data.hallVertices?.length ? this.uploadMesh(data.hallVertices) : null;

    this.data = data;
    this.target = data.center;
    this.yaw = data.defaultYaw ?? Math.PI * 0.24;
    this.pitch = data.defaultPitch ?? 0.52;
    this.resetView();
    const bg = data.background ?? [0.9, 0.9, 0.88];
    this.gl.clearColor(bg[0], bg[1], bg[2], 1);

    // 阴影正交盒：按模型半径撑开，光沿固定方向照进来
    const R = data.radius * 1.15;
    const lightPos = add(data.center, mul(norm(SUN_DIR), R * 2.6));
    this.lightVP = mm(ortho(-R, R, -R, R, 1, R * 5.4), lookAt(lightPos, data.center));
  }

  /** 复位到默认机位 */
  resetView(): void {
    if (!this.data) return;
    this.distance = this.data.radius * 2.0;
    this.pitch = this.data.defaultPitch ?? 0.52;
    this.yaw = this.data.defaultYaw ?? Math.PI * 0.24;
    this.clampToWall();
  }

  /**
   * 把相机拉回展墙以内：限制的是**水平距离**（相机到中轴线的距离），
   * 而不是到目标的直线距离——倾斜看的时候直线距离够短，水平却已经出墙了。
   */
  private clampToWall(): void {
    const wall = this.data?.wallRadius;
    if (!wall) return;
    const maxHoriz = wall - Math.max(3, wall * 0.09);
    const horiz = Math.cos(this.pitch) * this.distance;
    if (horiz > maxHoriz) {
      // 俯角很大时 cos 很小，除法会把距离推得极远；用水平最小值兜底
      this.distance = maxHoriz / Math.max(Math.cos(this.pitch), 0.2);
    }
  }

  orbit(dx: number, dy: number): void {
    if (!this.data) return;
    this.yaw -= dx * 0.007;
    this.pitch = clamp(this.pitch + dy * 0.006, 0.06, 1.32);
    this.clampToWall();
  }

  zoom(factor: number): void {
    if (!this.data) return;
    const min = this.data.radius * 0.85;
    const max = this.data.radius * 2.2;
    this.distance = clamp(this.distance * factor, min, max);
    this.clampToWall();
  }

  /** 屏幕坐标 → 展品上的可点击部位 id（没打中返回 null） */
  pick(clientX: number, clientY: number, rect: DOMRect): string | null {
    if (!this.data) return null;
    // 必须减掉画布原点：clientX/Y 是**页面**坐标，直接用会把光线方向算偏，
    // 表现为点哪儿都不中。
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
    const forward = norm(sub(this.target, this.eye));
    // 右向量必须是 cross(forward, 世界上方向)。写成 cross(世界上方向, forward)
    // 得到的是「左」，屏幕 X 会左右镜像，点击位置和看到的差一个反号。
    const right = norm(cross(forward, [0, 1, 0]));
    const up = cross(right, forward);
    // 与 render() 用的是同一个 fov，否则点击位置会和看到的对不上
    const fov = FOV;
    const aspect = rect.width / rect.height;
    const tanY = Math.tan(fov / 2);
    const dir = norm(
      add(forward, add(mul(right, ndcX * tanY * aspect), mul(up, ndcY * tanY)))
    );
    let best: { id: string; t: number } | null = null;
    for (const h of this.data.hotspots) {
      const t = rayAabb(this.eye, dir, h.box);
      if (t > 0 && (!best || t < best.t)) best = { id: h.id, t };
    }
    return best ? best.id : null;
  }

  resize(): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    const cw = canvas.clientWidth || 1;
    const ch = canvas.clientHeight || 1;
    const dpr = window.devicePixelRatio || 1;
    // 分辨率封顶：高 DPI 大屏上按 DPR 全量渲染会把填充率吃光，
    // 这条是 whistlevale 最值钱的经验之一（既好看又跑得动）。
    const ratio = Math.min(dpr, 1.75, Math.sqrt(3_000_000 / (cw * ch)));
    const w = Math.max(1, Math.round(cw * ratio));
    const h = Math.max(1, Math.round(ch * ratio));
    if (w === this.screenW && h === this.screenH) return;
    this.screenW = w;
    this.screenH = h;
    canvas.width = w;
    canvas.height = h;
  }

  render(time: number): void {
    if (this.disposed || !this.mesh || !this.data) return;
    const gl = this.gl;
    this.resize();
    const aspect = this.screenW / Math.max(this.screenH, 1);

    // 相机：绕模型环绕，仰角受限（不钻到地底下）
    const cp = Math.cos(this.pitch);
    const eye = add(this.target, [
      Math.sin(this.yaw) * cp * this.distance,
      Math.sin(this.pitch) * this.distance,
      Math.cos(this.yaw) * cp * this.distance,
    ]);
    this.eye = eye;
    this.vp = mm(perspective(FOV, aspect, this.data.radius * 0.05, this.data.radius * 12), lookAt(eye, this.target));

    // ---- 阴影 pass：**只画展品**。展厅外壳（尤其那圈高墙）不参与投射，
    //      否则它会挡住阳光、给整个展品盖一层巨影 ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.shadowProgram);
    gl.uniformMatrix4fv(this.loc(this.shadowProgram, "uLightVP"), false, this.lightVP);
    gl.uniformMatrix4fv(this.loc(this.shadowProgram, "uModel"), false, IDENT);
    gl.bindVertexArray(this.mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.mesh.count);

    // ---- 主 pass ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.screenW, this.screenH);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const p = this.mainProgram;
    gl.useProgram(p);
    gl.uniformMatrix4fv(this.loc(p, "uVP"), false, this.vp);
    gl.uniformMatrix4fv(this.loc(p, "uModel"), false, IDENT);
    gl.uniformMatrix4fv(this.loc(p, "uLightVP"), false, this.lightVP);
    gl.uniform3fv(this.loc(p, "uEye"), eye);
    gl.uniform3fv(this.loc(p, "uSun"), norm(SUN_DIR));
    gl.uniform1f(this.loc(p, "uTime"), time);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(this.loc(p, "uShadow"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.uniform1i(this.loc(p, "uAtlas"), 1);
    // 先画展厅（接收阴影），再画展品
    if (this.hallMesh) {
      gl.bindVertexArray(this.hallMesh.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.hallMesh.count);
    }
    gl.bindVertexArray(this.mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.mesh.count);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    this.dropMesh(this.mesh);
    this.dropMesh(this.hallMesh);
    this.mesh = null;
    this.hallMesh = null;
    gl.deleteFramebuffer(this.shadowFbo);
    gl.deleteTexture(this.shadowTex);
    gl.deleteTexture(this.atlasTexture);
    gl.deleteProgram(this.mainProgram);
    gl.deleteProgram(this.shadowProgram);
  }
}

const IDENT: Mat4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
