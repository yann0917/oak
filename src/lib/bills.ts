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
