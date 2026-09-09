"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { PLOT_COLS, PLOT_ROWS, TILE, slotToPosition } from "@/lib/garden/plotLayout";
import { speciesMeta } from "@/lib/garden/species";
import { partTransforms } from "@/lib/garden/plantVisual";

export interface PlotView {
  id: number;
  slot: number;
  species: string;
  stage: number;
  nickname: string;
}

export interface GardenScene3DProps {
  plots: PlotView[];
  arranging?: boolean;
  onSelect?: (id: number | null) => void;
  onMoveSlot?: (id: number, slot: number) => void;
}

const SKY = 0xcdebf6;
const GROUND = 0xb0d491;
// 网格线不受光照影响，直接按 sRGB 输出；与受光地面（约 #97b271）拉开约 40/255 亮度差
const GRID_CENTER = 0x5c8a44;
const GRID_LINE = 0x69984e;

type PartName = "stem" | "foliage" | "flower" | "fruit";

interface SpeciesParts {
  parts: Record<PartName, THREE.Object3D>;
  /** GLB 实测包围盒高度（米）。species.ts 的声明高度与模型实际差 11~15%，缩放以实测为准 */
  bboxHeight: number;
}

const glbCache = new Map<string, Promise<SpeciesParts>>();

// 模板资源登记表：three 的 clone() 让克隆实例与模板共享 geometry/material 引用，
// 而模板在 glbCache 里跨重建/跨挂载复用，所以释放实例时必须跳过这些共享资源
const templateGeometries = new WeakSet<THREE.BufferGeometry>();
const templateMaterials = new WeakSet<THREE.Material>();

/** 把 GLB 模板自有的几何体/材质登记为共享资源（克隆实例不得释放） */
function registerTemplateResources(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) templateGeometries.add(mesh.geometry);
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => templateMaterials.add(m));
    else if (material) templateMaterials.add(material);
  });
}

/** 加载物种 GLB（同一物种只请求一次），返回构件模板与实测高度 */
function loadSpeciesParts(loader: GLTFLoader, file: string): Promise<SpeciesParts> {
  const cached = glbCache.get(file);
  if (cached) return cached;
  const p = loader.loadAsync(`/models/garden/${file}.glb`).then((gltf) => {
    const root = gltf.scene;
    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(root).getSize(size);
    registerTemplateResources(root);
    return { parts: extractParts(root), bboxHeight: size.y };
  });
  glbCache.set(file, p);
  // 加载失败时把失败的 promise 移出缓存，下次还能重试
  p.catch(() => {
    if (glbCache.get(file) === p) glbCache.delete(file);
  });
  return p;
}

function extractParts(root: THREE.Object3D): Record<PartName, THREE.Object3D> {
  const out: Partial<Record<PartName, THREE.Object3D>> = {};
  root.traverse((o) => {
    const name = o.name.toLowerCase();
    if (name === "stem" || name === "foliage" || name === "flower" || name === "fruit") {
      out[name as PartName] = o;
    }
  });
  return out as Record<PartName, THREE.Object3D>;
}

/** 用构件模板装配一株植物：阶段决定缩放与显隐 */
function buildPlant(
  parts: Record<PartName, THREE.Object3D>,
  stage: number,
  scale: number
): THREE.Group {
  const visual = partTransforms(stage);
  const group = new THREE.Group();
  (Object.keys(visual) as PartName[]).forEach((name) => {
    const template = parts[name];
    if (!template) return;
    const t = visual[name];
    if (!t.visible) return;
    const inst = template.clone(true);
    inst.visible = true;
    // 花/果的构件原点是挂点（茎顶）：挂点必须跟着整体缩放走，否则花会浮在茎顶上方
    inst.position.multiplyScalar(scale);
    inst.scale.multiply(new THREE.Vector3(t.scale * scale, t.scale * t.yScale * scale, t.scale * scale));
    inst.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      mesh.material = new THREE.MeshToonMaterial({
        color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
        // 构件 GLB 全部导出为双面材质（叶片/花瓣），丢掉 side 会露背面空洞
        side: src.side,
        transparent: t.opacity < 1,
        opacity: t.opacity,
      });
    });
    group.add(inst);
  });
  return group;
}

/** 释放材质（多材质网格逐个释放） */
function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) material.forEach((m) => m.dispose());
  else material.dispose();
}

/**
 * 释放 plantRoot 下克隆实例自有的 GPU 资源并清空。
 * 几何体与模板共享（见 templateGeometries）不释放；材质是每株新建的，逐个释放。
 * 可重复调用：清空后再遍历为空，且同一次遍历里同一资源只释放一次（seen 去重）。
 */
