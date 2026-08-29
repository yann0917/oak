/** @type {import('next').NextConfig} */
const nextConfig = {
  // 服务器部署不再 npm install：构建产出 .next/standalone（含按需裁剪的 node_modules），
  // 连同 .next/static 与 public 打包上传，服务器上 node server.js 直接运行
  output: "standalone",
  // Next.js 15 起由 experimental.serverComponentsExternalPackages 更名而来
  serverExternalPackages: ["better-sqlite3"],
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
