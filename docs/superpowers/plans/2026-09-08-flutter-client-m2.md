# Flutter 客户端骨架（M2）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建起 Flutter 客户端仓库 `oak-app` 的可用骨架——能登录 oak、能拉到 `/api/app/home` 并在概览页展示。

**Architecture:** 独立仓库，纯客户端，只通过 HTTP 调 oak 的 REST 接口。状态用 Riverpod，路由用 go_router，网络用 dio（拦截器注入 Bearer、401 清 token 回登录页），模型用 freezed + json_serializable。首版不做离线缓存。

**Tech Stack:** Flutter 3.x / Dart 3、dio、flutter_riverpod、go_router、flutter_secure_storage、cached_network_image、intl、freezed + json_serializable + build_runner。

**规格：** `docs/superpowers/specs/2026-09-08-flutter-mobile-app-design.md`（第 7 节）
**前置：** M1 已合并（PR #1），oak 侧 `/api/auth/app-login` 与 `/api/app/home` 可用。

## Global Constraints

- **仓库位置**：`/Users/yabo/wwwroot/oak-app`，Dart 包名 `oak_app`（Dart 包名只能小写下划线，与仓库名不同是正常的）。
- **平台**：`android,ios,macos` 三端一次生成；不生成 web/windows/linux。
- **baseUrl 用 `--dart-define=OAK_BASE_URL=...`**，不引入 `flutter_dotenv`。
- **freezed 3.x 语法**：单构造用 `abstract class`、必须 `with _$X`、`fromJson` 用 `=>` 箭头写法；`.map()`/`.when()` 已移除，用 Dart 3 `switch`。生成文件 `*.freezed.dart` / `*.g.dart` **提交进仓库**（不写 .gitignore），改模型后重跑生成命令。
- **oak 接口返回 camelCase**（`dueDate`、`createdAt`），不需要 `@JsonKey` 蛇形转换。
- **不引入**：drift/isar/hive（无离线需求）、get_it（Riverpod 即 DI）、Bloc、GetX。
- **验证方式**：`flutter analyze` 必须零告警；纯逻辑写 `flutter test`（仓库自带 flutter_test，无需额外框架）；端到端用 macOS 桌面端连本地 oak dev server 实跑。
- **本地联调账号**：用 M1 建的最小权限账号 `app`（密码在本机 dev 库，未入库）或 `admin/admin123`；oak dev server 需先 `npm run dev` 起在 127.0.0.1:3000。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `lib/main.dart` | `ProviderScope` + `MaterialApp.router`，注册路由 |
| `lib/config.dart` | 读取 `OAK_BASE_URL`（缺省 `http://127.0.0.1:3000`） |
| `lib/api/client.dart` | Dio 实例 + 拦截器：注入 Bearer、401 清 token、错误转 `ApiException` |
| `lib/api/auth.dart` | `AuthService`：登录、登出、token 读写（flutter_secure_storage） |
| `lib/api/home_api.dart` | `fetchHome()` → `HomeSummary` |
| `lib/models/*.dart` | freezed 模型：`Child` / `Todo` / `TodoStep` / `Notice` / `QuickNote` / `HomeSummary` |
| `lib/router.dart` | go_router 配置 + 登录态重定向 |
| `lib/pages/login/login_page.dart` | 用户名密码登录 |
| `lib/pages/home/home_page.dart` | 概览：待办、通知、最近快记、近 7 天活动 |
| `test/home_summary_test.dart` | `HomeSummary.fromJson` 的映射单测（不依赖网络） |

---

### Task 1: 仓库与项目骨架

**Files:**
- Create: `/Users/yabo/wwwroot/oak-app/`（整个项目）
- Modify: `pubspec.yaml`

**Interfaces:**
- Consumes: 无
- Produces: 可编译的 Flutter 工程，含全部依赖，`flutter analyze` 通过。

- [ ] **Step 1: 确认 SDK 可用**

```bash
flutter --version
flutter doctor -v | head -20
```

预期：能看到 Flutter 版本（≥ 3.24）与 Dart 3。若 `flutter: command not found`，先完成 SDK 安装并重开终端。

- [ ] **Step 2: 生成项目**

