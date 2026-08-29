/** @type {import('next').NextConfig} */
const nextConfig = {
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
