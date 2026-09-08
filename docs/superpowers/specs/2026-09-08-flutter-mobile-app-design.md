# Oak 作为 Flutter 移动端服务端 —— 设计规格

日期：2026-09-08
状态：待用户确认
取代：小程序方案（本文档第 8 节记录已弃用的替代方案）

## 1. 目标

让 Oak 成为 Flutter 客户端（Android / iOS / macOS）的服务端，客户端独立仓库，首版覆盖：

1. **概览** —— 打开就能看到未完成待办、未读通知、最近的快记。
2. **快记** —— 随手记一句话、可拍照，复用现有 AI 归类链路落库。
3. **待办提醒** —— 查看待办并勾选完成、查看通知并标记已读。

## 2. 非目标（首版不做）

- 不做账单/成长/健康等其余模块页面。
- 不做客户端内的管理能力（成员、系统设置、权限分配仍在 Web 端）。
- 不改动现有 Web 端行为与权限体系。
- 不做离线缓存与推送通知（APNs/FCM）。

## 3. 现状评估

Oak 的 100+ 个 `/api/*` 路由都是标准 Next.js Route Handlers，JSON 进出，无 CSRF/Origin 校验，任何 HTTP 客户端可直接调用。数据隔离由 `makeCollectionHandlers` 强制按 `user_id` 完成，权限由 Casbin 的 `api:{resource}:{action}` 权限点控制，权限点清单在构建时由 `scripts/gen-api-perms.mjs` 自动扫描生成。

Flutter 相比小程序，**去掉了三处最麻烦的约束**：

| 小程序约束 | Flutter 现状 |
| --- | --- |
| 必须 HTTPS + 备案域名，不能用 IP | 可直接连 `http://IP:端口`，仅需客户端放开明文策略（见第 6 节） |
| `callContainer` 超时 ≤ 15 秒、请求体 ≤ 100 KB | 无此限制，AI 流式对话与图片上传可直连现有接口 |
| 微信 `wx.login` → openid 绑定 | 直接用账号密码换 token，不需要额外映射表 |

剩下的缺口只有一个：**鉴权只读 cookie**。`src/lib/auth.ts:26` 的 `getTokenFromRequest` 不读 `Authorization` 头，原生客户端无法携带凭证。另有登录接口无失败次数限制、上传接口无大小校验（详见 R5），公网暴露前需加固。

使用约束（客户端需遵守）：接口形状直接绑数据库列（POST 把 body 透传给 drizzle insert，`id`/`userId` 由服务端覆盖），客户端字段名必须与 `src/db/schema.ts` 列名一致；`?page=` 存在时返回 `{ total, list }`，否则返回裸数组。

## 4. 架构

```
Flutter 客户端（Android / iOS / macOS，独立仓库 oak-app）
   │  HTTP(S) + Authorization: Bearer <oak JWT>
   ▼
oak（Next.js standalone，容器内 pm2，单实例）
   ├─ /api/auth/app-login  【新增】账号密码 → 返回 token（body，不设 cookie）
   ├─ /api/app/home        【新增】首屏聚合
   ├─ /api/quick-notes     （复用：列表 + 创建）
   ├─ /api/todos           （复用：列表 + 勾选完成）
   ├─ /api/reminders       （复用：规则列表）
   ├─ /api/reminders/logs  （复用：通知流水 + 标记已读）
   ├─ /api/children        （复用：成员列表）
   └─ /api/upload          （复用：multipart 上传）
```

## 5. 后端改造

### R1 鉴权支持 Bearer（核心，最小改动）

改 `src/lib/auth.ts` 的 `getTokenFromRequest`：优先取 `Authorization: Bearer <token>`，无则回退 cookie。全部现有路由零改动即支持原生客户端，Web 端 cookie 路径行为不变。`src/proxy.ts` 的 matcher 已排除 `api`，无需改动。

### R2 客户端登录接口

新增 `POST /api/auth/app-login`，请求体 `{ username, password }`，校验通过后返回 `{ token, user: { id, displayName, isAdmin } }`，**不设置 cookie**。

为什么新开一个接口而不是改 `/api/auth/login`：Web 端登录靠 httpOnly cookie 抵御 XSS 窃取 token，若在同一个响应里把 token 放进 body，等于把这个保护作废。两个接口共用同一套校验逻辑（抽一个 `verifyCredentials` 函数）。

放在 `/api/auth/` 下还有一个好处：`scripts/gen-api-perms.mjs` 明确跳过 `auth/*`，登录接口不会产生权限点，避免"登录需要权限"的先有鸡还是先有蛋问题。

token 有效期沿用 30 天，客户端存入 Keychain / Keystore（`flutter_secure_storage`）。

### R3 首屏聚合

新增 `GET /api/app/home`，一次返回首屏所需：成员列表、未完成待办、未读通知、最近 5 条快记、近 7 天活动计数。

