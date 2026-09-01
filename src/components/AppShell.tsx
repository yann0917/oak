"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Cursor, Footer, Icon, Select, Title } from "animal-island-ui";
import type { IconName } from "animal-island-ui";
import { useChildren } from "@/lib/childContext";
import { useProfile, type ProfileMenu } from "@/lib/profileContext";
import { api, calcAge } from "@/lib/api";
import { NotificationBell } from "./NotificationBell";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { children: kids, currentChild, setCurrentChildId, loading } = useChildren();
  const { menus } = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  // 折叠的分组菜单 id 集合（未记录 = 展开；点击分组标题切换）
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  useEffect(() => {
    api("/api/auth/me").catch(() => {
      router.push("/login");
    });
  }, [router]);

  const toggleGroup = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const renderNav = (nodes: ProfileMenu[], onNavigate?: () => void, depth = 0) => {
    if (!nodes.length) return null;
    return (
      <div className={`${depth === 0 ? "space-y-1.5" : "space-y-1.5 mt-1.5"}`}>
        {nodes.map((item) => {
          if (item.type === "dir") {
            // 目录：仅含按钮（权限点）时跳过，避免出现空分组标题
            if (!(item.children ?? []).some((c) => c.type !== "button")) return null;
            const isCollapsed = collapsed.has(item.id);
            return (
              <div key={item.id} className={depth === 0 ? "pt-3" : ""}>
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-2xl text-xs font-bold border-0 cursor-pointer"
                  style={{ color: "var(--animal-text-color-secondary)", background: "transparent" }}
                  onClick={() => toggleGroup(item.id)}
                  aria-expanded={!isCollapsed}
                >
                  <span>{item.name}</span>
                  <span className="text-[10px] leading-none">{isCollapsed ? "▸" : "▾"}</span>
                </button>
                {!isCollapsed && renderNav(item.children ?? [], onNavigate, depth + 1)}
              </div>
            );
          }
          const active =
            pathname === item.path || (item.path !== "/" && pathname.startsWith(item.path + "/"));
          return (
            <Link
              key={item.id}
              href={item.path}
              onClick={onNavigate}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                depth > 0 ? "ml-2" : ""
              }`}
              style={
                active
                  ? {
                      background: "var(--animal-primary-color-bg)",
                      color: "var(--animal-primary-color)",
                    }
                  : { color: "var(--animal-text-color-secondary)" }
              }
            >
              <Icon name={(item.icon || "icon-miles") as IconName} size={20} />
              {item.name}
            </Link>
          );
        })}
      </div>
    );
  };

  const renderMobileGrid = (nodes: ProfileMenu[], depth = 0): React.ReactNode[] =>
    nodes.flatMap((item) => {
      if (item.type === "dir") {
        return [
          <div
            key={`dir-${item.id}`}
            className="col-span-3 text-xs font-bold px-1 pt-2 first:pt-0"
            style={{ color: "var(--animal-text-color-secondary)" }}
          >
            {item.name}
          </div>,
          ...renderMobileGrid(item.children ?? [], depth + 1),
        ];
      }
      const active =
        pathname === item.path || (item.path !== "/" && pathname.startsWith(item.path + "/"));
      return [
        <Link
          key={item.id}
          href={item.path}
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
          <Icon name={(item.icon || "icon-miles") as IconName} size={22} />
          {item.name}
        </Link>,
      ];
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
          <nav className="flex-1 px-3 space-y-1.5 overflow-y-auto">{renderNav(menus)}</nav>
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
                <NotificationBell />
                {currentChild && (
                  <>
                    <span
                      className="text-sm hidden sm:inline"
                      style={{ color: "var(--animal-text-color-secondary)" }}
                    >
                      当前成员
                    </span>
                    <div className="w-56">
                      <Select
                        value={String(currentChild.id)}
                        onChange={(key) => setCurrentChildId(Number(key))}
                        options={kids.map((c) => ({
                          key: String(c.id),
                          label: c.birthday ? `${c.name}（${calcAge(c.birthday)}）` : c.name,
                        }))}
                        aria-label="切换成员"
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
                {renderMobileGrid(menus)}
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