```bash
cd /Users/yabo/wwwroot
flutter create --org com.oak --project-name oak_app --platforms=android,ios,macos oak-app
cd oak-app
git init
```

预期：生成 `lib/main.dart`、`pubspec.yaml`、`android/`、`ios/`、`macos/`，`git init` 成功。

- [ ] **Step 3: 写 pubspec 依赖**

把 `pubspec.yaml` 的 `dependencies` / `dev_dependencies` 改为：

```yaml
dependencies:
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.8
  dio: ^5.7.0
  flutter_riverpod: ^3.0.0
  go_router: ^17.0.0
  flutter_secure_storage: ^10.0.0
  cached_network_image: ^3.4.1
  intl: ^0.20.0
  freezed_annotation: ^3.0.0
  json_annotation: ^4.9.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0
  build_runner: ^2.4.13
  freezed: ^3.0.0
  json_serializable: ^6.8.0
```

- [ ] **Step 4: 拉依赖并确认可编译**

```bash
flutter pub get
flutter analyze
```

预期：`flutter analyze` 无 error（默认模板可能有 info 级提示，可接受；有 error 必须先解决）。

- [ ] **Step 5: 提交**

```bash
cd /Users/yabo/wwwroot/oak-app
cat > .gitignore <<'EOF'
.dart_tool/
.packages
build/
.flutter-plugins
.flutter-plugins-dependencies
*.iml
.idea/
.DS_Store
ios/Pods/
macos/Pods/
EOF
git add -A
git commit -m "chore: Flutter 工程骨架与依赖"
```

注意：**不要**把 `*.freezed.dart` / `*.g.dart` 加进 `.gitignore`（见 Global Constraints）。

---

### Task 2: baseUrl 与 macOS 网络权限

**Files:**
- Create: `lib/config.dart`
- Modify: `macos/Runner/DebugProfile.entitlements`
- Modify: `macos/Runner/Release.entitlements`

**Interfaces:**
- Consumes: 无
- Produces: `String get oakBaseUrl`（全局可用的 baseUrl）

- [ ] **Step 1: 写 config.dart**

```dart
/// oak 服务端地址：编译期注入，缺省连本机 dev server。
/// 用法：flutter run -d macos --dart-define=OAK_BASE_URL=http://192.168.1.10:3000
const String oakBaseUrl = String.fromEnvironment(
  'OAK_BASE_URL',
  defaultValue: 'http://127.0.0.1:3000',
);

/// 把接口返回的相对路径（/uploads/xxx）拼成完整 URL
String oakAssetUrl(String path) =>
    path.startsWith('http') ? path : '$oakBaseUrl$path';
```

- [ ] **Step 2: 给 macOS 沙盒加出网权限**

两个 entitlements 文件里都加上（`<dict>` 内）：

```xml
	<key>com.apple.security.network.client</key>
	<true/>
```

不加会在 macOS 上发请求时报 `SocketException: Operation not permitted`。

- [ ] **Step 3: 验证配置被读入**

```bash
flutter analyze lib/config.dart
```

预期：无 error。

- [ ] **Step 4: 提交**

```bash
git add lib/config.dart macos/Runner/DebugProfile.entitlements macos/Runner/Release.entitlements
git commit -m "feat(config): baseUrl 注入与 macOS 出网权限"
```

---

### Task 3: freezed 数据模型

**Files:**
- Create: `lib/models/child.dart`、`todo.dart`、`todo_step.dart`、`notice.dart`、`quick_note.dart`、`home_summary.dart`
- Test: `test/home_summary_test.dart`

**Interfaces:**
- Consumes: 无
- Produces: `HomeSummary.fromJson(Map<String, dynamic>)`，字段与 `/api/app/home` 响应一一对应。

- [ ] **Step 1: 先写失败测试**

`test/home_summary_test.dart`：