function disposePlants(root: THREE.Object3D) {
  const seen = new Set<THREE.BufferGeometry | THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    if (geometry && !templateGeometries.has(geometry) && !seen.has(geometry)) {
      seen.add(geometry);
      geometry.dispose();
    }
    const material = mesh.material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const m of materials) {
      if (templateMaterials.has(m) || seen.has(m)) continue;
      seen.add(m);
      m.dispose();
    }
  });
  root.clear();
}

export default function GardenScene3D({
  plots,
  arranging = false,
  onSelect,
  onMoveSlot,
}: GardenScene3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // 场景对象保存在 ref 里，供后续任务复用
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    ground: THREE.Mesh;
    plantRoot: THREE.Group;
    loader: GLTFLoader;
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);

    const camera = new THREE.PerspectiveCamera(
      45,
      host.clientWidth / host.clientHeight,
      0.1,
      200
    );
    camera.position.set(0, 9, 10);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.4, 0);
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.25;
    controls.minDistance = 5;
    controls.maxDistance = 22;
    controls.enablePan = false;
    controls.enableDamping = true;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9ec9a0, 1.15));
    const sun = new THREE.DirectionalLight(0xfff3d0, 1.1);
    sun.position.set(6, 12, 6);
    scene.add(sun);

    // 地块：略大于网格的圆角地面
    const groundSize = Math.max(PLOT_COLS, PLOT_ROWS) * TILE + 2.4;
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(groundSize * 0.72, 48),
      new THREE.MeshToonMaterial({ color: GROUND })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    // 格子线：帮助孩子看清"能种哪里"
    const grid = new THREE.GridHelper(
      Math.max(PLOT_COLS, PLOT_ROWS) * TILE,
      Math.max(PLOT_COLS, PLOT_ROWS),
      GRID_CENTER,
      GRID_LINE
    );
    grid.position.y = 0;
    scene.add(grid);

    const plantRoot = new THREE.Group();
    scene.add(plantRoot);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    sceneRef.current = { renderer, scene, camera, controls, ground, plantRoot, loader };

    let raf = 0;
    let running = true;
    const clock = new THREE.Clock();
    const tick = () => {
      if (!running) return;
      const t = clock.getElapsedTime();
      // 植物待机轻摆：统一在 rAF 里更新
      plantRoot.children.forEach((child, i) => {
        child.rotation.z = Math.sin(t * 1.1 + i * 0.7) * 0.02;
      });
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      if (!host) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        clock.getDelta();
        raf = requestAnimationFrame(tick);
      }
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      controls.dispose();
      // 本组件创建的 GPU 资源：地面与网格的几何体/材质，加上植物克隆实例的材质
      ground.geometry.dispose();
      disposeMaterial(ground.material);
      grid.dispose(); // GridHelper.dispose() 会释放自己的 geometry 与 material
      disposePlants(plantRoot);
      // dispose() 只清 three 内部缓存，不释放 WebGL 上下文；Tabs 只渲染激活面板，
      // 每次切 Tab 都会重建场景，不显式丢弃上下文会撞上浏览器上限（约 16 个）
      renderer.dispose();
      renderer.forceContextLoss();
      host.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // plots 变化时重建植物
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    let cancelled = false;

    const rebuild = async () => {
      // 先释放上一批植物的材质再清空；几何体与缓存模板共享，不释放
      disposePlants(ctx.plantRoot);
      const uniqueSpecies = Array.from(new Set(plots.map((p) => p.species)));
      const loaded = await Promise.all(
        uniqueSpecies.map(async (key) => {
          const meta = speciesMeta(key);
          try {
            const parts = await loadSpeciesParts(ctx.loader, meta.file);
            return [key, parts] as const;
          } catch (err) {
            console.warn(`[garden] 物种 ${key} 的模型加载失败`, err);
            return [key, null] as const;
          }
        })
      );
      if (cancelled) return;
      const bySpecies = new Map(loaded);

      for (const p of plots) {
        const entry = bySpecies.get(p.species);
        if (!entry) continue;
        const { x, z } = slotToPosition(p.slot);
        // 成株高度归一化到格子的 0.6 倍：按 GLB 实测包围盒高度缩放，
        // 不用 species.height（声明值比模型实际高 11~15%）
        const scale = (TILE * 0.6) / entry.bboxHeight;
        const plant = buildPlant(entry.parts, p.stage, scale);
        plant.position.set(x, 0, z);
        plant.userData = { plotId: p.id, slot: p.slot, stage: p.stage, species: p.species };
        ctx.plantRoot.add(plant);
      }
    };

    void rebuild();
    return () => {
      cancelled = true;
      disposePlants(ctx.plantRoot);
    };
  }, [plots]);

  return <div ref={hostRef} className="absolute inset-0" aria-label="3D 花园" role="img" />;
}
