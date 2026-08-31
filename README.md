# 🌳 Oak — 我记

记录与我有关的一切：孩子的成长教育、家人的健康用药、生活中的点滴琐事。支持多个成员档案，随时随地随手记。

## Oak 是什么

Oak，英文意为橡树——一颗橡果落进土里，先扎根，再发芽，历经数年长成荫蔽大树。项目取名 Oak，正是这个隐喻：**每一句快记、每一张凭证照片，都是埋下的橡果；整理、沉淀与思考，让它发芽；最终长成全家人的知识之树。** Oak 的中文名是「我记」——记录与我有关的一切：它不是单纯的"孩子成长记录工具"，而是全家人的账单、健康、证件、提醒与方法沉淀。

我们的信念很简单：**凡事有记录**。记录的门槛越低，越容易坚持；而坚持的记录，终将复利。

## 理念：DIKW 模型

DIKW（Data-Information-Knowledge-Wisdom）是信息管理学的基石模型，也是 Oak 整个产品结构的设计蓝图——底层无压力地收集数据，上层层层提炼，直到内化为决策智慧。

| 层级 | 含义 | 在 Oak 中的落地 |
| --- | --- | --- |
| **数据** Data | 零碎、无序的原始发生 | 「一句话快记」：写一句、传张图，先忠实入库，不做任何负担 |
| **信息** Information | 有标签、有前因后果的记录 | AI 识图归类：自动拆解为健康/账单/成长/时光/卡证/提醒/政策等结构化记录 |
| **知识** Knowledge | 连续记录背后的规律与 SOP | 周期复盘与家庭洞察（路线图中）：如"夏季空调费是大头"，沉淀为家庭经验 |
| **智慧** Wisdom | 内化为直觉与决策力 | 主动决策副驾驶（愿景中）：结合政策与成长节点，在你需要之前给出行动建议 |

对应到系统里：`quick_notes`（原始流水）是数据层，各业务模块（账单、卡证档案、健康档案……）是信息层；当数据积累到一定量，系统将帮你把信息升华为知识和智慧。

## 功能模块

- **概览仪表盘**：孩子档案卡、最新身高体重、一句话快记入口与最近的记录
- **成员管理**：多成员档案（照片、学籍号、生日、自动计算年龄），顶部可切换当前成员
- **教育经历**：学校管理 + 入学/阶段记录（幼儿园/小学/初中/高中/大学/培训机构），在读状态与时间线
- **课程表**：按学期维护每周课程与节次顺序
- **老师**：老师信息维护，并可关联到孩子（哪个阶段是谁的老师）
- **学习情况**：按学期/科目记录成绩、评级与老师评语
- **成长记录**：身高体重记录 + 成长曲线图
- **儿童生长标准测评**：按 WS/T 423—2022（0~7 岁百分位）与 WS/T 612—2018（7~18 岁身高等级）自动计算测量时月龄、在国标参考图上定位高亮并输出五级评价，支持一键保存整页合图。
- **健康档案**：体检、疫苗、用药、病历，支持附件照片
- **兴趣班/特长**：机构、老师、进度与成果
- **时光相册**：照片 + 标签 + 文字的成长瞬间时间线
- **账单**：按学期/日期记录学费、餐费、医疗、购物、水电等收支（方向+类型+状态），凭证照片
- **卡证档案**：集中保管证件、证明、病历、检测单/检测报告、协议证书等原件照片与关键信息（证号、签发/到期日期），到期自动高亮
- **一句话快记**：首页快记入口，一句话 + 可附照片，由大模型识图归类并写入健康/账单/成长/时光/卡证/提醒/待办等模块（大模型可选，设置页配置 OpenAI 兼容接口）；未配置或识别失败时保留为原始流水（DIKW 数据层）
- **提醒中心**：疫苗、视力检查、缴费截止、家长会等定时提醒；一次性/每天/每周/每月/Cron 五种周期 + 提前 N 天预告；WxPusher/Server酱/邮件(Resend)/站内通知多渠道推送，静默期顺延、节流、失败重试与兜底渠道，发送日志可查
- **权限与系统管理**：多账号登录（仅 admin 在后台添加用户，不开放注册）+ RBAC 角色权限（Casbin，策略直接读业务表）；侧边栏按角色动态渲染菜单树（支持目录/菜单/按钮三级）；**接口权限自动扫描**：构建时扫描 `src/app/api` 全部路由生成权限点（`api:*`，构建脚本自动重新生成），角色分配时在权限树中勾选菜单/目录/接口按钮即生效（勾父级自动展开子孙）；超管通过 `users.is_admin` 短路放行；所有业务表按 `user_id` 归属隔离；middleware 拦截未登录访问
- **政策动态**：招生入学、升学政策等摘要与原文链接

