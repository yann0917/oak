"use client";

import { ChildProvider } from "@/lib/childContext";
import { ProfileProvider } from "@/lib/profileContext";
import { AppShell } from "@/components/AppShell";

export default function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ProfileProvider>
      <ChildProvider>
        <AppShell>{children}</AppShell>
      </ChildProvider>
    </ProfileProvider>
  );
}
