/** 卡证档案分类：页面表单与 AI 快记分流共用，不含服务端依赖（可不限于此，选择」其他」即可） */
export const CERT_CATEGORIES = [
  "证件",
  "证明",
  "病历",
  "检测单",
  "检测报告",
  "协议",
  "证书",
  "其他",
];

export const CERT_CATEGORY_COLOR: Record<string, string> = {
  证件: "app-blue",
  证明: "app-green",
  病历: "app-red",
  检测单: "app-teal",
  检测报告: "app-orange",
  协议: "purple",
  证书: "app-yellow",
  其他: "default",
};