## 本地运行

```bash
npm install
npm run build
npm start        # 访问 http://localhost:3000
```

开发模式：`npm run dev`

**默认账号**：`admin` / `admin123`（首次启动自动创建，登录后建议在数据库中修改密码）

**环境要求**：Node.js 20.9+（Next.js 16 要求）

## 部署到服务器

GitHub Actions 只负责构建（`.github/workflows/build.yml`）：推送 `main` 分支后自动产出 **standalone 独立部署包**（自带按需裁剪的 node_modules，压缩包约 65MB），在 Actions 页面对应 run 的 Artifacts 里下载 `oak-dist`（或 `gh run download -n oak-dist`），scp 到服务器解压运行。**服务器上不执行 npm install。**

> **服务器系统要求：Ubuntu 22.04+ / Debian 12+**。better-sqlite3 的预编译模块需要 glibc ≥ 2.34（Ubuntu 20.04 的 2.31、CentOS 7 的 2.17 都不满足），Node 22 官方包也要求 glibc ≥ 2.28。服务器另需 Node.js 20.9+ 与 pm2。

### 手动部署步骤

应用目录是「单目录覆盖式」升级：`data/`、`uploads/` 放在应用目录内，每次解压只覆盖程序文件，数据天然保留，无需软链接。

```bash
# 首次部署
sudo mkdir -p /opt/oak && cd /opt/oak
# 把 oak-dist.tar.gz 传到 /opt/oak 后：
tar -xzf oak-dist.tar.gz     # 解压出 server.js、node_modules、.next、public
pm2 start node --name oak -- server.js

# 以后每次更新：新的 oak-dist.tar.gz 传到 /opt/oak 后
cd /opt/oak && tar -xzf oak-dist.tar.gz && pm2 restart oak
```

- `data/`、`uploads/` 由应用自动创建；改端口用 `PORT=8080 pm2 start node --name oak -- server.js`
- 回滚：每次的 `oak-dist.tar.gz` 就是版本备份，解压旧包 + `pm2 restart oak` 即可
- 公网部署建议 Nginx 反向代理并启用 HTTPS（系统含登录认证，务必走 HTTPS）
- 数据库结构与默认账号在应用启动时自动幂等迁移，更新不会影响已有数据

本地手动构建同样可行：`npm run build` 后把 `.next/standalone` 里的内容补上 `public` 与 `.next/static`（见 workflow 的「组装部署包」步骤）打 tar 即可。

## 数据备份

所有数据都在两个位置，复制即可备份：

- 本地开发：`data/`（SQLite 数据库）+ `uploads/`（上传的照片与附件）
- 服务器部署：`/opt/oak/data/` + `/opt/oak/uploads/`

> ⚠️ 数据库开启了 WAL 模式，最近的写入会暂存在 `oak.db-wal` 中。备份时建议把 `oak.db`、`oak.db-wal`、`oak.db-shm` 三个文件一起复制（或先停服务再只复制 `oak.db`），否则可能丢失最近提交。

定时备份示例（crontab，每天凌晨 3 点，服务器上）：

```
0 3 * * * cp /opt/oak/var/data/oak.db* /backup/ && cp -r /opt/oak/var/uploads /backup/uploads-$(date +\%F)
```

## 技术栈

Next.js 16 (App Router + Turbopack) + React 19 + TypeScript + Tailwind CSS + Drizzle ORM + better-sqlite3 + Recharts

## License

本项目采用 [PolyForm Noncommercial 1.0.0](./LICENSE) 授权——仅供个人学习与 non-commercial（非商业）用途使用、修改和分享，商用需另行获得授权（见 LICENSE 中的 Required Notice）。

UI 基于 [animal-island-ui](https://github.com/guokaigdg/animal-island-ui)（CC BY-NC 4.0），同样仅限非商业用途，特此说明与致谢。