数据来源（全部复用现有查询）：`children`、`todos`（含 steps）、`push_logs`（`read = 0`）、`quick_notes`（limit 5）、活动热力图聚合。

响应形状：

```jsonc
{
  "children": [{ "id": 1, "name": "…", "birthday": "…" }],
  "todos": [{ "id": 1, "title": "…", "done": 0, "dueAt": "…", "steps": [] }],
  "notices": [{ "id": 1, "content": "…", "createdAt": "…" }],
  "notes": [{ "id": 1, "content": "…", "status": "processed", "result": {} }],
  "activity": { "days": [{ "date": "2026-09-08", "count": 3 }] }
}
```

权限点 `api:app:home-get` 由构建脚本自动扫描生成，无需手写；同时在 `scripts/gen-api-perms.mjs` 的 `RESOURCE_LABELS` 里补 `app: "移动端"`，否则角色配置页显示为裸资源名。

### R4 权限与安全

**决策（2026-09-08 实测后修正）**：客户端用**数据归属账号**登录（`admin` 或家庭成员本人的账号），**不建客户端专用账号**。原因：oak 的数据按 `user_id` 隔离，专用账号是全新用户、名下没有任何数据——实测用 `app` 账号登录 `/api/app/home` 返回全空（`children=0 todos=0 notices=0 notes=0`），与「App 要看到家庭数据」直接冲突。

代价与缓解：App 持有的 token 与 Web 端会话同权，没有最小权限收敛。缓解手段是登录限流（R5）、token 存系统钥匙串、30 天有效期、账号停用即失效。**若将来 oak 支持多账号共享家庭数据，再回到「专用账号 + 最小权限角色」方案**——届时角色需勾的权限点如下（已按 `scripts/gen-api-perms.mjs` 的生成规则核对，保留备查）：

- `api:app:home-get`
- `api:children:list`
- `api:quick-notes:list`、`api:quick-notes:create`
- `api:todos:list`、`api:todos:toggle-post`
- `api:reminders:list`、`api:reminders:logs-get`、`api:reminders:logs-read-post`
- `api:upload:upload`

加固项：

- 登录与 AI 接口限流，见 R5。
- 客户端 token 与 Web 会话同权，30 天有效；401 时清 token 并跳登录页。
- 在 `THREAT_MODEL.md` 增补一节：公网暴露面、token 同权风险、限流策略。

### R5 限流与上传边界

**前提**：oak 必须单实例运行（`ecosystem.config.js` 明确 fork 单实例，原因是 SQLite 与常驻调度），因此**进程内内存计数器就是准确的**，不需要 Redis，也不需要引入限流库。

**实现位置**：新建 `src/lib/rateLimit.ts`（滑动窗口，Map 存储，惰性清理），在 Node runtime 的路由里调用。**不放在 `src/proxy.ts`**——它跑在 Edge runtime，进程内状态不可靠，且其 matcher 已排除 `api`。

| 层 | 范围 | 阈值 | 目的 |
| --- | --- | --- | --- |
| L1 | `/api/auth/login`、`/api/auth/app-login` | 同 IP + 用户名 5 次/分钟（成功即重置计数） | 防密码爆破 |
| L2 | 消耗 AI 额度的接口 | 按用户 20 次/分钟 | 防 token 泄漏后刷爆模型账单 |
| L3 | `requirePerm` 内按用户 | 300 次/分钟 | 滥用兜底 |

L2 覆盖 `/api/ai-chat`、`/api/ai/complete`、`/api/garden-idiom-story`、`/api/quick-notes`（POST 归类）、`/api/insights/generate`、`/api/recipes/suggest`。

L3 挂在 `requirePerm` 这一个统一入口上，改动只有一处；阈值必须宽松（Web 端单个页面可能并发 5~10 个请求），只做滥用兜底，不做精细控制。

行为：超限返回 429 与 `Retry-After`。内存计数在 pm2 reload 后清零，部署不频繁，可接受。

**不做**：账号锁定（家庭系统账号少，锁定容易误伤自己）、分布式限流（单实例，YAGNI）、引入限流依赖（App Router 不适用 Express 中间件，30 行足够）。

**附带修复**：`/api/upload` 目前只有 MIME 白名单、没有任何大小校验，`req.formData()` 会把整个文件读进内存。补单文件 15 MB、单次最多 9 张的限制（与 `src/lib/quick/download.ts` 已有的 15 MB 上限对齐）。

## 6. 网络接法（三选一，取决于服务器位置）

| 方案 | 适用 | 代价 |
| --- | --- | --- |
| 纯 IP + HTTP | 服务器在公网、图省事 | 家庭数据与 token 明文过网；客户端需放开明文策略 |
| 域名 + HTTPS | 服务器在公网、要安全 | 国内服务器绑域名需 ICP 备案（7~20 天）；个人主体可办 |
| 内网组网（Tailscale / WireGuard） | 服务器在家里 | 零公网暴露、零备案、零证书；每台设备装一次客户端 |

