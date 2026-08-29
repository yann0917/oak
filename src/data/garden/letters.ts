// 字母天地内容：26 个字母 + 例词配图（emoji 仅作学习内容插图）
export interface LetterItem {
  letter: string; // 大写
  lower: string; // 小写
  word: string; // 例词
  zh: string; // 例词中文
  emoji: string; // 例词配图
  endsWith?: boolean; // x 等不以例词开头的字母，题目措辞改为"含有该字母"
}

export const LETTERS: LetterItem[] = [
  { letter: "A", lower: "a", word: "apple", zh: "苹果", emoji: "🍎" },
  { letter: "B", lower: "b", word: "bear", zh: "熊", emoji: "🐻" },
  { letter: "C", lower: "c", word: "cat", zh: "猫", emoji: "🐱" },
  { letter: "D", lower: "d", word: "dog", zh: "狗", emoji: "🐶" },
  { letter: "E", lower: "e", word: "elephant", zh: "大象", emoji: "🐘" },
  { letter: "F", lower: "f", word: "fish", zh: "鱼", emoji: "🐟" },
  { letter: "G", lower: "g", word: "grape", zh: "葡萄", emoji: "🍇" },
  { letter: "H", lower: "h", word: "house", zh: "房子", emoji: "🏠" },
  { letter: "I", lower: "i", word: "ice cream", zh: "冰淇淋", emoji: "🍦" },
  { letter: "J", lower: "j", word: "juice", zh: "果汁", emoji: "🧃" },
  { letter: "K", lower: "k", word: "kite", zh: "风筝", emoji: "🪁" },
  { letter: "L", lower: "l", word: "lion", zh: "狮子", emoji: "🦁" },
  { letter: "M", lower: "m", word: "monkey", zh: "猴子", emoji: "🐵" },
  { letter: "N", lower: "n", word: "nose", zh: "鼻子", emoji: "👃" },
  { letter: "O", lower: "o", word: "orange", zh: "橙子", emoji: "🍊" },
  { letter: "P", lower: "p", word: "pig", zh: "猪", emoji: "🐷" },
  { letter: "Q", lower: "q", word: "queen", zh: "女王", emoji: "👑" },
  { letter: "R", lower: "r", word: "rabbit", zh: "兔子", emoji: "🐰" },
  { letter: "S", lower: "s", word: "sun", zh: "太阳", emoji: "☀️" },
  { letter: "T", lower: "t", word: "tiger", zh: "老虎", emoji: "🐯" },
  { letter: "U", lower: "u", word: "umbrella", zh: "雨伞", emoji: "☂️" },
  { letter: "V", lower: "v", word: "violin", zh: "小提琴", emoji: "🎻" },
  { letter: "W", lower: "w", word: "watermelon", zh: "西瓜", emoji: "🍉" },
  { letter: "X", lower: "x", word: "box", zh: "盒子", emoji: "📦", endsWith: true },
  { letter: "Y", lower: "y", word: "yellow", zh: "黄色", emoji: "🟡" },
  { letter: "Z", lower: "z", word: "zebra", zh: "斑马", emoji: "🦓" },
];