```dart
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:oak_app/models/home_summary.dart';

const _raw = '''
{
  "children": [{"id": 1, "name": "小明", "nickname": "", "birthday": "2018-05-01", "photo": ""}],
  "todos": [{"id": 2, "title": "买牛奶", "done": 0, "dueDate": "2026-09-09", "remindAt": "",
             "priority": 1, "myDayDate": "", "steps": [{"id": 3, "todoId": 2, "title": "比价", "done": 0, "sort": 0}]}],
  "notices": [{"id": 4, "content": "疫苗提醒", "createdAt": "2026-09-08T01:00:00.000Z"}],
  "notes": [{"id": 5, "content": "今天打疫苗", "status": "processed", "photos": [], "result": {"summary": "已记入健康"}, "createdAt": "2026-09-08T02:00:00.000Z"}],
  "activity": {"days": [{"date": "2026-09-08", "count": 3}]}
}
''';

void main() {
  test('HomeSummary.fromJson 映射 oak 的 camelCase 响应', () {
    final home = HomeSummary.fromJson(jsonDecode(_raw) as Map<String, dynamic>);

    expect(home.children.single.name, '小明');
    expect(home.todos.single.title, '买牛奶');
    expect(home.todos.single.priority, 1);
    expect(home.todos.single.steps.single.title, '比价');
    expect(home.notices.single.content, '疫苗提醒');
    expect(home.notes.single.status, 'processed');
    expect(home.activity.days.single.count, 3);
  });

  test('缺失字段用默认值兜底', () {
    final home = HomeSummary.fromJson(const {});
    expect(home.children, isEmpty);
    expect(home.todos, isEmpty);
    expect(home.activity.days, isEmpty);
  });
}
```

- [ ] **Step 2: 运行确认失败**

```bash
flutter test test/home_summary_test.dart
```

预期：编译失败（`home_summary.dart` 不存在）。

- [ ] **Step 3: 写模型（freezed 3.x 语法）**

`lib/models/child.dart`：

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'child.freezed.dart';
part 'child.g.dart';

@freezed
abstract class Child with _$Child {
  const factory Child({
    required int id,
    @Default('') String name,
    @Default('') String nickname,
    @Default('') String birthday,
    @Default('') String photo,
  }) = _Child;

  factory Child.fromJson(Map<String, dynamic> json) => _$ChildFromJson(json);
}
```

`lib/models/todo_step.dart`、`notice.dart`、`quick_note.dart` 同构（字段按 `/api/app/home` 响应）：

```dart
// todo_step.dart
@freezed
abstract class TodoStep with _$TodoStep {
  const factory TodoStep({
    required int id,
    required int todoId,
    @Default('') String title,
    @Default(0) int done,
    @Default(0) int sort,
  }) = _TodoStep;
  factory TodoStep.fromJson(Map<String, dynamic> json) => _$TodoStepFromJson(json);
}
```

```dart
// todo.dart
@freezed
abstract class Todo with _$Todo {
  const factory Todo({
    required int id,
    @Default('') String title,
    @Default(0) int done,
    @Default('') String dueDate,
    @Default('') String remindAt,
    @Default(0) int priority,
    @Default('') String myDayDate,
    @Default(<TodoStep>[]) List<TodoStep> steps,
  }) = _Todo;
  factory Todo.fromJson(Map<String, dynamic> json) => _$TodoFromJson(json);
}
```

```dart
// notice.dart
@freezed
abstract class Notice with _$Notice {
  const factory Notice({
    required int id,
    @Default('') String content,
    @Default('') String createdAt,
  }) = _Notice;
  factory Notice.fromJson(Map<String, dynamic> json) => _$NoticeFromJson(json);
}
```

```dart
// quick_note.dart
@freezed
abstract class QuickNote with _$QuickNote {
  const factory QuickNote({
    required int id,
    @Default('') String content,
    @Default('pending') String status,
    @Default(<String>[]) List<String> photos,
    @Default(<String, dynamic>{}) Map<String, dynamic> result,
    @Default('') String createdAt,
  }) = _QuickNote;
  factory QuickNote.fromJson(Map<String, dynamic> json) => _$QuickNoteFromJson(json);
}
```

```dart
// home_summary.dart
import 'package:freezed_annotation/freezed_annotation.dart';
import 'child.dart';
import 'notice.dart';
import 'quick_note.dart';
import 'todo.dart';

part 'home_summary.freezed.dart';
part 'home_summary.g.dart';

