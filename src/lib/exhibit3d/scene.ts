// 场景合成：展厅外壳（引擎提供）+ 展品模型（内容插入）
//
// 顺序很重要：几何构建时会往名牌图集里排牌面，所以必须
//   建几何 → 图集画满 → 再把图集交给渲染器上传（见 ExhibitHall.tsx）。
import { Atlas } from "./atlas";
import { Builder } from "./builder";
import { HALL_CLEAR, PLINTH_TOP, buildHall, hallWallRadius, plinthSize, plinthStuds } from "./hall";
import { buildKindergarten, type KindergartenData } from "./exhibits/kindergarten";
import type { ExhibitSceneData, Hotspot } from "./renderer";

export interface BuiltScene {
  scene: ExhibitSceneData;
  atlas: Atlas;
}

/** 展品几何以 y=0 为地面建模；名牌与点击盒都要跟着台面一起抬高 */
function lift(hotspots: Hotspot[]): Hotspot[] {
  return hotspots.map((h) => ({
    id: h.id,
    label: h.label,
    box: {
      min: [h.box.min[0], h.box.min[1] + PLINTH_TOP, h.box.min[2]],
      max: [h.box.max[0], h.box.max[1] + PLINTH_TOP, h.box.max[2]],
    },
  }));
}

/** 展品：幼儿园（数据来自 schools / enrollments） */
export function buildKindergartenScene(data: KindergartenData): BuiltScene {
  const atlas = new Atlas();
  const b = new Builder();

  // 名牌先排进图集（展台上唯一的文字来源）。
  // 宽高比必须与 hall.ts 的 PLATE_ASPECT 一致，否则牌面会被拉伸。
  const plaque = atlas.add(
    "plinth-plaque",
    1600,
    300,
    atlas.plaque(1600, 300, data.schoolName, data.address)
  );

  // 1) 先把模型建起来。它同时回报实际占地，展厅外壳的尺寸完全由它推导。
  //    模型与外壳分两个 Builder：外壳只接收阴影、不投射（见 ExhibitSceneData.hallVertices）。
  b.push(0, PLINTH_TOP, 0);
  const built = buildKindergarten(b, atlas, data);
  b.pop();

  // 2) 再铺展厅外壳与展台名牌
  const hallBuilder = new Builder();
  buildHall(hallBuilder, { footprint: built.footprint, plaque: { rect: plaque } });
  plinthStuds(hallBuilder, built.footprint);

  // 取景半径 = 展台占地的半对角线，留一点余量
  const p = plinthSize(built.footprint);
  const radius = Math.hypot(p.w / 2, p.d / 2) * 1.06;

  return {
    atlas,
    scene: {
      vertices: b.data,
      hallVertices: hallBuilder.data,
      center: built.center,
      radius,
      hotspots: lift(built.hotspots),
      // 略偏右前，正好把主楼正面、操场与大门一起框进来
      defaultYaw: Math.PI * 0.17,
      defaultPitch: 0.5,
      background: HALL_CLEAR,
      wallRadius: hallWallRadius(built.footprint),
    },
  };
}
