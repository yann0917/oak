# 🌱 成长足迹 — 儿童成长教育记录系统

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

1. 服务器需 Node.js 20.9+（Next.js 16 要求）
2. 上传项目目录（不含 `node_modules`），执行 `npm install && npm run build`
3. 启动（任选其一）：
   ```bash
   npm start                          # 前台
   pm2 start npm --name edu -- start  # pm2 守护
   ```
4. 如需修改端口：`PORT=8080 npm start`
5. 建议配置 Nginx 反向代理，并启用 HTTPS（系统含登录认证，公网务必走 HTTPS）

## 数据备份

所有数据都在两个位置，复制即可备份：

- `data/edu.db` — SQLite 数据库（全部记录）
- `uploads/` — 上传的照片与附件

> ⚠️ 数据库开启了 WAL 模式，最近的写入会暂存在 `data/edu.db-wal` 中。备份时建议把 `edu.db`、`edu.db-wal`、`edu.db-shm` 三个文件一起复制（或先停服务再只复制 `edu.db`），否则可能丢失最近提交。

定时备份示例（crontab，每天凌晨 3 点）：

```
0 3 * * * cp /path/to/edu/data/edu.db* /backup/ && cp -r /path/to/edu/uploads /backup/uploads-$(date +\%F)
```

## 技术栈

Next.js 16 (App Router + Turbopack) + React 19 + TypeScript + Tailwind CSS + Drizzle ORM + better-sqlite3 + Recharts

## License

本项目采用 [PolyForm Noncommercial 1.0.0](./LICENSE) 授权——仅供个人学习与 non-commercial（非商业）用途使用、修改和分享，商用需另行获得授权（见 LICENSE 中的 Required Notice）。

UI 基于 [animal-island-ui](https://github.com/guokaigdg/animal-island-ui)（CC BY-NC 4.0），同样仅限非商业用途，特此说明与致谢。
