/** 账单类型与方向选项：账单页表单与 AI 快记分流共用，不含服务端依赖 */
export const BILL_TYPES = [
  "学费",
  "餐费",
  "校车费",
  "兴趣班",
  "医疗",
  "购物",
  "交通",
  "水电",
  "生活费",
  "收入",
  "其他",
];

export const BILL_DIRECTIONS = ["支出", "收入"];

export const BILL_STATUSES = ["已缴", "未缴"];

export const BILL_TYPE_COLOR: Record<string, string> = {
  学费: "app-blue",
  餐费: "app-orange",
  校车费: "purple",
  兴趣班: "warm-peach-pink",
  医疗: "app-green",
  购物: "app-yellow",
  交通: "app-teal",
  水电: "app-blue",
  生活费: "app-orange",
  收入: "app-green",
  其他: "default",
};

/** 饼图切片配色：与 BILL_TYPE_COLOR 对齐，但学费/水电、餐费/生活费用深浅区分避免同色 */
export const BILL_TYPE_HEX: Record<string, string> = {
  学费: "#889df0",
  水电: "#5068d8",
  餐费: "#e59266",
  生活费: "#f2c29b",
  校车费: "#b77dee",
  兴趣班: "#e18c6f",
  医疗: "#8ac68a",
  购物: "#f7cd67",
  交通: "#82d5bb",
  收入: "#8ac68a",
  其他: "#c4b89e",
};

/** 自定义类型（不在上表）时按序轮换取色 */
export const BILL_TYPE_HEX_FALLBACK = ["#f8a6b2", "#9a835a", "#d1da49", "#ecdf52", "#fc736d"];
