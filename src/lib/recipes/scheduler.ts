import { syncRecipes } from "./sync";

const CHECK_INTERVAL_MS = 6 * 60 * 60_000; // 每 6 小时检查一次上游（commit 没变则跳过下载）
const FIRST_DELAY_MS = 45_000; // 启动后 45 秒首跑，避开启动高峰

let timer: ReturnType<typeof setInterval> | null = null;
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
    if (!summary.skipped) console.log(`[recipes] 同步完成：共 ${summary.total} 篇（新增 ${summary.added}、更新 ${summary.updated}、删除 ${summary.removed}、图片 ${summary.images} 张）`);
  } catch (e: any) {
    console.error("[recipes] 定期同步失败:", e?.message ?? e);
  } finally {
    busy = false;
  }
}