推荐：服务器在家就用内网组网（对"自托管家庭数据"最契合）；在公网就加域名 + HTTPS，备案期间不影响开发。

部署注意：Nginx / OpenResty 默认 `client_max_body_size 1M`，会直接挡掉照片上传（413），需在 1Panel 反代配置里调大到 ≥ 15 MB。

**客户端放开明文 HTTP 的具体位置**（仅在前两种方案、且暂用 HTTP 时需要）：

- Android：`android/app/src/main/AndroidManifest.xml` 的 `<application>` 加 `android:usesCleartextTraffic="true"`，或更精细地用 `res/xml/network_security_config.xml` 只放行目标 `IP:端口`。
- iOS：`ios/Runner/Info.plist` 的 `NSAppTransportSecurity`。**`NSExceptionDomains` 只支持域名，不支持 IP**，所以走纯 IP 时必须用 `NSAllowsArbitraryLoads`（全局放开，自用可接受，上架 App Store 有被拒风险）；有域名时用 `NSExceptionDomains` 精确放行。
- macOS：Flutter 的强制策略覆盖 iOS/Android；若启用 App Sandbox，需 `com.apple.security.network.client` 权限（Mac App Store 上架必须沙盒）。
- 局域网地址：iOS 14+ / macOS 15+ 访问内网设备会弹"本地网络"授权，需在 Info.plist 加 `NSLocalNetworkUsageDescription` 说明用途。

## 7. 客户端（Flutter，独立仓库）

### 7.1 技术栈

| 用途 | 库 | 说明 |
| --- | --- | --- |
| 网络 | `dio` ^5.7 | 拦截器注入 Bearer、401 重登、FormData 上传；二期接 AI 流式 |
| 状态管理 | `flutter_riverpod` ^3 | 编译期安全；页面少时也可只用 `Notifier` |
| 路由 | `go_router` ^17 | 官方推荐，深链（未来推送跳转） |
| token 存储 | `flutter_secure_storage` ^10 | iOS Keychain / Android Keystore |
| 选图拍照 | `image_picker` ^1.2 | 拍照 + 相册 |
| 图片展示 | `cached_network_image` | 列表图片缓存，避免滚动重复下载 |
| 日期 | `intl` | 中文日期与相对时间 |
| 模型 | `freezed` ^4 + `json_serializable` + `build_runner` | 不可变模型、`fromJson`、`copyWith`；**必须 ≥ 4.0.1**：3.2.5 在 Dart 3.13 上会生成非法的 `final` 构造参数 |
| 测试 | `mocktail` + `http_mock_adapter` | dio 的 mock |

明确不引入：本地数据库（drift/isar/hive，M1 无离线需求）、`get_it`（Riverpod 即 DI 容器）、`flutter_dotenv`（baseUrl 用 `--dart-define`）、Bloc（规模不需要）、GetX（不推荐）。

**freezed 4.x 语法要点**（4.0 只改了「构造参数里不能再用 `final`」，其余与 3.x 相同；网上旧教程会误导）：

- 单构造用 `abstract class`，多构造联合类型用 `sealed class`，都必须带 `with _$X`
- 两个 part：`part 'x.freezed.dart';` 与 `part 'x.g.dart';`
- `fromJson` 必须用 `=>` 箭头写法才会生成：`factory X.fromJson(Map<String, dynamic> json) => _$XFromJson(json);`
- `.map()` / `.when()` 已移除，改用 Dart 3 原生 `switch` 模式匹配
- 生成命令：`dart run build_runner build --delete-conflicting-outputs`（改字段后重跑；开发时用 `watch` 更顺手）
- **版本下限**：freezed ≥ 4.0.1。3.2.5 在 Dart 3.13 上会为集合字段生成 `const _X({final List<T> items = ...})` 这种非法参数，报错形如 *"Try removing 'final'"*——升到 4.0.1 即可（4.0 的唯一破坏性变更就是移除该语法）

**依赖位置**（放错会导致编译期找不到注解）：`freezed_annotation`、`json_annotation` 在 `dependencies`；`freezed`、`json_serializable`、`build_runner` 在 `dev_dependencies`。

**生成文件的提交约定**：`*.freezed.dart` 与 `*.g.dart` **提交进仓库**，不写进 `.gitignore`。个人开发、无固定 CI 的场景下，clone 下来即可编译，避免"拉代码后第一次编译报缺文件"。代价是改模型后必须重跑生成命令，否则生成文件与模型不一致——代码评审或提交前留意 `git status` 里是否有未重新生成的 `*.freezed.dart`。

oak 接口返回的 JSON 键就是 camelCase（`dueDate`、`createdAt`），不需要 `@JsonKey` 做蛇形转换。

