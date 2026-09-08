# Oak 移动端 API（M1）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Oak 的现有 REST 接口能被 Flutter 原生客户端调用——补上 Bearer 鉴权、客户端登录接口、首屏聚合接口、最小权限账号与限流。

**Architecture:** 不新建 API 层，只在现有 100+ 个 Route Handler 的公共入口上做两处增强（token 读取支持 Bearer、`requireUser` 挂全局限流），另加两个新路由（`/api/auth/app-login`、`/api/app/home`）。限流用进程内固定窗口，因为 oak 必须单实例运行（`ecosystem.config.js` 明确 fork 单实例：SQLite + 常驻调度），内存计数就是准确的。

**Tech Stack:** Next.js 16 App Router（Node runtime）、Drizzle ORM + better-sqlite3、jose/jsonwebtoken、bcryptjs、Casbin。

**规格：** `docs/superpowers/specs/2026-09-08-flutter-mobile-app-design.md`

## Global Constraints

- **分支**：全部改动在 `feat/app-api` 分支上进行，不直接提交 `main`。
- **不引入新依赖**：限流用进程内 Map 实现，禁止引入 express-rate-limit / Redis 等。
- **不改动 Web 端行为**：`/api/auth/login` 仍只设 cookie，绝不把 token 放进它的响应体（会作废 httpOnly 的 XSS 保护）。
- **接口形状绑数据库列**：POST body 原样透传给 drizzle，字段名必须与 `src/db/schema.ts` 列名一致。
- **权限点自动生成**：`api:*` 权限点由 `scripts/gen-api-perms.mjs` 扫描生成，新增路由后必须重新生成并提交 `src/generated/apiPerms.generated.ts`。
- **验证前置**：本机无法盯 CI（gh 连不上 api.github.com），每个任务结束前必须跑通对应验证命令，最后一个任务必须本地跑通 `npm run build`。
- **本地环境**：无 `.env` 时 `AUTH_SECRET` 用默认值，Web 端可用 `admin` / `admin123` 登录；dev server 在 `http://127.0.0.1:3000`（`next.config.mjs` 已配 `allowedDevOrigins`）。
- **无测试框架**：仓库没有 jest/vitest，验证走两条路——纯逻辑用 `npx tsx scripts/*-smoke.ts` 冒烟脚本（参照 `scripts/reminders-smoke.ts` 的 `eq()` 写法），HTTP 行为用 `curl` 打 dev server。
- **取 token 的通用片段**（Task 3 完成后，后续任务里的 `$APP_TOKEN` 都由此得到；每次开新终端需重新执行）：

```bash
APP_TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/auth/app-login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "token 长度: ${#APP_TOKEN}"
```

---

## 文件结构

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `src/lib/auth.ts` | 修改 | token 读取支持 Bearer；抽出 `verifyCredentials`；`requireUser` 挂全局限流 |
| `src/lib/rateLimit.ts` | 新建 | 固定窗口限流 + 客户端 IP 提取 + 429 响应 |
| `src/app/api/auth/app-login/route.ts` | 新建 | 原生客户端登录，token 返回响应体 |
| `src/app/api/auth/login/route.ts` | 修改 | 复用 `verifyCredentials`，加登录限流 |
| `src/app/api/app/home/route.ts` | 新建 | 移动端首屏聚合 |
| `src/app/api/upload/route.ts` | 修改 | 体积/数量边界 |
| `src/app/api/ai-chat/route.ts` 等 6 处 | 修改 | AI 额度限流 |
| `scripts/gen-api-perms.mjs` | 修改 | 资源展示名补 `app: 移动端` |
| `scripts/rate-limit-smoke.ts` | 新建 | 限流模块冒烟测试 |
| `THREAT_MODEL.md` | 修改 | 增补移动端暴露面与限流策略 |

---

### Task 1: Bearer 鉴权

**Files:**
- Modify: `src/lib/auth.ts:26-28`
- Test: curl（无单测框架）

**Interfaces:**
- Consumes: 无
- Produces: `getTokenFromRequest(req)` 支持 `Authorization: Bearer <token>`，无该头时回退 cookie。所有现有路由经 `getAuthUser` → `requireUser` 自动获得能力。

- [ ] **Step 1: 建分支并启动 dev server**

