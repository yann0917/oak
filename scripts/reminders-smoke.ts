/**
 * 提醒中心调度核心逻辑冒烟测试（临时脚本，可随时删除）。
 * 运行：npx tsx scripts/reminders-smoke.ts
 */
import { computeNextRunAt, renderContent, type Reminder } from "@/lib/reminders/engine";
import { describeSchedule } from "@/lib/reminders/meta";

let passed = 0;
let failed = 0;

function eq(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (ok) {
    passed++;
    console.log(`  ✓ ${name} = ${got}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}\n    期望: ${want}\n    实际: ${got}`);
  }
}

function base(over: Partial<Reminder>): Reminder {
  return {
    id: 1,
    userId: 1,
    childId: null,
    title: "测试",
    content: "",
    attachments: "[]",
    scheduleType: "once",
    cronExpr: "",
    timeOfDay: "09:00",
    weekdays: "",
    monthDays: "",
    targetDate: "2026-09-13",
    advanceDays: "",
    nextRunAt: "",
    timezone: "Asia/Shanghai",
    enabled: 1,
    retryCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

// 北京时间 = UTC+8
// 2026-08-30 是周日，09-13 是周日
console.log("== once 一次性 ==");
{
  const r = base({ targetDate: "2026-09-13" });
  // 事件日 09:00 +08 → UTC 2026-09-13T01:00:00.000Z
  eq("once 下一次触发", computeNextRunAt(r, new Date("2026-08-30T00:00:00+08:00")), "2026-09-13T01:00:00.000Z");
  // 事件日已过 → null
  eq("once 已过期为 null", computeNextRunAt(r, new Date("2026-09-14T00:00:00+08:00")), null);
}

console.log("== once + advanceDays 提前预告 ==");
{
  const r = base({ targetDate: "2026-09-13", advanceDays: "7,3,1" });
  // 预告点：9/6、9/10、9/12、9/13
  eq("advance 第一个点(提前7天)", computeNextRunAt(r, new Date("2026-09-01T00:00:00+08:00")), "2026-09-06T01:00:00.000Z");
  // 从 9/6 触发后（9/6 10:00）→ 下一个点 9/10
  eq("advance 第二个点(提前3天)", computeNextRunAt(r, new Date("2026-09-06T10:00:00+08:00")), "2026-09-10T01:00:00.000Z");
  // 从 9/10 之后 → 9/12
  eq("advance 第三个点(提前1天)", computeNextRunAt(r, new Date("2026-09-10T10:00:00+08:00")), "2026-09-12T01:00:00.000Z");
  // 从 9/12 之后 → 事件日 9/13
  eq("advance 事件日本身", computeNextRunAt(r, new Date("2026-09-12T10:00:00+08:00")), "2026-09-13T01:00:00.000Z");
  // 全部发完 → null
  eq("advance 全部发完为 null", computeNextRunAt(r, new Date("2026-09-13T10:00:00+08:00")), null);
}

console.log("== daily/weekly/monthly/cron ==");
{
  const from = new Date("2026-08-30T08:00:00+08:00");
  eq(
    "daily 当天 09:00 触发前 → 当天 09:00",
    computeNextRunAt(base({ scheduleType: "daily", targetDate: "" }), from),
    "2026-08-30T01:00:00.000Z"
  );
  eq(
    "daily 当天 09:00 已过 → 次日",
    computeNextRunAt(base({ scheduleType: "daily", targetDate: "" }), new Date("2026-08-30T10:00:00+08:00")),
    "2026-08-31T01:00:00.000Z"
  );
  eq(
    "weekly 1,3,5 10:00 → 下个周一? 2026-09-02 是周三",
    computeNextRunAt(base({ scheduleType: "weekly", weekdays: "1,3,5", timeOfDay: "10:00", targetDate: "" }), from),
    "2026-08-31T02:00:00.000Z"
  );
  eq(
    "monthly 1,15 → 2026-09-01?",
    computeNextRunAt(base({ scheduleType: "monthly", monthDays: "1,15", targetDate: "" }), from),
    "2026-09-01T01:00:00.000Z"
  );
  eq(
    "cron 工作日 9 点",
    computeNextRunAt(base({ scheduleType: "cron", cronExpr: "0 9 * * 1-5", targetDate: "" }), new Date("2026-08-28T09:00:00+08:00")),
    "2026-08-31T01:00:00.000Z"
  );
}

console.log("== 模板渲染 ==");
{
  const r = base({ targetDate: "2026-09-13", content: "{{child}} 剩余 {{days_left}} 天，{{target_date}} 截止" });
  const out = renderContent({ ...r, childId: 5 as any }, "小糖", new Date("2026-09-06T00:00:00+08:00"));
  eq("渲染 child/days_left/target_date", out.body, "小糖 剩余 7 天，2026-09-13 截止");
  eq("标题也渲染 {{child}}", renderContent({ ...r, title: "{{child}} 提醒" }, "小糖").title, "小糖 提醒");
  const outToday = renderContent(r, "", new Date("2026-09-13T00:00:00+08:00"));
  eq("days_left=0 显示今天", outToday.body, "孩子 剩余 今天 天，2026-09-13 截止");
}

console.log("== 频率描述 ==");
{
  eq("once 描述", describeSchedule({ scheduleType: "once", timeOfDay: "09:00", weekdays: "", monthDays: "", cronExpr: "", targetDate: "2026-09-13", advanceDays: "7,3,1" }), "一次性 · 2026-09-13 · 提前 7/3/1 天预告");
  eq("weekly 描述", describeSchedule({ scheduleType: "weekly", timeOfDay: "09:00", weekdays: "1,3,5", monthDays: "", cronExpr: "", targetDate: "", advanceDays: "" }), "每周 一、三、五 09:00");
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
