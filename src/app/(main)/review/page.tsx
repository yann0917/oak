"use client";

// FSRS 闪卡复习：正面提问 → 显示答案 → 四档评分（带间隔预览）→ 下一张
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Title } from "animal-island-ui";
import { api } from "@/lib/api";
import { Notification } from "@/lib/toast";
import { MathMd } from "@/components/MathMd";

interface Preview {
  rating: number;
  due: string;
  days: number;
}

interface ReviewItem {
  noteId: number;
  title: string;
  source: string;
  question: string;
  answer: string;
  previews: Preview[];
}

const RATING_META: { value: 1 | 2 | 3 | 4; label: string; emoji: string; color: string }[] = [
  { value: 1, label: "再学一次", emoji: "😵", color: "var(--animal-error-color)" },
  { value: 2, label: "困难", emoji: "😅", color: "var(--animal-warning-color)" },
  { value: 3, label: "良好", emoji: "🙂", color: "var(--animal-primary-color)" },
  { value: 4, label: "简单", emoji: "😎", color: "var(--animal-success-color)" },
];

function intervalLabel(p: Preview): string {
  const ms = new Date(p.due).getTime() - Date.now();
  if (ms <= 0) return "马上";
  if (ms < 3600000) return `${Math.max(1, Math.floor(ms / 60000))} 分钟后`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)} 小时后`;
  const d = Math.round(ms / 86400000);
  return `${d} 天后`;
}

export default function ReviewPage() {
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | null>(null);
  const [stats, setStats] = useState<Record<number, number>>({});

  useEffect(() => {
    api<{ items: ReviewItem[] }>("/api/review")
      .then((d) => setItems(d.items))
      .catch((e) => Notification.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (value: 1 | 2 | 3 | 4) => {
    const item = items[idx];
    if (!item || rating) return;
    setRating(value);
    try {
      await api("/api/review", { method: "POST", body: JSON.stringify({ noteId: item.noteId, rating: value }) });
      setStats((prev) => ({ ...prev, [value]: (prev[value] ?? 0) + 1 }));
      setTimeout(() => {
        setRating(null);
        setShowAnswer(false);
        setIdx((i) => i + 1);
      }, 350);
    } catch (e: any) {
      Notification.error(e.message);
      setRating(null);
    }
  };

  if (loading) {
    return <div className="text-center py-16 text-sm text-secondary">加载中…</div>;
  }

  if (items.length === 0 || idx >= items.length) {
    const total = items.length;
    return (
      <div className="space-y-4">
        <Title size="middle" color="app-orange">
          今日复习
        </Title>
        <Card className="p-8 text-center">
          <div className="text-4xl mb-3">{total > 0 ? "🌟" : "🍃"}</div>
          <p className="font-bold text-lg" style={{ color: "var(--animal-text-color)" }}>
            {total > 0 ? `全部复习完成，共 ${total} 张！` : "今天没有到期的卡片，去记点新错题吧"}
          </p>
          {total > 0 && (
            <div className="flex justify-center gap-2 mt-4 flex-wrap">
              {RATING_META.map((m) =>
                (stats[m.value] ?? 0) > 0 ? (
                  <span key={m.value} className="px-3 py-1 rounded-full text-sm font-bold bg-warm">
                    {m.label} × {stats[m.value]}
                  </span>
                ) : null
              )}
            </div>
          )}
          <div className="flex gap-3 mt-6 justify-center">
            <Button type="primary" onClick={() => router.push("/notes")}>
              返回错题本
            </Button>
            <Button onClick={() => total === 0 && router.push("/stats")}>查看统计</Button>
          </div>
        </Card>
      </div>
    );
  }

  const item = items[idx];
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <Title size="middle" color="app-orange">
          复习闪卡
        </Title>
        <span className="text-sm text-secondary">
          {idx + 1} / {items.length}
        </span>
      </div>

      <Card className="p-6 min-h-72 flex flex-col">
        <div className="text-xs text-secondary mb-3">{item.source || "错题卡"}</div>
        <div className="flex-1 flex items-center justify-center py-6">
          <MathMd text={item.question || item.title} className="text-lg text-center" />
        </div>

        {showAnswer ? (
          <div className="border-t pt-4 mt-2" style={{ borderColor: "var(--animal-border-color-light)" }}>
            <div className="text-xs font-bold mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
              答案
            </div>
            <MathMd text={item.answer} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
              {RATING_META.map((m) => {
                const p = item.previews.find((x) => x.rating === m.value);
                return (
                  <Button
                    key={m.value}
                    onClick={() => submit(m.value)}
                    loading={rating === m.value}
                    disabled={!!rating}
                    size="middle"
                    className="w-full"
                  >
                    <span>
                      {m.emoji} {m.label}
                      {p && <span className="block text-xs opacity-80">{intervalLabel(p)}</span>}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        ) : (
          <Button type="primary" size="large" className="w-full" onClick={() => setShowAnswer(true)}>
            显示答案
          </Button>
        )}
      </Card>
    </div>
  );
}
