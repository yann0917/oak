"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Cursor, Footer, Icon, Select, Title } from "animal-island-ui";
import type { IconName } from "animal-island-ui";
import { useChildren } from "@/lib/childContext";
import { api, calcAge } from "@/lib/api";
import { WeatherBadge } from "./WeatherBadge";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "概览", icon: "icon-map" },
  { href: "/education", label: "教育经历", icon: "icon-critterpedia" },
  { href: "/timetable", label: "课程表", icon: "icon-design" },
  { href: "/learning", label: "学习情况", icon: "icon-diy" },
  { href: "/garden", label: "学习园地", icon: "icon-miles" },
  { href: "/growth", label: "成长记录", icon: "icon-miles" },
  { href: "/health", label: "健康档案", icon: "icon-variant" },
  { href: "/moments", label: "时光相册", icon: "icon-camera" },
  { href: "/fees", label: "学费记录", icon: "icon-shopping" },
  { href: "/policies", label: "政策动态", icon: "icon-chat" },
  { href: "/children", label: "孩子管理", icon: "icon-miles" },
  { href: "/settings", label: "设置", icon: "icon-helicopter" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { children: kids, currentChild, setCurrentChildId, loading } = useChildren();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api("/api/auth/me").catch(() => {});
  }, []);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const navLinks = (onNavigate?: () => void) =>
    NAV.map((item) => {
      const active = pathname === item.href;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all"
          style={
            active
              ? {
                  background: "var(--animal-primary-color-bg)",
                  color: "var(--animal-primary-color)",
                }
              : { color: "var(--animal-text-color-secondary)" }
          }
        >
          <Icon name={item.icon} size={20} />
          {item.label}
        </Link>
      );
    });

  return (
    <Cursor>
      <div className="min-h-screen flex">
        {/* 桌面侧边栏 */}
        <aside
          className="hidden md:flex flex-col w-60 fixed inset-y-0 border-r"
          style={{
            background: "var(--animal-bg-color)",
            borderColor: "var(--animal-border-color-light)",
          }}
        >
          <div className="px-5 pt-6 pb-4 text-center">
            <Title size="small" color="app-teal">
              Oak
            </Title>
          </div>
          <nav className="flex-1 px-3 space-y-1.5 overflow-y-auto">{navLinks()}</nav>
          <div className="px-3 pb-4 flex justify-end">
            <Button size="small" type="text" onClick={logout}>
              退出
            </Button>
          </div>
        </aside>

        <div className="flex-1 md:ml-60 flex flex-col min-h-screen">
          {/* 顶部栏 */}
          <header
            className="sticky top-0 z-40 border-b"
            style={{
              background: "var(--animal-bg-color)",
              borderColor: "var(--animal-border-color-light)",
            }}
          >
            <div className="flex items-center gap-3 px-4 h-14">
              <button
                className="md:hidden text-2xl leading-none"
                style={{ color: "var(--animal-text-color-secondary)" }}
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="菜单"
              >
                ☰
              </button>
              <span className="md:hidden font-bold" style={{ color: "var(--animal-primary-color)" }}>
                Oak
              </span>
              <div className="ml-auto flex items-center gap-2">
                <WeatherBadge />
                {currentChild && (
                  <>
                    <span
                      className="text-sm hidden sm:inline"
                      style={{ color: "var(--animal-text-color-secondary)" }}
                    >
                      当前孩子
                    </span>
                    <div className="w-56">
                      <Select
                        value={String(currentChild.id)}
                        onChange={(key) => setCurrentChildId(Number(key))}
                        options={kids.map((c) => ({
                          key: String(c.id),
                          label: c.birthday ? `${c.name}（${calcAge(c.birthday)}）` : c.name,
                        }))}
                        aria-label="切换孩子"
                      />
                    </div>
                    <Button size="small" type="text" onClick={logout} className="md:hidden">
                      退出
                    </Button>
                  </>
                )}
              </div>
            </div>
            {/* 移动端抽屉导航 */}
            {menuOpen && (
              <nav
                className="md:hidden border-t px-3 py-3 grid grid-cols-3 gap-1.5"
                style={{
                  borderColor: "var(--animal-border-color-light)",
                  background: "var(--animal-bg-color)",
                }}
              >
                {NAV.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className="flex flex-col items-center gap-1 py-2.5 rounded-2xl text-xs font-semibold"
                      style={
                        active
                          ? {
                              background: "var(--animal-primary-color-bg)",
                              color: "var(--animal-primary-color)",
                            }
                          : { color: "var(--animal-text-color-secondary)" }
                      }
                    >
                      <Icon name={item.icon} size={22} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            )}
          </header>

          <main className="flex-1 p-4 sm:p-6 max-w-4xl w-full mx-auto">
            {loading ? (
              <div
                className="text-center py-20 text-sm"
                style={{ color: "var(--animal-text-color-secondary)" }}
              >
                加载中…
              </div>
            ) : (
              children
            )}
          </main>
          <Footer />
        </div>
      </div>
    </Cursor>
  );
}