@freezed
abstract class ActivityDay with _$ActivityDay {
  const factory ActivityDay({required String date, @Default(0) int count}) = _ActivityDay;
  factory ActivityDay.fromJson(Map<String, dynamic> json) => _$ActivityDayFromJson(json);
}

@freezed
abstract class Activity with _$Activity {
  const factory Activity({@Default(<ActivityDay>[]) List<ActivityDay> days}) = _Activity;
  factory Activity.fromJson(Map<String, dynamic> json) => _$ActivityFromJson(json);
}

@freezed
abstract class HomeSummary with _$HomeSummary {
  const factory HomeSummary({
    @Default(<Child>[]) List<Child> children,
    @Default(<Todo>[]) List<Todo> todos,
    @Default(<Notice>[]) List<Notice> notices,
    @Default(<QuickNote>[]) List<QuickNote> notes,
    @Default(Activity()) Activity activity,
  }) = _HomeSummary;

  factory HomeSummary.fromJson(Map<String, dynamic> json) => _$HomeSummaryFromJson(json);
}
```

- [ ] **Step 4: 生成代码并跑测试**

```bash
dart run build_runner build --delete-conflicting-outputs
flutter test test/home_summary_test.dart
```

预期：生成 `*.freezed.dart` / `*.g.dart`；两个测试 **PASS**。

- [ ] **Step 5: 提交**

```bash
git add lib/models test/home_summary_test.dart
git commit -m "feat(models): freezed 模型与 home 响应映射"
```

---

### Task 4: Dio 客户端与 token 存储

**Files:**
- Create: `lib/api/client.dart`、`lib/api/auth.dart`

**Interfaces:**
- Consumes: `oakBaseUrl`（Task 2）
- Produces:
  - `class ApiException implements Exception { final int statusCode; final String message; }`
  - `Dio buildDio({required Future<String?> Function() readToken, required Future<void> Function() onUnauthorized})`
  - `class AuthService { Future<bool> login(String username, String password); Future<void> logout(); Future<bool> hasToken(); }`

- [ ] **Step 1: 写 client.dart**

```dart
import 'package:dio/dio.dart';
import '../config.dart';

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;
  @override
  String toString() => message;
}

/// 统一构造 Dio：注入 Bearer、401 交给调用方处理、错误转 ApiException
Dio buildDio({
  required Future<String?> Function() readToken,
  required Future<void> Function() onUnauthorized,
}) {
  final dio = Dio(BaseOptions(
    baseUrl: oakBaseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 30),
    headers: {'Content-Type': 'application/json'},
  ));

  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      final token = await readToken();
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
      handler.next(options);
    },
    onError: (e, handler) async {
      if (e.response?.statusCode == 401) {
        await onUnauthorized();
      }
      final data = e.response?.data;
      final msg = data is Map && data['error'] is String
          ? data['error'] as String
          : '请求失败（${e.response?.statusCode ?? '网络错误'}）';
      handler.reject(DioException(
        requestOptions: e.requestOptions,
        response: e.response,
        type: e.type,
        error: ApiException(e.response?.statusCode ?? 0, msg),
      ));
    },
  ));
  return dio;
}
```

- [ ] **Step 2: 写 auth.dart**

```dart
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _tokenKey = 'oak_token';

/// token 存取 + 登录/登出。token 存系统钥匙串（Keychain / Keystore）。
class AuthService {
  AuthService(this._dio, this._storage);
  final Dio _dio;
  final FlutterSecureStorage _storage;

  Future<String?> readToken() => _storage.read(key: _tokenKey);
  Future<bool> hasToken() async => (await readToken())?.isNotEmpty ?? false;
  Future<void> logout() => _storage.delete(key: _tokenKey);

