/**
 * 构建前预热数据库（单进程）：next build 的 collect page data 阶段会并行起多个
 * worker，每个 worker 都会 import db/index.ts 并执行建库/建表/迁移。若数据库尚
 * 不存在（如 CI 全新环境），多进程同时建库并抢独占锁设置 WAL 会触发
 * SQLITE_BUSY（busy_timeout 5s 内等不到锁）。先在此单进程完成初始化，
 * 后续 worker 面对已初始化的库只会做幂等迁移与种子写入。
 * 注意：必须在 gen-api-perms 之后执行（seed.ts import @/generated/apiPerms.generated）。
 */
import("../src/db/index.ts")
  .then(() => console.log("[warm-db] 数据库已就绪"))
  .catch((e) => {
    console.error("[warm-db] 初始化失败：", e);
    process.exit(1);
  });
