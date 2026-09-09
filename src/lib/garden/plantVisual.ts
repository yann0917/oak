// 阶段 → 构件外观（纯函数，调参集中在这里）
export interface PartTransform {
  visible: boolean;
  scale: number;
  yScale: number;
  opacity: number;
}

export interface PlantVisual {
  stem: PartTransform;
  foliage: PartTransform;
  flower: PartTransform;
  fruit: PartTransform;
}

const HIDDEN: PartTransform = { visible: false, scale: 0, yScale: 1, opacity: 0 };
const shown = (scale: number, yScale = 1, opacity = 1): PartTransform => ({
  visible: true,
  scale,
  yScale,
  opacity,
});

/** stage 0 幼苗 1 成长 2 花苞 3 开花 4 结果 */
export function partTransforms(stage: number): PlantVisual {
  switch (stage) {
    case 0:
      return { stem: shown(0.35), foliage: shown(0.45), flower: HIDDEN, fruit: HIDDEN };
    case 1:
      return { stem: shown(0.75), foliage: shown(0.85), flower: HIDDEN, fruit: HIDDEN };
    case 2:
      return { stem: shown(1), foliage: shown(1), flower: shown(0.45), fruit: HIDDEN };
    case 3:
      return { stem: shown(1), foliage: shown(1), flower: shown(1), fruit: HIDDEN };
    default:
      return { stem: shown(1), foliage: shown(1), flower: shown(0.6, 1, 0.35), fruit: shown(1) };
  }
}
