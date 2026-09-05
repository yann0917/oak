import { syncRecipes } from "./sync";

const CHECK_INTERVAL_MS = 15 * 24 * 60 * 60_000; // 每 15 天检查一次上游（重启后 45s 的首跑只做 sha 探测，没变化不下载）
const FIRST_DELAY_MS = 45_000; // 启动后 45 秒首跑，避开启动高峰
const RETRY_DELAY_MS = 60 * 60_000; // 同步失败后 1 小时重试，避免一次网络抖动要干等 15 天

let timer: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let busy = false;

/**
 * 食谱库后台调度：定期从上游 GitHub 仓库同步菜谱。
 * 复用提醒中心同款 instrumentation 入口，SQLite 单进程无并发顾虑。
 */
export function startRecipeScheduler(): void {
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
    const summary = await syncRecipes();
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (!summary.skipped) console.log(`[recipes] 同步完成：共 ${summary.total} 篇（新增 ${summary.added}、更新 ${summary.updated}、删除 ${summary.removed}、图片 ${summary.images} 张）`);
  } catch (e: any) {
    console.error(`[recipes] 同步失败（${e?.message ?? e}），1 小时后重试`);
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
