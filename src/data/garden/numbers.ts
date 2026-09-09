// 数字王国内容：0-20 数字的中英文读法（认数字卡墙 + 听一听点读用）
export interface NumberItem {
  n: number;
  cn: string; // 中文读法
  en: string; // 英文读法
}

export const NUMBERS: NumberItem[] = [
  { n: 0, cn: "零", en: "zero" },
  { n: 1, cn: "一", en: "one" },
  { n: 2, cn: "二", en: "two" },
  { n: 3, cn: "三", en: "three" },
  { n: 4, cn: "四", en: "four" },
  { n: 5, cn: "五", en: "five" },
  { n: 6, cn: "六", en: "six" },
  { n: 7, cn: "七", en: "seven" },
  { n: 8, cn: "八", en: "eight" },
  { n: 9, cn: "九", en: "nine" },
  { n: 10, cn: "十", en: "ten" },
  { n: 11, cn: "十一", en: "eleven" },
  { n: 12, cn: "十二", en: "twelve" },
  { n: 13, cn: "十三", en: "thirteen" },
  { n: 14, cn: "十四", en: "fourteen" },
  { n: 15, cn: "十五", en: "fifteen" },
  { n: 16, cn: "十六", en: "sixteen" },
  { n: 17, cn: "十七", en: "seventeen" },
  { n: 18, cn: "十八", en: "eighteen" },
  { n: 19, cn: "十九", en: "nineteen" },
  { n: 20, cn: "二十", en: "twenty" },
];
