# 🌳 Oak — 儿童成长教育记录系统

记录孩子的成长、教育与学习点滴。支持多个孩子档案，覆盖幼儿园到大学等各学习阶段。

## 功能模块

- **概览仪表盘**：孩子档案卡、最新身高体重、现就读阶段、各模块统计
- **子女管理**：多孩子档案（照片、学籍号、生日、自动计算年龄），顶部可切换当前孩子
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
- **提醒中心**：疫苗、视力检查、缴费截止、家长会等定时提醒；一次性/每天/每周/每月/Cron 五种周期 + 提前 N 天预告；WxPusher/Server酱/邮件(Resend)/站内通知多渠道推送，静默期顺延、节流、失败重试与兜底渠道，发送日志可查
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
