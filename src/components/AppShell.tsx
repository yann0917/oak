"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Cursor, Footer, Icon, Title } from "animal-island-ui";
import type { IconName } from "animal-island-ui";
import { ChevronDown, ChevronUp, GamepadDirectional, Info, LogOut, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { useProfile, type ProfileMenu } from "@/lib/profileContext";
import { api } from "@/lib/api";
import { NotificationBell } from "./NotificationBell";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { menus, user, loading } = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  // 折叠的分组菜单 id 集合（未记录 = 展开；点击分组标题切换）
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  // 侧边栏整体折叠（仅显示菜单图标）：localStorage 持久化
  // 惰性初始化读取，避免在 effect 中同步 setState（SSR 期间默认展开）
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => typeof window !== "undefined" && localStorage.getItem("oak-sidebar-collapsed") === "1"
  );

  const toggleSidebar = () =>
    setSidebarCollapsed((c) => {
      localStorage.setItem("oak-sidebar-collapsed", c ? "0" : "1");
      return !c;
    });

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
            if (sidebarCollapsed) {
              // 图标模式下平铺展示子菜单图标（不再显示分组标题与折叠箭头）
              return <div key={item.id}>{renderNav(item.children ?? [], onNavigate, 0)}</div>;
            }
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
          if (sidebarCollapsed) {
            return (
              <Link
                key={item.id}
                href={item.path}
                onClick={onNavigate}
                title={item.name}
                aria-label={item.name}
                className="flex items-center justify-center px-0 py-2.5 rounded-2xl text-sm font-semibold transition-all"
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
              </Link>
            );
          }
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
          className="hidden md:flex flex-col fixed inset-y-0 border-r transition-all duration-300"
          style={{
            background: "var(--animal-bg-color)",
            borderColor: "var(--animal-border-color-light)",
            width: sidebarCollapsed ? 76 : 240,
          }}
        >
          <div className={`flex items-center justify-between pt-6 pb-4 ${sidebarCollapsed ? "px-3" : "px-5"}`}>
            {sidebarCollapsed ? (
              <span className="text-xl">🌳</span>
            ) : (
              <Title size="small" color="app-teal">
                Oak
              </Title>
            )}
            <button
              type="button"
              className="p-1.5 rounded-lg border-0 bg-transparent cursor-pointer hover:opacity-80"
              style={{ color: "var(--animal-text-color-secondary)" }}
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
              title={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
          </div>
          <nav className="flex-1 px-3 space-y-1.5 overflow-y-auto">{renderNav(menus)}</nav>
          <div className="px-3 pb-5 pt-2" />
        </aside>

        <div
          className={`flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-300 ${
            sidebarCollapsed ? "md:ml-[76px]" : "md:ml-[240px]"
          }`}
        >
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
                <div className="relative">
                  {userMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                      <div
                        className="absolute right-0 top-full mt-2 z-20 rounded-2xl border-2 bg-white overflow-hidden min-w-40"
                        style={{ borderColor: "var(--animal-border-color-light)" }}
                      >
                        <Link
                          href="/settings"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-3 text-sm font-semibold no-underline"
                          style={{ color: "var(--animal-text-color)" }}
                        >
                          <Settings size={16} />
                          设置
                        </Link>
                        <Link
                          href="/about"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-3 text-sm font-semibold no-underline"
                          style={{ color: "var(--animal-text-color)" }}
                        >
                          <Info size={16} />
                          关于
                        </Link>
                        <button
                          type="button"
                          onClick={logout}
                          className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold border-0 bg-transparent cursor-pointer text-left"
                          style={{ color: "var(--animal-error-color)" }}
                        >
                          <LogOut size={16} />
                          退出
                        </button>
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    className="flex items-center gap-2.5 rounded-2xl border-0 cursor-pointer transition-all duration-300 active:scale-95 hover:opacity-90 pl-2 pr-2 py-1.5"
                    style={{ background: "transparent", color: "var(--animal-text-color-secondary)" }}
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    aria-expanded={userMenuOpen}
                    aria-label="用户菜单"
                  >
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform duration-500"
                      style={{
                        background: "var(--animal-primary-color-bg)",
                        color: "var(--animal-primary-color)",
                        transform: userMenuOpen ? "rotate(360deg)" : "none",
                      }}
                    >
                      <GamepadDirectional size={18} />
                    </span>
                    <span className="hidden sm:inline min-w-0 text-left text-sm font-semibold truncate max-w-24">
                      {user?.displayName || user?.username || "我"}
                    </span>
                    <span className="hidden sm:inline shrink-0">
                      {userMenuOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </span>
                  </button>
                </div>
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
