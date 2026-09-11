import { syncExercises } from "./sync";

const CHECK_INTERVAL_MS = 15 * 24 * 60 * 60_000; // 每 15 天检查一次上游
const FIRST_DELAY_MS = 60_000; // 启动 60s 后首跑（比食谱晚一点，避开启动高峰与并发 zip）
const RETRY_DELAY_MS = 60 * 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let busy = false;

/** 健身馆后台调度：与食谱同款节奏，SQLite 单进程无并发顾虑 */
export function startExerciseScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch(() => {});
  }, CHECK_INTERVAL_MS);
  setTimeout(() => {
    tick().catch(() => {});
  }, FIRST_DELAY_MS);
}

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const summary = await syncExercises();
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    const parts = summary.sources
      .map((s) =>
        s.skipped
          ? `${s.label} 无变化`
          : s.error
            ? `${s.label} 失败`
            : `${s.label} ${s.total} 个（+${s.added}/~${s.updated}/-${s.removed}，图 ${s.images} 动图 ${s.gifs}）`
      )
      .join("；");
    const changed = summary.sources.some((s) => !s.skipped && !s.error);
    if (changed) console.log(`[exercises] 同步完成，共 ${summary.total} 个：${parts}`);
  } catch (e: any) {
    console.error(`[exercises] 同步失败（${e?.message ?? e}），1 小时后重试`);
    if (!retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        tick().catch(() => {});
      }, RETRY_DELAY_MS);
    }
  } finally {
    busy = false;
  }
}
