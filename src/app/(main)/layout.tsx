"use client";

import { ChildProvider } from "@/lib/childContext";
import { ProfileProvider } from "@/lib/profileContext";
import { AppShell } from "@/components/AppShell";
import { FloatingChat } from "@/components/ai-assistant/FloatingChat";

export default function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ProfileProvider>
      <ChildProvider>
        <AppShell>{children}</AppShell>
        <FloatingChat />
      </ChildProvider>
    </ProfileProvider>
  );
}
