/** 菜单树种子定义：业务导航 + 系统管理（page 按钮权限点用 type=button 挂 perms） */
export interface MenuSeedNode {
  type: "dir" | "menu" | "button";
  name: string;
  path?: string;
  icon?: string;
  perms?: string;
  sort?: number;
  children?: MenuSeedNode[];
}

export const menuSeedDefs: MenuSeedNode[] = [
  { type: "menu", name: "概览", path: "/", icon: "icon-map", sort: 1 },
  { type: "menu", name: "教育经历", path: "/education", icon: "icon-critterpedia", sort: 2 },
  { type: "menu", name: "课程表", path: "/timetable", icon: "icon-design", sort: 3 },
  { type: "menu", name: "学习情况", path: "/learning", icon: "icon-diy", sort: 4 },
  { type: "menu", name: "学习园地", path: "/garden", icon: "icon-miles", sort: 5 },
  { type: "menu", name: "成长记录", path: "/growth", icon: "icon-miles", sort: 6 },
  { type: "menu", name: "健康档案", path: "/health", icon: "icon-variant", sort: 7 },
  { type: "menu", name: "时光相册", path: "/moments", icon: "icon-camera", sort: 8 },
  { type: "menu", name: "账单", path: "/bills", icon: "icon-shopping", sort: 9 },
  { type: "menu", name: "卡证档案", path: "/certs", icon: "icon-variant", sort: 10 },
  { type: "menu", name: "提醒中心", path: "/reminders", icon: "icon-miles", sort: 11 },
  { type: "menu", name: "政策动态", path: "/policies", icon: "icon-chat", sort: 12 },
  { type: "menu", name: "成员管理", path: "/children", icon: "icon-miles", sort: 13 },
  { type: "menu", name: "设置", path: "/settings", icon: "icon-helicopter", sort: 14 },
  { type: "menu", name: "错题本/笔记", path: "/notes", icon: "icon-critterpedia", sort: 16 },
  { type: "menu", name: "食谱", path: "/recipes", icon: "icon-diy", sort: 17 },
  { type: "menu", name: "关于", path: "/about", icon: "icon-map", sort: 18 },
  {
    type: "dir",
    name: "实用工具",
    path: "/tools",
    icon: "icon-diy",
    sort: 15,
    children: [
      { type: "menu", name: "白板", path: "/tools/whiteboard", icon: "icon-variant", sort: 1 },
      { type: "menu", name: "待办", path: "/tools/todo", icon: "icon-miles", sort: 2 },
      { type: "menu", name: "番茄钟", path: "/tools/timer", icon: "icon-camera", sort: 3 },
    ],
  },
  {
    type: "dir",
    name: "系统管理",
    path: "/system",
    icon: "icon-diy",
    sort: 20,
    children: [
      {
        type: "menu",
        name: "用户管理",
        path: "/system/users",
        icon: "icon-critterpedia",
        perms: "system:user:list",
        sort: 1,
        children: [
          { type: "button", name: "新增用户", perms: "system:user:create" },
          { type: "button", name: "编辑用户", perms: "system:user:update" },
          { type: "button", name: "删除用户", perms: "system:user:delete" },
        ],
      },
      {
        type: "menu",
        name: "角色管理",
        path: "/system/roles",
        icon: "icon-design",
        perms: "system:role:list",
        sort: 2,
        children: [
          { type: "button", name: "新增角色", perms: "system:role:create" },
          { type: "button", name: "编辑角色", perms: "system:role:update" },
          { type: "button", name: "删除角色", perms: "system:role:delete" },
          { type: "button", name: "分配权限", perms: "system:role:assign" },
        ],
      },
      {
        type: "menu",
        name: "菜单管理",
        path: "/system/menus",
        icon: "icon-shopping",
        perms: "system:menu:list",
        sort: 3,
        children: [
          { type: "button", name: "新增菜单", perms: "system:menu:create" },
          { type: "button", name: "编辑菜单", perms: "system:menu:update" },
          { type: "button", name: "删除菜单", perms: "system:menu:delete" },
        ],
      },
    ],
  },
];
