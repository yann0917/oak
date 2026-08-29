// 颜色认知内容：12 种常见颜色，中英文 + 色值
export interface ColorItem {
  zh: string;
  en: string;
  hex: string;
}

export const COLORS: ColorItem[] = [
  { zh: "红色", en: "red", hex: "#e53935" },
  { zh: "橙色", en: "orange", hex: "#f57c00" },
  { zh: "黄色", en: "yellow", hex: "#fdd835" },
  { zh: "绿色", en: "green", hex: "#43a047" },
  { zh: "蓝色", en: "blue", hex: "#1e88e5" },
  { zh: "紫色", en: "purple", hex: "#8e24aa" },
  { zh: "粉色", en: "pink", hex: "#ec407a" },
  { zh: "棕色", en: "brown", hex: "#795548" },
  { zh: "黑色", en: "black", hex: "#37474f" },
  { zh: "白色", en: "white", hex: "#ffffff" },
  { zh: "灰色", en: "gray", hex: "#9e9e9e" },
  { zh: "金色", en: "gold", hex: "#d4af37" },
];