```bash
cd /Users/yabo/wwwroot/oak
git checkout -b feat/app-api
npm run dev   # 另开一个终端保持运行
```

- [ ] **Step 2: 确认现状失败（Bearer 无效）**

```bash
TOKEN=$(curl -si -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  | grep -o 'token=[^;]*' | head -1 | cut -d= -f2)
echo "token 长度: ${#TOKEN}"
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/children \
  -H "Authorization: Bearer $TOKEN"
```

预期：token 长度 > 50，HTTP 状态码 **401**（当前只认 cookie）。

- [ ] **Step 3: 改 `getTokenFromRequest`**

```ts
/** 优先读 Authorization: Bearer（原生客户端），回退 cookie（Web 端） */
export function getTokenFromRequest(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  if (header) {
    const bearer = header.replace(/^Bearer\s+/i, "").trim();
    if (bearer) return bearer;
  }
  return req.cookies.get("token")?.value || "";
}
```

- [ ] **Step 4: 验证 Bearer 与 cookie 都能通过**

```bash
curl -s -o /dev/null -w 'Bearer: %{http_code}\n' http://127.0.0.1:3000/api/children \
  -H "Authorization: Bearer $TOKEN"
curl -s -o /dev/null -w 'Cookie: %{http_code}\n' http://127.0.0.1:3000/api/children \
  -b "token=$TOKEN"
```

预期：两行都是 **200**。

- [ ] **Step 5: 提交**

```bash
git add src/lib/auth.ts
git commit -m "feat(auth): token 读取支持 Authorization Bearer，兼容原生客户端"
```

---

### Task 2: 限流模块

**Files:**
- Create: `src/lib/rateLimit.ts`
- Test: `scripts/rate-limit-smoke.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `guard(key: string, limit: number, windowMs?: number): NextResponse | null` —— 放行返回 `null`，超限返回 429（带 `Retry-After`）
  - `resetRateLimit(key: string): void`
  - `clientIp(req: NextRequest): string`
  - `RATE_LIMITS = { login: number; ai: number; api: number }`（可用 `OAK_LOGIN_RATE_LIMIT` / `OAK_AI_RATE_LIMIT` / `OAK_RATE_LIMIT` 覆盖，默认 5 / 20 / 300 次每分钟）

- [ ] **Step 1: 写冒烟测试（先失败）**

创建 `scripts/rate-limit-smoke.ts`：

```ts
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
```

- [ ] **Step 2: 运行确认失败**

```bash
npx tsx scripts/rate-limit-smoke.ts
```

预期：报错 `Cannot find module '@/lib/rateLimit'`。

- [ ] **Step 3: 实现 `src/lib/rateLimit.ts`**

```ts
/**
 * 进程内固定窗口限流。
 * oak 必须单实例运行（SQLite + 常驻调度，见 ecosystem.config.js），
 * 因此内存计数就是准确的，无需 Redis；pm2 reload 后计数清零，可接受。
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 5000;

function envLimit(name: string, def: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

export const RATE_LIMITS = {
  /** 登录：IP + 用户名，次/分钟 */
  login: envLimit("OAK_LOGIN_RATE_LIMIT", 5),
  /** 消耗 AI 额度的接口：按用户，次/分钟 */
  ai: envLimit("OAK_AI_RATE_LIMIT", 20),
  /** 全局兜底：按用户，次/分钟 */
  api: envLimit("OAK_RATE_LIMIT", 300),
};

