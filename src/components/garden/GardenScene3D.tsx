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
      0x8fbd72,
      0x9ecb84
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
      renderer.dispose();
      host.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // plots 变化时重建植物（Task 11 填充具体构建逻辑）
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.plantRoot.clear();
    for (const p of plots) {
      const { x, z } = slotToPosition(p.slot);
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.32, 6),
        new THREE.MeshToonMaterial({ color: 0x8ac68a })
      );
      marker.position.set(x, 0.16, z);
      marker.userData = { plotId: p.id, slot: p.slot, stage: p.stage, species: p.species };
      ctx.plantRoot.add(marker);
    }
  }, [plots]);

  return <div ref={hostRef} className="absolute inset-0" aria-label="3D 花园" role="img" />;
}
