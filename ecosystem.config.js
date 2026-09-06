// pm2 进程配置：GitHub Actions 部署时复制进 standalone 包，随包落在 /opt/oak/。
// pm2-runtime 首次启动与部署后的 pm2 reload 共用这一份。
// 注意：oak 有常驻调度与 SQLite，必须 fork 单实例，不能 cluster。
// 改端口在 env 里加 PORT: 8080。
module.exports = {
  apps: [
    {
      name: 'oak',
      script: 'server.js',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production' },
    },
  ],
};
