// 花园接口的成员归属校验。
// 本模块 import @/db（better-sqlite3），只能在服务端（Route Handler 等）使用，客户端组件不可导入。
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { children } from "@/db/schema";

/**
 * 校验 childId 归属当前用户，供花园接口在任何读写前调用。
 *
 * 必要性：花园数据按 (user_id, child_id) 读写，但唯一索引只有 (child_id, item_key)——
 * 不校验归属时，拿别人的 childId 请求要么因撞唯一索引 500，要么抢先建出
 * (user_id=我, child_id=对方) 的行，让对方自己的首次请求永久 500。
 * 非正整数（含 0、负数、NaN）一律拒绝，避免写出脏行。
 *
 * @returns 通过返回 null；不通过返回可直接回给前端的中文错误信息（HTTP 400）。
 */
export function assertChildOwnership(userId: number, childId: number): string | null {
  if (!Number.isInteger(childId) || childId <= 0) return "childId 参数不合法";
  const row = db
    .select({ id: children.id })
    .from(children)
    .where(and(eq(children.id, childId), eq(children.userId, userId)))
    .get();
  return row ? null : "成员不存在或不属于当前账号";
}
