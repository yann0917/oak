/** @type {import('next').NextConfig} */
const nextConfig = {
  // dev 模式允许 127.0.0.1 访问（Next 16 默认只放行 localhost，其余 host 的 _next/static 会 403）
  allowedDevOrigins: ["127.0.0.1"],
  // 服务器部署不再 npm install：构建产出 .next/standalone（含按需裁剪的 node_modules），
  // 连同 .next/static 与 public 打包上传，服务器上 node server.js 直接运行
  output: "standalone",
  // Next.js 15 起由 experimental.serverComponentsExternalPackages 更名而来
  serverExternalPackages: ["better-sqlite3", "ws", "exceljs", "adm-zip"],
  async redirects() {
    return [
      // 学期/老师并入教育经历、兴趣班并入学习情况的 Tab 后，兼容旧地址
      { source: "/semesters", destination: "/education?tab=semesters", permanent: false },
      { source: "/teachers", destination: "/education?tab=teachers", permanent: false },
      { source: "/activities", destination: "/learning?tab=activities", permanent: false },
    ];
  },
};

export default nextConfig;
