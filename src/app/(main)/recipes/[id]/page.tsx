"use client";

// 菜谱详情阅读态：上游 markdown（图片已由同步器改写为本地 /uploads 路径）用 MathMd 渲染
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Tag } from "animal-island-ui";
import { api } from "@/lib/api";
import { MathMd } from "@/components/MathMd";

interface RecipeDetail {
  id: number;
  category: string;
  name: string;
  content: string;
}

export default function RecipeDetailPage() {
  const params = useParams<{ id: string }>();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params?.id) return;
    api<RecipeDetail>(`/api/recipes/${params.id}`)
      .then(setRecipe)
      .catch((e) => setError(e.message));
  }, [params?.id]);

  if (error) {
    return (
      <div className="text-center py-16 text-sm text-red-500">
        {error}，
        <Link href="/recipes" className="underline">
          返回食谱
        </Link>
      </div>
    );
  }
  if (!recipe) {
    return <div className="text-center py-16 text-sm text-secondary">加载中…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-black m-0" style={{ color: "var(--animal-text-color)" }}>
          {recipe.name}
        </h1>
        <Tag size="small" variant="soft" color="app-yellow">
          {recipe.category}
        </Tag>
        <div className="ml-auto">
          <Link href="/recipes">
            <Button type="text" size="small">
              返回食谱
            </Button>
          </Link>
        </div>
      </div>

      <Card className="p-4">
        <MathMd text={recipe.content} className="text-sm leading-7" />
      </Card>
    </div>
  );
}
