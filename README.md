# 🌳 Oak — 儿童成长教育记录系统

记录孩子的成长、教育与学习点滴。支持多个孩子档案，覆盖幼儿园到大学等各学习阶段。

## 功能模块

- **概览仪表盘**：孩子档案卡、最新身高体重、现就读阶段、各模块统计
- **孩子管理**：多孩子档案（照片、学籍号、生日、自动计算年龄），顶部可切换当前孩子
- **教育经历**：学校管理 + 入学/阶段记录（幼儿园/小学/初中/高中/大学/培训机构），在读状态与时间线
- **课程表**：按学期维护每周课程与节次顺序
- **老师**：老师信息维护，并可关联到孩子（哪个阶段是谁的老师）
- **学习情况**：按学期/科目记录成绩、评级与老师评语
- **成长记录**：身高体重记录 + 成长曲线图
- **儿童生长标准测评**：按 WS/T 423—2022（0~7 岁百分位）与 WS/T 612—2018（7~18 岁身高等级）自动计算测量时月龄、在国标参考图上定位高亮并输出五级评价，支持一键保存整页合图。
- **健康档案**：体检、疫苗、用药、病历，支持附件照片
- **兴趣班/特长**：机构、老师、进度与成果
- **时光相册**：照片 + 标签 + 文字的成长瞬间时间线
- **学费记录**：按学期记录学费/餐费/兴趣班等支出，凭证照片
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

采用 GitHub Actions 自动构建部署（`.github/workflows/deploy.yml`）：推送 `main` 分支后 CI 自动 `npm run build` 产出 **standalone 独立运行包**（自带按需裁剪的 node_modules，压缩包约 65MB），上传服务器后 `node server.js` 直接运行，**服务器上不需要 npm install**。

### 1. 服务器准备（一次性）

- 安装 Node.js 20.9+ 与 pm2：`npm i -g pm2`
- 把部署机的 SSH 公钥加入服务器 `authorized_keys`
- 目录无需手动创建，首次部署自动生成，布局如下：

```
/opt/oak/                      # 默认部署目录，可用 secrets DEPLOY_DIR 覆盖
├── var/data/                  # SQLite 数据库（持久，跨版本保留）
├── var/uploads/               # 上传的照片（持久）
├── releases/<commit>/         # 每次部署的独立版本
└── current -> releases/xxx    # 当前版本符号链接
```

> standalone 的 server.js 启动时会 `chdir` 到自身所在目录，所以每个 release 里的 `data`、`uploads` 是指向 `var/` 的符号链接（部署脚本自动创建），数据不会随版本切换丢失。

### 2. GitHub 仓库配置 Secrets（Settings → Secrets and variables → Actions）

| Secret | 必填 | 说明 |
| --- | --- | --- |
| `SSH_HOST` | ✅ | 服务器 IP 或域名 |
| `SSH_USER` | ✅ | SSH 用户名 |
| `SSH_PRIVATE_KEY` | ✅ | SSH 私钥全文（`cat ~/.ssh/id_ed25519`） |
| `SSH_PORT` |  | SSH 端口，默认 22 |
| `DEPLOY_DIR` |  | 部署目录，默认 `/opt/oak` |
| `APP_PORT` |  | 应用端口，默认 3000（部署后健康检查用；改端口需同时给 pm2 传 `PORT`） |

### 3. 部署

推送代码到 `main` 分支即自动构建并部署，也可在 Actions 页面手动触发（workflow_dispatch）。部署脚本会做健康检查（`/login` 返回 200），自动保留最近 5 个版本并清理旧版本；构建产物同时作为 Artifact 保存 7 天，可手动下载。

> CI 构建机的 better-sqlite3 原生模块基于较新的 glibc，服务器建议 Ubuntu 20.04+ / Debian 11+ 或同等版本。数据库结构与默认账号在应用启动时自动幂等迁移，部署不会影响已有数据。

本地也可以手动构建：`npm run build` 后运行 `node .next/standalone/server.js`（同样需保证运行目录下有 `data`、`uploads`、`public`、`.next/static`）。

## 数据备份

所有数据都在两个位置，复制即可备份：

- 本地开发：`data/`（SQLite 数据库）+ `uploads/`（上传的照片与附件）
- 服务器部署：`/opt/oak/var/data/` + `/opt/oak/var/uploads/`

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
