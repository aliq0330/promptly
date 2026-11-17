import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AppProviders } from "@/components/providers/app-providers";
import { FirstRunGate } from "@/features/onboarding/first-run-gate";

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      {/* Yeni hesap en az 2 konu seçmeden siteyi kullanamaz (docs/history/424-*). */}
      <FirstRunGate>
        <AppShell>{children}</AppShell>
      </FirstRunGate>
    </AppProviders>
  );
}
