import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { todayString } from "@/lib/ai/classify";
import { type InsightPeriod } from "./aggregate";
import { generateInsight, hasDoneInsight } from "./generate";

const CHECK_INTERVAL_MS = 15 * 60_000; // 每 15 分钟检查一次
const FIRST_DELAY_MS = 60_000; // 启动后 1 分钟跑首次

let timer: ReturnType<typeof setInterval> | null = null;
const running = new Set<string>();

/**
 * 家庭脉搏后台调度：为已启用 AI 的用户自动补跑周/月复盘（当前周期没有 done 时）。
 * 复用提醒中心同款 instrumentation 入口，每 15 分钟轻量检查，SQLite 单进程无并发顾虑。
 */
export function startInsightScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    checkAndGenerate().catch(() => {});
  }, CHECK_INTERVAL_MS);
  setTimeout(() => {
    checkAndGenerate().catch(() => {});
  }, FIRST_DELAY_MS);
}

async function checkAndGenerate(): Promise<void> {
  const aiUsers = db.select({ userId: aiSettings.userId }).from(aiSettings).where(eq(aiSettings.enabled, 1)).all();
  const today = todayString();
  for (const { userId } of aiUsers) {
    for (const period of ["monthly", "weekly"] as const satisfies InsightPeriod[]) {
      const key = `${userId}:${period}`;
      if (running.has(key)) continue;
      if (hasDoneInsight(userId, period, today)) continue;
      running.add(key);
      generateInsight(userId, period)
        .catch((e) => console.error(`[insights] 自动复盘失败 user=${userId} ${period}:`, e?.message ?? e))
        .finally(() => running.delete(key));
    }
  }
}