  /// 成功返回 true；失败抛 ApiException（消息可直接展示）
  Future<bool> login(String username, String password) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/api/auth/app-login',
      data: {'username': username, 'password': password},
    );
    final token = res.data?['token'];
    if (token is! String || token.isEmpty) {
      throw ApiException(0, '登录响应缺少 token');
    }
    await _storage.write(key: _tokenKey, value: token);
    return true;
  }
}
```

- [ ] **Step 3: 验证编译**

```bash
flutter analyze lib/api
```

预期：无 error。

- [ ] **Step 4: 提交**

```bash
git add lib/api
git commit -m "feat(api): Dio 客户端与 token 存储"
```

---

### Task 5: 首页接口、路由与登录态守卫

**Files:**
- Create: `lib/api/home_api.dart`、`lib/router.dart`
- Modify: `lib/main.dart`
- Delete: `test/widget_test.dart`（模板自带的计数器测试，会失败）

**Interfaces:**
- Consumes: `buildDio`、`AuthService`、`HomeSummary`、`oakBaseUrl`
- Produces:
  - `Future<HomeSummary> fetchHome(Dio dio)`
  - Riverpod provider：`dioProvider`、`authProvider`
  - go_router 实例：`/login`、`/home`，未登录重定向到 `/login`

- [ ] **Step 1: 写 home_api.dart**

```dart
import 'package:dio/dio.dart';
import '../models/home_summary.dart';

Future<HomeSummary> fetchHome(Dio dio) async {
  final res = await dio.get<Map<String, dynamic>>('/api/app/home');
  return HomeSummary.fromJson(res.data ?? const {});
}
```

- [ ] **Step 2: 写 main.dart 与 router.dart**

`lib/main.dart`：

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'router.dart';

void main() {
  runApp(const ProviderScope(child: OakApp()));
}

class OakApp extends ConsumerWidget {
  const OakApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: '我记',
      theme: ThemeData(colorSchemeSeed: Colors.teal, useMaterial3: true),
      routerConfig: router,
    );
  }
}
```

`lib/router.dart`（登录态由 `authStateProvider` 决定，未登录跳 `/login`）：

```dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'api/auth.dart';
import 'api/client.dart';
import 'pages/home/home_page.dart';
import 'pages/login/login_page.dart';

final storageProvider = Provider((ref) => const FlutterSecureStorage());

final authProvider = Provider<AuthService>((ref) {
  return AuthService(ref.watch(dioProvider), ref.watch(storageProvider));
});

final dioProvider = Provider<Dio>((ref) {
  final auth = ref.watch(authProvider);
  return buildDio(readToken: auth.readToken, onUnauthorized: auth.logout);
});

/// 启动时读一次 token，决定初始路由
final loggedInProvider = FutureProvider<bool>((ref) => ref.watch(authProvider).hasToken());

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/home',
    redirect: (context, state) {
      final loggedIn = ref.read(loggedInProvider).valueOrNull ?? false;
      final atLogin = state.matchedLocation == '/login';
      if (!loggedIn && !atLogin) return '/login';
      if (loggedIn && atLogin) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
      GoRoute(path: '/home', builder: (_, __) => const HomePage()),
    ],
  );
});
```

> 注意 provider 的循环依赖：`authProvider` 依赖 `dioProvider`，而 `dioProvider` 又依赖 `authProvider`。把 `dioProvider` 改为在回调里惰性取 auth（`readToken: () => ref.read(authProvider).readToken()`）即可打破循环——实现时按这个写法调整，并在 Step 3 用 `flutter analyze` 确认没有循环告警。

- [ ] **Step 3: 验证编译**

```bash
rm -f test/widget_test.dart
flutter analyze
```