/** 返回 null 表示放行；否则返回 429 响应 */
export function guard(key: string, limit: number, windowMs = 60_000): NextResponse | null {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (bucket.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return NextResponse.json(
      { error: `请求过于频繁，请 ${retryAfter} 秒后重试` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }
  bucket.count++;
  return null;
}

/** 成功后清零（如登录成功） */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/** 客户端 IP：反代后取 X-Forwarded-For 首段 */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx tsx scripts/rate-limit-smoke.ts
```

预期：`通过 12，失败 0`，退出码 0。

- [ ] **Step 5: 提交**

```bash
git add src/lib/rateLimit.ts scripts/rate-limit-smoke.ts
git commit -m "feat(rate-limit): 进程内固定窗口限流模块"
```

---

### Task 3: 登录接口（verifyCredentials + app-login + 登录限流）

**Files:**
- Modify: `src/lib/auth.ts`（新增 `verifyCredentials`）
- Create: `src/app/api/auth/app-login/route.ts`
- Modify: `src/app/api/auth/login/route.ts`

**Interfaces:**
- Consumes: Task 2 的 `guard`、`resetRateLimit`、`clientIp`、`RATE_LIMITS`
- Produces:
  - `verifyCredentials(username: unknown, password: unknown): AuthUser | null`
  - `POST /api/auth/app-login` → `{ token, user: { id, username, displayName, isAdmin } }`

- [ ] **Step 1: 确认新接口尚不存在**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/api/auth/app-login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}'
```

预期：**404**。

- [ ] **Step 2: 在 `src/lib/auth.ts` 顶部加 bcrypt 导入并新增 `verifyCredentials`**

```ts
import bcrypt from "bcryptjs";
```

```ts
/** 校验用户名密码（Web 登录与客户端登录共用）。失败返回 null。 */
export function verifyCredentials(username: unknown, password: unknown): AuthUser | null {
  if (typeof username !== "string" || typeof password !== "string") return null;
  if (!username || !password) return null;
  const user = db.select().from(users).where(eq(users.username, username)).get();
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) return null;
  return user;
}
```

- [ ] **Step 3: 创建 `src/app/api/auth/app-login/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { signToken, verifyCredentials } from "@/lib/auth";
import { clientIp, guard, RATE_LIMITS, resetRateLimit } from "@/lib/rateLimit";

/**
 * 原生客户端登录：token 放响应体，不设 cookie。
 * 与 /api/auth/login 分开，避免把 Web 端的 httpOnly 保护作废。
 * 位于 auth/ 下 → gen-api-perms.mjs 跳过该目录，不会产生「登录需要权限」的死循环。
 */
export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({}));
  const key = `login:${clientIp(req)}:${typeof username === "string" ? username : ""}`;
  const limited = guard(key, RATE_LIMITS.login);
  if (limited) return limited;

  if (!username || !password) {
    return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
  }
  const user = verifyCredentials(username, password);
  if (!user) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }
  if (!user.status) {
    return NextResponse.json({ error: "账号已停用，请联系管理员" }, { status: 403 });
  }
  resetRateLimit(key);
  return NextResponse.json({
    token: signToken({ uid: user.id, username: user.username }),
    user: { id: user.id, username: user.username, displayName: user.displayName, isAdmin: !!user.isAdmin },
  });
}
```

- [ ] **Step 4: 改 `src/app/api/auth/login/route.ts` 复用校验并加限流**

整文件替换为：

```ts
import { NextRequest, NextResponse } from "next/server";
import { setAuthCookie, signToken, verifyCredentials } from "@/lib/auth";
import { clientIp, guard, RATE_LIMITS, resetRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({}));
  const key = `login:${clientIp(req)}:${typeof username === "string" ? username : ""}`;
  const limited = guard(key, RATE_LIMITS.login);
  if (limited) return limited;

  if (!username || !password) {
    return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
  }
  const user = verifyCredentials(username, password);
  if (!user) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }
  if (!user.status) {
    return NextResponse.json({ error: "账号已停用，请联系管理员" }, { status: 403 });
  }
  resetRateLimit(key);
  const token = signToken({ uid: user.id, username: user.username });
  await setAuthCookie(token);
  return NextResponse.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isAdmin: !!user.isAdmin,
  });
}
```

注意：响应体里**不能**出现 token（Web 端靠 httpOnly cookie 防 XSS 窃取）。

- [ ] **Step 5: 验证登录链路**

顺序很重要：**先验证成功的路径，再跑失败循环**——失败循环会把 IP + 用户名 的配额打满，反过来挡住后面的正确登录。

```bash
# 5a. app-login 正常返回 token
curl -s -X POST http://127.0.0.1:3000/api/auth/app-login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
# 预期：{"token":"eyJ...","user":{...}}

# 5b. 拿到的 token 能直接调接口
APP_TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/auth/app-login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -o /dev/null -w 'app token: %{http_code}\n' http://127.0.0.1:3000/api/children \
  -H "Authorization: Bearer $APP_TOKEN"

# 5c. Web 登录行为不变：仍设 cookie、响应体不含 token
curl -si -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | grep -iE "set-cookie|\"token\""

# 5d. 错误密码连续 6 次 → 前 5 次 401，第 6 次 429
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "第 $i 次: %{http_code}\n" -X POST http://127.0.0.1:3000/api/auth/login \
    -H 'Content-Type: application/json' -d '{"username":"admin","password":"wrong"}'
done
```

预期：5b 为 **200**；5c 只出现 `set-cookie`、不出现 `"token"`；5d 前 5 次 401、第 6 次 **429**。

> 5d 跑完后 `admin` 的登录配额已满，等 60 秒或重启 dev server 再做后续任务。

- [ ] **Step 6: 提交**

```bash
git add src/lib/auth.ts src/app/api/auth/app-login/route.ts src/app/api/auth/login/route.ts
git commit -m "feat(auth): 新增客户端登录接口与登录限流"
```

---

### Task 4: 全局限流挂到 `requireUser`

**Files:**
- Modify: `src/lib/auth.ts`（`requireUser` 函数）

**Interfaces:**
- Consumes: Task 2 的 `guard`、`RATE_LIMITS`
- Produces: 所有调用 `requireUser` 的路由自动获得按用户的 300 次/分钟兜底限流（`OAK_RATE_LIMIT` 可覆盖）。

- [ ] **Step 1: 改 `requireUser`**

在文件顶部补导入：

```ts
import { guard, RATE_LIMITS } from "@/lib/rateLimit";
```

把 `requireUser` 改为：

```ts
export function requireUser(req: NextRequest): { user: AuthUser } | { response: NextResponse } {
  const tokenUser = getAuthUser(req);
  if (!tokenUser) return { response: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  const user = db.select().from(users).where(eq(users.id, tokenUser.uid)).get();
  if (!user || !user.status) return { response: NextResponse.json({ error: "账号不存在或已停用" }, { status: 401 }) };
  // 全局兜底限流：单实例内存计数（见 rateLimit.ts）
  const limited = guard(`user:${user.id}`, RATE_LIMITS.api);
  if (limited) return { response: limited };
  return { user };
}
```

- [ ] **Step 2: 用低阈值验证限流生效**

先 `Ctrl-C` 停掉当前 dev server，再用低阈值启动；重启后按 Global Constraints 重新取一次 `$APP_TOKEN`。

```bash
# 另开终端，用 3 次/分钟启动 dev server
OAK_RATE_LIMIT=3 npm run dev

# 重新取 token（登录接口不受该阈值影响）
APP_TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/auth/app-login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 连续 4 次请求
for i in $(seq 1 4); do
  curl -s -o /dev/null -w "第 $i 次: %{http_code}\n" http://127.0.0.1:3000/api/children \
    -H "Authorization: Bearer $APP_TOKEN"
done
```

预期：前 3 次 **200**，第 4 次 **429**。

- [ ] **Step 3: 恢复默认阈值并做回归**

```bash
# Ctrl-C 停掉低阈值实例，再用默认阈值启动
npm run dev

# 重新取 token
APP_TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/auth/app-login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 一次成功请求
curl -s -o /dev/null -w '默认阈值: %{http_code}\n' http://127.0.0.1:3000/api/children \
  -H "Authorization: Bearer $APP_TOKEN"
# Web 端 cookie 登录也正常
curl -s -o /dev/null -w 'Web cookie: %{http_code}\n' http://127.0.0.1:3000/api/auth/me -b "token=$TOKEN"
```

预期：两行都是 **200**。

- [ ] **Step 4: 提交**

```bash
git add src/lib/auth.ts
git commit -m "feat(rate-limit): requireUser 增加按用户的全局兜底限流"
```

---

### Task 5: AI 接口限流

**Files:**
- Modify: `src/app/api/ai-chat/route.ts`
- Modify: `src/app/api/ai/complete/route.ts`
- Modify: `src/app/api/garden-idiom-story/route.ts`
- Modify: `src/app/api/quick-notes/route.ts`（POST）
- Modify: `src/app/api/insights/generate/route.ts`
- Modify: `src/app/api/recipes/suggest/route.ts`

**Interfaces:**
- Consumes: Task 2 的 `guard`、`RATE_LIMITS`
- Produces: 上述路由按用户 20 次/分钟（`OAK_AI_RATE_LIMIT` 可覆盖），防止 token 泄漏后刷爆模型账单。

- [ ] **Step 1: 在三个 `requirePerm` 风格的路由里插入限流**

`src/app/api/ai-chat/route.ts:13`、`src/app/api/ai/complete/route.ts:14`、`src/app/api/garden-idiom-story/route.ts:24` 三处，都在已有的 `if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });` 之后插入（插完 `user` 必非空）：

```ts
  const limited = guard(`ai:${user.id}`, RATE_LIMITS.ai);
  if (limited) return limited;
```

并在文件顶部补导入：

```ts
import { guard, RATE_LIMITS } from "@/lib/rateLimit";
```

- [ ] **Step 2: 在三个 `requireUser` + `authorize` 风格的路由里插入限流**

`src/app/api/quick-notes/route.ts`（仅 POST 处理器）、`src/app/api/insights/generate/route.ts`、`src/app/api/recipes/suggest/route.ts` 三处，都在 `const denied = await authorize(...)` 与 `if (denied) return denied;` 之后插入：

```ts
const limited = guard(`ai:${auth.user.id}`, RATE_LIMITS.ai);
if (limited) return limited;
```

顶部补导入 `guard, RATE_LIMITS`（`quick-notes/route.ts` 的 GET 处理器不加限流）。

- [ ] **Step 3: 用低阈值验证（无需真实 AI key）**

先停掉当前 dev server，用 2 次/分钟启动，并重新取 token：

```bash
OAK_AI_RATE_LIMIT=2 npm run dev

APP_TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/auth/app-login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# ai-chat 缺 session 会返回 400，但限流在业务校验之前生效
for i in $(seq 1 3); do
  curl -s -o /dev/null -w "第 $i 次: %{http_code}\n" -X POST http://127.0.0.1:3000/api/ai-chat \
    -H "Authorization: Bearer $APP_TOKEN" -H 'Content-Type: application/json' \
    -d '{"id":999999,"messages":[]}'
done
```

预期：第 1、2 次 **400**（会话不存在），第 3 次 **429**。

- [ ] **Step 4: 恢复默认阈值并确认不影响正常读取**

```bash
# Ctrl-C 停掉低阈值实例，再用默认阈值启动
npm run dev

APP_TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/auth/app-login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

curl -s -o /dev/null -w 'quick-notes 列表: %{http_code}\n' \
  "http://127.0.0.1:3000/api/quick-notes?limit=5" -H "Authorization: Bearer $APP_TOKEN"
```

预期：**200**（GET 不受 AI 限流影响）。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/ai-chat/route.ts src/app/api/ai/complete/route.ts \
  src/app/api/garden-idiom-story/route.ts src/app/api/quick-notes/route.ts \
  src/app/api/insights/generate/route.ts src/app/api/recipes/suggest/route.ts
git commit -m "feat(rate-limit): AI 额度接口按用户限流"
```

---

### Task 6: 首屏聚合接口 `/api/app/home`

**Files:**
- Create: `src/app/api/app/home/route.ts`
- Modify: `scripts/gen-api-perms.mjs`（`RESOURCE_LABELS`）
- Modify: `src/generated/apiPerms.generated.ts`（由脚本重新生成）

**Interfaces:**
- Consumes: Task 1 的 Bearer 支持、Task 4 的全局限流
- Produces: `GET /api/app/home` → `{ children, todos, notices, notes, activity }`，权限点 `api:app:home-get`

- [ ] **Step 1: 确认接口尚不存在**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/app/home \
  -H "Authorization: Bearer $APP_TOKEN"
```

预期：**404**。

- [ ] **Step 2: 创建 `src/app/api/app/home/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bills,
  certArchives,
  children,
  growthRecords,
  healthRecords,
  learningRecords,
  moments,
  notes,
  pushLogs,
  quickNotes,
  todoSteps,
  todos,
} from "@/db/schema";
import { authorize, requireUser } from "@/lib/auth";

/** 按北京时间归到 YYYY-MM-DD（与 /api/stats/heatmap 一致） */
function dayKey(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date(iso));
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 移动端首屏聚合：成员 + 未完成待办 + 未读通知 + 最近快记 + 近 7 天活动 */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:app:home-get");
  if (denied) return denied;
  const uid = auth.user.id;

  const childRows = db.select().from(children).where(eq(children.userId, uid)).orderBy(children.id).all();

  const todoRows = db
    .select()
    .from(todos)
    .where(and(eq(todos.userId, uid), eq(todos.done, 0)))
    .orderBy(desc(todos.id))
    .all();
  const todoIds = todoRows.map((t) => t.id);
  const steps = todoIds.length
    ? db.select().from(todoSteps).where(inArray(todoSteps.todoId, todoIds)).orderBy(todoSteps.sort).all()
    : [];

  const noticeRows = db
    .select()
    .from(pushLogs)
    .where(and(eq(pushLogs.userId, uid), eq(pushLogs.read, 0)))
    .orderBy(desc(pushLogs.id))
    .limit(50)
    .all();

  const noteRows = db
    .select()
    .from(quickNotes)
    .where(eq(quickNotes.userId, uid))
    .orderBy(desc(quickNotes.id))
    .limit(5)
    .all();

  // 近 7 天活动：表集合与 /api/stats/heatmap 保持一致
  const sinceIso = new Date(Date.now() - 7 * 86400000).toISOString();
  const days: Record<string, number> = {};
  for (const table of [
    quickNotes,
    moments,
    growthRecords,
    healthRecords,
    bills,
    learningRecords,
    certArchives,
    notes,
  ]) {
    const rows = db
      .select({ createdAt: table.createdAt })
      .from(table)
      .where(and(eq(table.userId, uid), gte(table.createdAt, sinceIso)))
      .all();
    for (const r of rows) {
      const day = dayKey(r.createdAt);
      days[day] = (days[day] ?? 0) + 1;
    }
  }

  return NextResponse.json({
    children: childRows.map((c) => ({
      id: c.id,
      name: c.name,
      nickname: c.nickname,
      birthday: c.birthday,
      photo: c.photo,
    })),
    todos: todoRows.map((t) => ({
      id: t.id,
      title: t.title,
      done: t.done,
      dueDate: t.dueDate,
      remindAt: t.remindAt,
      priority: t.priority,
      myDayDate: t.myDayDate,
      steps: steps.filter((s) => s.todoId === t.id),
    })),
    notices: noticeRows.map((n) => ({ id: n.id, content: n.content, createdAt: n.createdAt })),
    notes: noteRows.map((n) => ({
      id: n.id,
      content: n.content,
      status: n.status,
      photos: parseJson<string[]>(n.photos, []),
      result: parseJson<Record<string, unknown>>(n.result, {}),
      createdAt: n.createdAt,
    })),
    activity: {
      days: Object.entries(days)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
    },
  });
}
```

- [ ] **Step 3: 注册资源展示名**

在 `scripts/gen-api-perms.mjs` 的 `RESOURCE_LABELS` 对象里加一行：

```js
  app: "移动端",
```

- [ ] **Step 4: 重新生成权限点并确认**

```bash
node scripts/gen-api-perms.mjs
grep -A2 '"api:app:home-get"' src/generated/apiPerms.generated.ts
```

预期：输出 `"resource": "app", "perms": "api:app:home-get", "label": "移动端·home-get"`。

- [ ] **Step 5: 验证接口返回**

```bash
curl -s http://127.0.0.1:3000/api/app/home -H "Authorization: Bearer $APP_TOKEN" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('keys:',Object.keys(j).join(','));console.log('children:',j.children.length,'todos:',j.todos.length,'notices:',j.notices.length,'notes:',j.notes.length,'activity:',j.activity.days.length)})"
```

预期：`keys: children,todos,notices,notes,activity`，各计数为非负整数（不报错即结构正确）。

- [ ] **Step 6: 提交**

```bash
git add src/app/api/app/home/route.ts scripts/gen-api-perms.mjs src/generated/apiPerms.generated.ts
git commit -m "feat(app): 新增移动端首屏聚合接口"
```

---

### Task 7: 上传体积与数量边界

**Files:**
- Modify: `src/app/api/upload/route.ts`

**Interfaces:**
- Consumes: 无
- Produces: 上传接口拒绝超大/超量请求（Content-Length > 60MB → 413；单文件 > 15MB → 413；文件数 > 9 → 400）。

- [ ] **Step 1: 造一个超限文件并确认现状会接受**

```bash
mkdir -p /tmp/oak-upload-test && cd /tmp/oak-upload-test
head -c 16777216 /dev/urandom > big.png   # 16MB，仅用于体积测试
curl -s -o /dev/null -w '现状: %{http_code}\n' -X POST http://127.0.0.1:3000/api/upload \
  -H "Authorization: Bearer $APP_TOKEN" -F "files=@big.png;type=image/png"
```

预期：**200**（当前无任何体积校验，这正是要修的问题）。

- [ ] **Step 2: 清理这次测试写入的文件**

```bash
# 记下返回的 /uploads/xxx 路径，删除对应文件，避免污染上传目录
ls -1t /Users/yabo/wwwroot/oak/uploads | head -1
# 确认后删除：
# rm "/Users/yabo/wwwroot/oak/uploads/<刚看到的文件名>"
```

- [ ] **Step 3: 加边界**

在 `src/app/api/upload/route.ts` 的 `EXT_MAP` 之后加常量：

```ts
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 与 src/lib/quick/download.ts 的外链归档上限一致
const MAX_FILES = 9;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024; // 9 × 15MB + 表单开销
```

在 `POST` 里 `requirePerm` 校验之后、`req.formData()` **之前**插入 Content-Length 预检：

```ts
  // formData() 会把整个请求体读进内存，必须先按声明长度拦截
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: "上传内容过大" }, { status: 413 });
  }
```

在 `if (!files.length)` 之后插入：

```ts
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `一次最多上传 ${MAX_FILES} 个文件` }, { status: 400 });
  }
```

在 `for (const file of files)` 循环体第一行插入：

```ts
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "单个文件不能超过 15MB" }, { status: 413 });
    }
```

- [ ] **Step 4: 验证边界**

```bash
cd /tmp/oak-upload-test

# 4a. 16MB 单文件 → 413
curl -s -o /dev/null -w '超大文件: %{http_code}\n' -X POST http://127.0.0.1:3000/api/upload \
  -H "Authorization: Bearer $APP_TOKEN" -F "files=@big.png;type=image/png"

# 4b. 10 个小文件 → 400
for i in $(seq 1 10); do head -c 1024 /dev/urandom > "s$i.png"; done
curl -s -o /dev/null -w '10 个文件: %{http_code}\n' -X POST http://127.0.0.1:3000/api/upload \
  -H "Authorization: Bearer $APP_TOKEN" \
  -F "files=@s1.png;type=image/png" -F "files=@s2.png;type=image/png" \
  -F "files=@s3.png;type=image/png" -F "files=@s4.png;type=image/png" \
  -F "files=@s5.png;type=image/png" -F "files=@s6.png;type=image/png" \
  -F "files=@s7.png;type=image/png" -F "files=@s8.png;type=image/png" \
  -F "files=@s9.png;type=image/png" -F "files=@s10.png;type=image/png"

# 4c. 正常单文件仍可用（仓库里真实存在的 PNG）
curl -s -X POST http://127.0.0.1:3000/api/upload \
  -H "Authorization: Bearer $APP_TOKEN" \
  -F "files=@/Users/yabo/wwwroot/oak/images/timer.png;type=image/png"
```

预期：4a 为 **413**；4b 为 **400**；4c 返回 `{"paths":["/uploads/..."]}`。

- [ ] **Step 5: 清理测试残留**

```bash
rm -rf /tmp/oak-upload-test
# 删除 4c 写入的那个 /uploads/xxx
ls -1t /Users/yabo/wwwroot/oak/uploads | head -1
```

- [ ] **Step 6: 提交**

```bash
git add src/app/api/upload/route.ts
git commit -m "fix(upload): 增加体积与数量边界，防止超大请求打爆内存"
```

---

### Task 8: 最小权限账号（Web 端手工配置）

**Files:**
- 无代码改动（Web 端操作）

**Interfaces:**
- Consumes: Task 6 生成的 `api:app:home-get` 权限点
- Produces: 一个只具备移动端所需权限的账号，用于客户端登录。

- [ ] **Step 1: 新建角色**

浏览器打开 `http://127.0.0.1:3000`，用 `admin` / `admin123` 登录 → 系统管理 → 角色 → 新增，编码填 `app`，名称填「移动端」，保存。

- [ ] **Step 2: 勾选权限点**

在该角色权限树中只勾选以下接口权限（其余一律不勾）：

- 移动端 · home-get
- 成员 · 查看列表
- 一句话快记 · 查看列表、新增
- 待办 · 查看列表、开关
- 提醒中心 · 查看列表、发送日志、标记已读
- 文件上传 · 上传文件

- [ ] **Step 3: 新建用户并分配角色**

系统管理 → 用户 → 新增，用户名 `app`，设置密码；角色分配里勾选「移动端」。

- [ ] **Step 4: 验证最小权限生效**

```bash
APP2=$(curl -s -X POST http://127.0.0.1:3000/api/auth/app-login \
  -H 'Content-Type: application/json' -d '{"username":"app","password":"<刚设置的密码>"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

curl -s -o /dev/null -w '允许的接口: %{http_code}\n' http://127.0.0.1:3000/api/app/home -H "Authorization: Bearer $APP2"
curl -s -o /dev/null -w '未授权的接口: %{http_code}\n' http://127.0.0.1:3000/api/bills -H "Authorization: Bearer $APP2"
```

预期：`/api/app/home` **200**，`/api/bills` **403**。

- [ ] **Step 5: 记录账号信息（不要进仓库）**

把角色编码 `app`、用户名 `app` 与密码记到本地密码管理器或部署笔记，**不要写进仓库任何文件**——`docs/` 同样在版本控制内。

---

### Task 9: 威胁模型补充与构建验证

**Files:**
- Modify: `THREAT_MODEL.md`

**Interfaces:**
- Consumes: 前 8 个任务的全部改动
- Produces: 威胁模型覆盖移动端接入，且本地构建通过。

- [ ] **Step 1: 在 `THREAT_MODEL.md` 末尾追加一节**

```markdown
## 移动端接入（Flutter 客户端）

- **暴露面**：客户端经公网直连 `/api/*`，与 Web 端共用同一套 JWT 与权限点。客户端专用账号只授予移动端所需的最小权限（见 Task 8），未授予 delete/update。
- **token 存储**：客户端将 token 存于系统钥匙串（iOS Keychain / Android Keystore），不落明文。token 有效期 30 天，与 Web 会话同权；撤销账号或停用账号即刻失效（`requireUser` 每次校验 `users.status`）。
- **明文传输风险**：若暂用 `http://IP:端口`，token 与家庭数据在链路上可被中间人读取。仅限开发期或内网组网；公网部署应改为域名 + HTTPS。
- **限流**：登录按 IP + 用户名 5 次/分钟；AI 额度接口按用户 20 次/分钟（防 token 泄漏后刷爆模型账单）；全局按用户 300 次/分钟兜底。实现为进程内计数，pm2 reload 后清零。
- **上传边界**：单文件 ≤ 15MB、单次 ≤ 9 个、请求体声明长度 ≤ 60MB，超限分别返回 413/400。
```

- [ ] **Step 2: 本地构建必须通过**

```bash
cd /Users/yabo/wwwroot/oak
npm run build
```

预期：构建成功，无 TypeScript 错误。注意 `npm run build` 会先跑 `gen-api-perms.mjs` 与 `warm-db.mjs`。

> 若构建报 SQLITE_BUSY，先停掉 dev server 再重试（并行构建会争用 SQLite）。

- [ ] **Step 3: 完整回归**

```bash
# 1. Web 端 cookie 登录不受影响
curl -s -o /dev/null -w 'Web 登录: %{http_code}\n' -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}'

# 2. Bearer 打三个关键接口
for p in /api/app/home /api/quick-notes?limit=5 /api/todos; do
  curl -s -o /dev/null -w "$p: %{http_code}\n" "http://127.0.0.1:3000$p" -H "Authorization: Bearer $APP_TOKEN"
done

# 3. 无凭证仍 401
curl -s -o /dev/null -w '无凭证: %{http_code}\n' http://127.0.0.1:3000/api/app/home
```

预期：全为 **200**，最后一行 **401**。

- [ ] **Step 4: 提交**

```bash
git add THREAT_MODEL.md
git commit -m "docs(threat-model): 补充移动端接入的暴露面与限流策略"
```

---

## 完成标准

- [ ] `feat/app-api` 分支包含 9 次提交，每个任务一次。
- [ ] `npx tsx scripts/rate-limit-smoke.ts` 通过。
- [ ] `npm run build` 本地通过。
- [ ] 用 `admin` 的 token 能调 `/api/app/home`、`/api/quick-notes`、`/api/todos`；用最小权限账号能调 `/api/app/home` 但 `/api/bills` 返回 403。
- [ ] Web 端登录、页面浏览行为不变。
