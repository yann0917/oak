// Next.js 进程钩子：服务启动时执行一次（next start / PM2 / Docker 均生效）。
// 构建期与 Edge 运行时通过 NEXT_RUNTIME 排除。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("@/lib/reminders/scheduler");
  startScheduler();
  // 家庭脉搏：周/月复盘自动生成
  const { startInsightScheduler } = await import("@/lib/insights/scheduler");
  startInsightScheduler();
}
