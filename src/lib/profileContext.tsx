"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "./api";

export interface ProfileMenu {
  id: number;
  parentId: number | null;
  type: string; // dir | menu
  name: string;
  path: string;
  icon: string;
  perms: string;
  sort: number;
  children?: ProfileMenu[];
}

export interface ProfileUser {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
}

interface ProfileContextValue {
  user: ProfileUser | null;
  isAdmin: boolean;
  roles: string[];
  menus: ProfileMenu[];
  perms: string[];
  loading: boolean;
  reload: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue>({
  user: null,
  isAdmin: false,
  roles: [],
  menus: [],
  perms: [],
  loading: true,
  reload: async () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [menus, setMenus] = useState<ProfileMenu[]>([]);
  const [perms, setPerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const res = await api<{ user: ProfileUser; roles: string[]; menus: ProfileMenu[]; perms: string[] }>(
        "/api/auth/profile"
      );
      setUser(res.user);
      setRoles(res.roles);
      setMenus(res.menus);
      setPerms(res.perms);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, [reload]);

  return (
    <ProfileContext.Provider
      value={{ user, isAdmin: !!user?.isAdmin, roles, menus, perms, loading, reload }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