### 7.2 目录结构

```
lib/
  main.dart
  config.dart          baseUrl（--dart-define=OAK_BASE_URL）
  api/client.dart      Dio 封装：baseUrl、Bearer 注入、401 重登录、错误提示
  api/auth.dart        token 存取（flutter_secure_storage）
  models/              freezed 模型：child / todo / notice / quick_note / home_summary
  pages/
    login/             账号密码登录
    home/              概览：待办、通知、最近快记、活动简版
    quick_note/        快记：文字 + 拍照/相册上传 + AI 归类结果
    todos/             待办列表 + 勾选完成
    notices/           通知列表 + 标记已读
```

### 7.3 关键实现点

- HTTP 客户端统一用 `dio`：拦截器注入 `Authorization: Bearer`，401 时清 token 并跳登录页；二期接 AI 对话时用 `ResponseType.stream` 解析 SSE。
- 图片上传：`dio.FormData`，字段名 `files`（接口用 `formData.getAll("files")` 取多文件），拿到 `/uploads/xxx` 存入快记的 `photos`。
- 图片展示：接口返回相对路径 `/uploads/xxx`，需拼 `baseUrl` 后交给 `CachedNetworkImage`。
- 模型：`/api/app/home` 的响应整体映射为一个 `HomeSummary` freezed 模型，内部嵌套 `Child` / `Todo` / `Notice` / `QuickNote`。
- 待办与通知是两个数据源：`/api/todos` 返回 `{ todos: [...含 steps], lists: [...] }`（不分页）；`/api/reminders/logs` 带 `?page=` 返回 `{ total, list }` 且带 `read` 标记。

## 8. 已评估并放弃的替代方案

**微信小程序**（放弃）：微信要求 HTTPS + 备案域名（不能用 IP），且小程序自身还需备案。微信云托管虽可用 `wx.cloud.callContainer` 免域名免备案，但与 oak 的架构冲突：SQLite 与 `uploads/`、`data/tts/` 都在容器本地磁盘而云托管磁盘不持久；`src/instrumentation.ts` 的三个常驻调度器（提醒/洞察/食谱）在弹性多副本下会重复触发、缩容到 0 则不执行（`ecosystem.config.js` 明确要求单实例）；`callContainer` 的 15 秒超时与 100 KB 请求体上限也装不下 AI 对话与拍照上传。

**纯 IP + HTTP 用于公网**：首版可用，但 token 与家庭数据明文过网，长期建议升级为域名 + HTTPS 或内网组网。

## 9. 分发注意

- iOS / macOS 真机安装需 Apple Developer 账号：免费账号侧载有效期 7 天，付费（99 美元/年）可用 TestFlight（90 天）与长期安装。
- Android 自用直接装 APK；上架国内应用商店需 **App 备案**（类比小程序备案）。
- 中国区 App Store 上架同样需要 App 备案号。纯自用（侧载 / TestFlight）不涉及。

## 10. 里程碑

| 阶段 | 内容 | 依赖 |
| --- | --- | --- |
| M1 | R1 Bearer + R2 app-login + R3 home 聚合 + R4 权限账号 + R5 限流与上传边界 | 无 |
| M2 | Flutter 骨架：client 封装 + 登录页 + 概览页 | M1 |
| M3 | 快记：拍照上传 + AI 归类结果展示 | M2 |
| M4 | 待办提醒：列表 + 勾选 + 已读 | M2 |
| M5 | 真机联调（Android + iOS + macOS） | M4 |

网络接法不阻塞 M1~M4：开发期连局域网 IP 即可。

## 11. 测试

- 后端：`curl -H "Authorization: Bearer <token>"` 打 `/api/app/home`、`/api/quick-notes`；本地 `npm run build` 必须跑通（本机无法盯 CI）。
- 客户端：Android 模拟器 + iOS 模拟器 + 真机各跑一遍登录、快记、勾选。
- 回归：Web 端登录与全部页面行为不变（cookie 路径未改，`/api/auth/login` 未改）。

## 12. 风险

| 风险 | 应对 |
| --- | --- |
| 明文 HTTP 下 token 与家庭数据可被中间人读取 | 内网组网或域名 + HTTPS；纯 IP 仅作开发期临时方案 |
| iOS 走纯 IP 需全局放开明文，上架有被拒风险 | 自用侧载不受影响；若要上架，改用域名 + HTTPS |
| 客户端 token 与 Web 会话同权 | 最小权限角色 + 登录限流；后续可加 `scope` 声明与路由级校验 |
| 接口透传 body 到数据库列，客户端可写任意列 | 客户端只提交已知字段；对外开放前再加服务端字段白名单 |
| AI 归类失败 | 现有链路已保证原始流水先落库，客户端展示 `status: failed` 与错误摘要 |
