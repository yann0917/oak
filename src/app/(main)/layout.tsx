"use client";

import { ChildProvider } from "@/lib/childContext";
import { AppShell } from "@/components/AppShell";

export default function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ChildProvider>
      <AppShell>{children}</AppShell>
    </ChildProvider>
  );
}
