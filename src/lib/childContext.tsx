"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "./api";

export interface Child {
  id: number;
  name: string;
  nickname: string;
  gender: string;
  birthday: string;
  photo: string;
  notes: string;
}

interface ChildContextValue {
  children: Child[];
  currentChild: Child | null;
  setCurrentChildId: (id: number) => void;
  refresh: () => Promise<void>;
  loading: boolean;
}

const ChildContext = createContext<ChildContextValue>({
  children: [],
  currentChild: null,
  setCurrentChildId: () => {},
  refresh: async () => {},
  loading: true,
});

export function ChildProvider({ children: nodes }: { children: ReactNode }) {
  const [children, setChildren] = useState<Child[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const list = await api<Child[]>("/api/children");
    setChildren(list);
    setCurrentId((prev) => {
      if (prev && list.some((c) => c.id === prev)) return prev;
      const saved = Number(localStorage.getItem("currentChildId"));
      if (saved && list.some((c) => c.id === saved)) return saved;
      return list[0]?.id ?? null;
    });
    setLoading(false);
  };

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (currentId) localStorage.setItem("currentChildId", String(currentId));
  }, [currentId]);

  return (
    <ChildContext.Provider
      value={{
        children,
        currentChild: children.find((c) => c.id === currentId) ?? null,
        setCurrentChildId: setCurrentId,
        refresh,
        loading,
      }}
    >
      {nodes}
    </ChildContext.Provider>
  );
}

export function useChildren() {
  return useContext(ChildContext);
}
