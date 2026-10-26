"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { useChromeAutoHide } from "@/components/layout/use-chrome-autohide";
import { WelcomeTour } from "@/features/onboarding/welcome-tour";
import { AnnounceReportNotice } from "@/features/communities/announce-picker";
import { NoticeHost } from "@/components/layout/notice-host";
import { useTranslation } from "@/lib/i18n/language-provider";

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
 * Below `lg` the header and the bottom nav slide away while scrolling down (`useChromeAutoHide`).
 * Odak (`/focus`) is a page of its own (docs/history/248-*): its route gets NO bars at all — no header, sidebar, bottom nav or
 * skip link in the DOM — only the providers, the notices and its own full-screen stage. (Hiding them was not enough on iPhone:
 * Safari took the strip behind its toolbar from the fixed bottom nav even while it was hidden.)
 */
export function AppShell({ children, aside }: AppShellProps) {
  const { t } = useTranslation();
  useChromeAutoHide();
  const bare = /^\/focus\/?$/.test(usePathname() ?? "");
  if (bare) {
    return (
      <div className="flex min-h-screen">
        <main id="main-content" className="min-w-0 flex-1">
          {children}
        </main>
        <WelcomeTour />
        <AnnounceReportNotice />
        <NoticeHost />
      </div>
    );
  }
  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-label focus:shadow-pop"
      >
        {t("common.skipToContent")}
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
      <WelcomeTour />
      <AnnounceReportNotice />
      <NoticeHost />
    </div>
  );
}