预期：无 error。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(app): 路由、登录态守卫与首页接口"
```

---

### Task 6: 登录页

**Files:**
- Create: `lib/pages/login/login_page.dart`

**Interfaces:**
- Consumes: `authProvider`、`loggedInProvider`
- Produces: 登录成功写入 token 并跳 `/home`。

- [ ] **Step 1: 写登录页**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../router.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});
  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _user = TextEditingController();
  final _pass = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _user.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider).login(_user.text.trim(), _pass.text);
      ref.invalidate(loggedInProvider);
      if (mounted) context.go('/home');
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('我记', style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 24),
                TextField(
                  controller: _user,
                  decoration: const InputDecoration(labelText: '用户名'),
                  autofillHints: const [AutofillHints.username],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _pass,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: '密码'),
                  onSubmitted: (_) => _submit(),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _busy ? null : _submit,
                    child: _busy
                        ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('登录'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: 验证编译**

```bash
flutter analyze lib/pages/login
```

预期：无 error。

- [ ] **Step 3: 提交**

```bash
git add lib/pages/login
git commit -m "feat(login): 登录页"
```

---

### Task 7: 概览页

**Files:**
- Create: `lib/pages/home/home_page.dart`

**Interfaces:**
- Consumes: `dioProvider`、`fetchHome`、`HomeSummary`
- Produces: 概览页展示待办、通知、最近快记、近 7 天活动。

- [ ] **Step 1: 写概览页**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/home_api.dart';
import '../../models/home_summary.dart';
import '../../router.dart';

final homeProvider = FutureProvider<HomeSummary>((ref) => fetchHome(ref.watch(dioProvider)));

class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(homeProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('我记'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(homeProvider),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('加载失败：$e', textAlign: TextAlign.center),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => ref.invalidate(homeProvider),
                  child: const Text('重试'),
                ),
              ],
            ),
          ),
        ),
        data: (home) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(homeProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _section(context, '待办（${home.todos.length}）',
                  home.todos.map((t) => '• ${t.title}${t.dueDate.isEmpty ? '' : '  ·  ${t.dueDate}'}').toList(),
                  empty: '今天没有待办'),
              _section(context, '通知（${home.notices.length}）',
                  home.notices.map((n) => '• ${n.content}').toList(),
                  empty: '没有未读通知'),
              _section(context, '最近的快记',
                  home.notes.map((n) => '• ${n.content}').toList(),
                  empty: '还没有快记'),
              _section(context, '近 7 天活动',
                  home.activity.days.map((d) => '${d.date}   ${'▮' * d.count} ${d.count}').toList(),
                  empty: '最近 7 天没有记录'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _section(BuildContext context, String title, List<String> lines,
      {required String empty}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (lines.isEmpty)
              Text(empty, style: Theme.of(context).textTheme.bodySmall)
            else
              ...lines.map((l) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Text(l),
                  )),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: 验证编译**

```bash
flutter analyze
```

预期：无 error。

- [ ] **Step 3: 提交**

```bash
git add lib/pages/home
git commit -m "feat(home): 概览页"
```

---

### Task 8: 端到端联调

**Files:**
- 无代码改动（除非联调暴露问题）

**Interfaces:**
- Consumes: 全部前置任务 + oak dev server
- Produces: 真实登录 + 概览数据可见。

- [ ] **Step 1: 起 oak dev server**

```bash
cd /Users/yabo/wwwroot/oak
npm run dev
```

预期：`Ready`，`curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/auth/me` 返回 401。

- [ ] **Step 2: 用最小权限账号验证接口可达**

```bash
curl -s -X POST http://127.0.0.1:3000/api/auth/app-login \
  -H 'Content-Type: application/json' \
  -d '{"username":"app","password":"<本机 dev 库的 app 账号密码>"}' | head -c 120
```

预期：返回 `{"token":"...","user":{...}}`。若账号不存在，改用 `admin` / `admin123` 先跑通链路。

- [ ] **Step 3: 跑 macOS 桌面端**

```bash
cd /Users/yabo/wwwroot/oak-app
flutter run -d macos --dart-define=OAK_BASE_URL=http://127.0.0.1:3000
```

预期：应用启动 → 未登录跳登录页 → 输入账号密码 → 进入概览页，看到待办/通知/快记/活动四个区块。若报 `SocketException: Operation not permitted`，回到 Task 2 Step 2 检查 entitlements。

- [ ] **Step 4: 验证 401 自动回登录页**

在概览页把 token 手动失效（改本机 dev 库或换个错误 token 后重启应用），确认 401 时自动跳回登录页而不是卡在错误态。

- [ ] **Step 5: 提交（如有改动）**

```bash
git add -A
git commit -m "fix: 联调修正"
```

---

## 完成标准

- [ ] `flutter analyze` 零 error。
- [ ] `flutter test` 全绿（含 `home_summary_test.dart`）。
- [ ] macOS 桌面端能用最小权限账号登录，概览页显示四个区块的真实数据。
- [ ] 生成文件 `*.freezed.dart` / `*.g.dart` 已入库。
- [ ] 客户端仓库首次提交完成（是否推送到 GitHub 由用户决定）。
