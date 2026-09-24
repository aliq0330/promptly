import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";

interface AppShellProps {
  children: ReactNode;
  /** Optional right-hand helper panel, shown on wide desktop viewports only. */
  aside?: ReactNode;
}

/**
 * Three compositions of one shell:
 *   mobile  (<md):  header + content + bottom nav
 *   tablet  (md–lg): 72px icon rail + header + content
 *   desktop (lg+):  256px grouped sidebar + header + content (+ optional aside)
 */
export function AppShell({ children, aside }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-label focus:shadow-pop"
      >
        İçeriğe geç
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <div className="flex flex-1">
          <main id="main-content" className="min-w-0 flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10">
            {children}
          </main>
          {aside ? (
            <aside className="hidden w-80 shrink-0 border-l border-border-soft p-4 xl:block">{aside}</aside>
          ) : null}
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
