/**
 * 限流模块冒烟测试（临时脚本，可随时删除）。
 * 运行：npx tsx scripts/rate-limit-smoke.ts
 */
import { guard, resetRateLimit } from "@/lib/rateLimit";

let passed = 0;
let failed = 0;

function eq(name: string, got: unknown, want: unknown) {
  if (got === want) {
    passed++;
    console.log(`  ✓ ${name} = ${got}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}\n    期望: ${want}\n    实际: ${got}`);
  }
}

async function main() {
  const key = "smoke:test";

  // 前 3 次放行
  eq("第 1 次", guard(key, 3) === null, true);
  eq("第 2 次", guard(key, 3) === null, true);
  eq("第 3 次", guard(key, 3) === null, true);

  // 第 4 次拒绝，且是 429
  const denied = guard(key, 3);
  eq("第 4 次被拒", denied !== null, true);
  eq("状态码", denied?.status, 429);
  eq("带 Retry-After", denied?.headers.get("retry-after") !== null, true);

  // reset 后恢复
  resetRateLimit(key);
  eq("reset 后放行", guard(key, 3) === null, true);

  // 窗口过期后恢复（窗口 50ms，等 80ms）
  resetRateLimit(key);
  eq("新窗口第 1 次", guard(key, 1, 50) === null, true);
  eq("新窗口第 2 次被拒", guard(key, 1, 50) !== null, true);
  await new Promise((r) => setTimeout(r, 80));
  eq("窗口过期后放行", guard(key, 1, 50) === null, true);

  console.log(`\n通过 ${passed}，失败 ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
