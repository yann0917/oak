"use client";

// 动作详情：动画 GIF + 中文分步 + 器械/部位/目标肌标签
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Tag } from "animal-island-ui";
import { api } from "@/lib/api";
import { bodyPartLabel, equipmentLabel, muscleLabel, targetLabel } from "@/lib/exercises/sources";

interface ExerciseDetail {
  id: number;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  steps: string[];
  image: string;
  gif: string;
  attribution: string;
}

export default function ExerciseDetailPage() {
  const params = useParams<{ id: string }>();
  const [item, setItem] = useState<ExerciseDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params?.id) return;
    api<ExerciseDetail>(`/api/exercises/${params.id}`)
      .then(setItem)
      .catch((e) => setError(e.message));
  }, [params?.id]);

  if (error) {
    return (
      <div className="text-center py-16 text-sm text-red-500">
        {error}，
        <Link href="/gym" className="underline">
          返回健身馆
        </Link>
      </div>
    );
  }
  if (!item) {
    return <div className="text-center py-16 text-sm text-secondary">加载中…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-black m-0" style={{ color: "var(--animal-text-color)" }}>
          {item.name}
        </h1>
        <Tag size="small" variant="soft" color="app-yellow">
          {bodyPartLabel(item.bodyPart)}
        </Tag>
        <Tag size="small" variant="soft" color="app-blue">
          {equipmentLabel(item.equipment)}
        </Tag>
        {item.target && (
          <Tag size="small" variant="soft" color="app-orange">
            目标 {targetLabel(item.target)}
          </Tag>
        )}
        <div className="ml-auto">
          <Link href="/gym">
            <Button type="text" size="small">
              返回健身馆
            </Button>
          </Link>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-xl overflow-hidden bg-warm-soft flex items-center justify-center">
            {item.gif ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.gif} alt={item.name} className="w-full h-full object-contain" />
            ) : item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
            ) : (
              <span className="text-5xl">🏋️</span>
            )}
          </div>
          <div className="text-xs text-secondary text-center max-w-lg leading-5">
            {item.muscleGroup && <div>主要肌群：{muscleLabel(item.muscleGroup)}</div>}
            {item.secondaryMuscles?.length > 0 && <div>协同肌：{item.secondaryMuscles.map(muscleLabel).join("、")}</div>}
          </div>
        </div>
      </Card>

      {item.steps.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-bold mb-3" style={{ color: "var(--animal-text-color)" }}>
            动作步骤
          </h2>
          <ol className="space-y-2 text-sm leading-6 list-none p-0 m-0">
            {item.steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-warm text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">
                  {i + 1}
                </span>
                <span className="flex-1">{s}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {item.attribution && <p className="text-xs text-secondary text-center">{item.attribution}</p>}
    </div>
  );
}
