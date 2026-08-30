/** 菜单树构建（profile 动态菜单与菜单管理页共用） */
export interface MenuRow {
  id: number;
  parentId: number | null;
  type: string;
  name: string;
  path: string;
  icon: string;
  perms: string;
  sort: number;
}

export function buildMenuTree<T extends MenuRow>(rows: T[], withChildren: boolean): any[] {
  const byId = new Map<number, T & { children?: any[] }>(rows.map((m) => [m.id, { ...m, children: [] }]));
  const roots: any[] = [];
  for (const node of byId.values()) {
    if (node.parentId != null && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortTree = (nodes: any[]) => {
    nodes.sort((a, b) => a.sort - b.sort);
    for (const n of nodes) sortTree(n.children ?? []);
  };
  sortTree(roots);
  if (!withChildren) {
    for (const node of byId.values()) delete node.children;
  }
  return roots;
}
