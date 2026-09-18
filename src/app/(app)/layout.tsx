import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { FollowProvider } from "@/features/profile/follow-provider";

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <FollowProvider>
      <AppShell>{children}</AppShell>
    </FollowProvider>
  );
}
