import { sql } from "drizzle-orm";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { reminders } from "@/db/schema";
import { computeNextRunAt, dispatch } from "./engine";

const TICK_MS = 60_000;
let started = false;

/**
 * 常驻调度器：由 instrumentation.ts 在 Node 服务启动时调用。
 * 每 60s 一次索引查询（idx_reminders_due），原子认领后 dispatch。
 * 状态全在 SQLite，进程重启/重复部署零丢失、零双发。
 */
export function startScheduler() {
  if (started) return;
  started = true;
  const run = () => {
    tick().catch((e) => console.error("[reminders] tick 失败", e));
  };
  run();
  const timer = setInterval(run, TICK_MS);
  // 不阻塞进程退出（测试/脚本场景）
  timer.unref?.();
}

async function tick() {
  const now = new Date().toISOString();
  const due = db
    .select()
    .from(reminders)
    .where(and(eq(reminders.enabled, 1), lte(reminders.nextRunAt, now)))
    .all();

  for (const r of due) {
    try {
      // 预计算下一触发点；null = once 已全部发完，只停用
      const next = computeNextRunAt(r, new Date());
      let claimed: { changes: number | bigint };
      if (next) {
        claimed = db.run(
          sql`UPDATE reminders SET next_run_at = ${next} WHERE id = ${r.id} AND next_run_at = ${r.nextRunAt} AND enabled = 1`
        );
      } else {
        claimed = db.run(
          sql`UPDATE reminders SET enabled = 0 WHERE id = ${r.id} AND next_run_at = ${r.nextRunAt} AND enabled = 1`
        );
      }
      // 影响行数 != 1：说明被其他实例（或本 tick 重复）抢先，放弃本次
      if (Number(claimed.changes) !== 1) continue;
      await dispatch(r);
    } catch (e) {
      console.error(`[reminders] 处理提醒 #${r.id} 失败`, e);
    }
  }
}
