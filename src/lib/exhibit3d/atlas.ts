// 展厅 3D 渲染核 · 名牌图集
//
// 3D 场景里不放任何图片文件：名牌、招牌、说明牌全部在启动时用 Canvas 2D 画进一张
// 图集贴图，再按 UV 贴到几何面上（whistlevale 的 artSlot 思路）。
// 好处是中文可以直接用系统字体排版，不需要预生成 PNG。

export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

const ATLAS_W = 2048;
const ATLAS_H = 1024;
const PAD = 3;

/** 中文字体栈：跨 macOS / Windows / Android 都能落到一个有 CJK 的字体上 */
export const CJK_FONT =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif';

/**
 * 估算一行文字占多少个 em。
 *
 * 必须按字符宽度算，不能用「字符数 × 一个系数」：汉字约 1.0 em、拉丁约 0.55 em。
 * 早期版本按拉丁的 0.62 估算，一个 11 字的园名被画成 2024px 宽、
 * 远超牌面的 1376px 可用宽度，结果牌子上只剩几个被裁掉一半的巨字。
 */
function emWidth(text: string): number {
  let em = 0;
  for (const ch of text) {
    em += /[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/.test(ch) ? 1 : 0.55;
  }
  return Math.max(em, 1);
}

/** 在给定宽度内排下文字的最大字号，并受上限约束 */
function fitSize(text: string, maxWidth: number, maxSize: number): number {
  return Math.min(maxSize, maxWidth / emWidth(text));
}

/** 放不下时截断加省略号（保留可读性，避免缩到看不清） */
function ellipsize(text: string, maxWidth: number, size: number): string {
  if (emWidth(text) * size <= maxWidth) return text;
  const keep = Math.max(1, Math.floor(maxWidth / size) - 1);
  return text.slice(0, keep) + "…";
}

export class Atlas {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private x = PAD;
  private y = PAD;
  private rowH = 0;
  private slots = new Map<string, UvRect>();

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = ATLAS_W;
    this.canvas.height = ATLAS_H;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D 不可用");
    this.ctx = ctx;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
  }

  /**
   * 画一块牌面进图集。draw 拿到的坐标系原点在左上角。
   * 放不下时换行；整张图集画满会抛错（展品数量应该远小于容量）。
   */
  add(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): UvRect {
    const cached = this.slots.get(key);
    if (cached) return cached;
    if (this.x + w + PAD > ATLAS_W) {
      this.x = PAD;
      this.y += this.rowH + PAD;
      this.rowH = 0;
    }
    if (this.y + h + PAD > ATLAS_H) {
      throw new Error("名牌图集已满：展品数量超出单张 2048x1024 容量");
    }
    const px = this.x;
    const py = this.y;
    this.ctx.save();
    this.ctx.translate(px, py);
    draw(this.ctx, w, h);
    this.ctx.restore();
    // WebGL 的 V 轴向上，这里把画布坐标翻过来
    const rect: UvRect = {
      u0: px / ATLAS_W,
      v0: 1 - (py + h) / ATLAS_H,
      u1: (px + w) / ATLAS_W,
      v1: 1 - py / ATLAS_H,
    };
    this.slots.set(key, rect);
    this.x += w + PAD;
    this.rowH = Math.max(this.rowH, h);
    return rect;
  }

  has(key: string): boolean {
    return this.slots.has(key);
  }

  /** 深色木牌 + 米色字，展台名牌的统一风格（标题 + 副标题两行） */
  plaque(w: number, h: number, title: string, subtitle?: string): (c: CanvasRenderingContext2D) => void {
    return (c) => {
      c.fillStyle = "#3f3524";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "#c9ae78";
      c.lineWidth = Math.max(2, h * 0.035);
      c.strokeRect(h * 0.09, h * 0.09, w - h * 0.18, h - h * 0.18);
      const inner = w - h * 0.34;
      const titleSize = fitSize(title, inner, h * 0.4);
      c.fillStyle = "#f3e6c8";
      c.font = `700 ${titleSize}px ${CJK_FONT}`;
      c.fillText(ellipsize(title, inner, titleSize), w / 2, subtitle ? h * 0.4 : h * 0.52);
      if (subtitle) {
        const subSize = fitSize(subtitle, inner, h * 0.2);
        c.font = `${subSize}px ${CJK_FONT}`;
        c.fillStyle = "#bfae8b";
        c.fillText(ellipsize(subtitle, inner, subSize), w / 2, h * 0.72);
      }
    };
  }

  /** 贴在墙面/门楣上的浅色说明牌（单行） */
  sign(w: number, h: number, text: string, bg = "#fdf6e3", fg = "#5b6b52"): (c: CanvasRenderingContext2D) => void {
    return (c) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = fg;
      c.lineWidth = Math.max(2, h * 0.05);
      c.strokeRect(h * 0.1, h * 0.1, w - h * 0.2, h - h * 0.2);
      const inner = w - h * 0.4;
      const size = fitSize(text, inner, h * 0.44);
      c.fillStyle = fg;
      c.font = `700 ${size}px ${CJK_FONT}`;
      c.fillText(ellipsize(text, inner, size), w / 2, h / 2);
    };
  }
}
