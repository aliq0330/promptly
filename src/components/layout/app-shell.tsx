import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";

interface AppShellProps {
  children: ReactNode;
  /** Optional right-hand helper panel, shown on wide desktop viewports only. */
  aside?: ReactNode;
}

export function AppShell({ children, aside }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <div className="flex flex-1">
          <main className="min-w-0 flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8">
            {children}
          </main>
          {aside ? (
            <aside className="hidden w-80 shrink-0 border-l border-border p-4 xl:block">
              {aside}
            </aside>
          ) : null}
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
