"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { NavRail } from "@/components/layout/nav-rail";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PublishCelebration } from "@/components/layout/publish-celebration";
import { useChromeAutoHide } from "@/components/layout/use-chrome-autohide";
import { WelcomeTour } from "@/features/onboarding/welcome-tour";
import { AnnounceReportNotice } from "@/features/communities/announce-picker";
import { TermsUpdateNotice } from "@/features/legal/terms-update-notice";
import { NoticeHost } from "@/components/layout/notice-host";
import { MessageDock } from "@/features/messages/message-dock";
import { MessageDockProvider } from "@/features/messages/message-dock-provider";
import { useTranslation } from "@/lib/i18n/language-provider";

interface AppShellProps {
  children: ReactNode;
  /** Optional right-hand helper panel, shown on wide desktop viewports only. */
  aside?: ReactNode;
}

/**
 * Three compositions of one shell:
 *   mobile  (<md):  header + content + bottom nav
 *   tablet  (md–lg): 84px labelled rail + header + content
 *   desktop (lg+):  248px grouped sidebar + header + content (+ optional aside)
 * One destination, one place (docs/history/387-*): the three navs list the same destinations, the header is status only (search, Odak, bell, messages).
 * Below `lg` the header and the bottom nav slide away while scrolling down (`useChromeAutoHide`).
 * Odak (`/focus`) is a page of its own (docs/history/248-*): its route gets NO bars at all — no header, sidebar, bottom nav or
 * skip link in the DOM — only the providers, the notices and its own full-screen stage. (Hiding them was not enough on iPhone:
 * Safari took the strip behind its toolbar from the fixed bottom nav even while it was hidden.)
 * From `lg` a signed-in member also gets the Messages dock (docs/history/328-*): a pill fixed to the bottom-right that opens a chat panel without leaving the page.
 */
export function AppShell({ children, aside }: AppShellProps) {
  const { t } = useTranslation();
  useChromeAutoHide();
  const bare = /^\/focus\/?$/.test(usePathname() ?? "");
  if (bare) {
    return (
      <div className="flex min-h-dvh">
        <main id="main-content" className="min-w-0 flex-1">
          {children}
        </main>
        <WelcomeTour />
        <AnnounceReportNotice />
      <PublishCelebration />
        <NoticeHost />
      </div>
    );
  }
  return (
    <MessageDockProvider>
    <div className="flex min-h-dvh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-(--z-toast) focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-label focus:shadow-pop"
      >
        {t("common.skipToContent")}
      </a>
      <NavRail />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <div className="flex flex-1">
          <main id="main-content" className="min-w-0 flex-1 pb-(--nav-clearance) md:pb-10">
            {children}
          </main>
          {aside ? (
            <aside className="hidden w-80 shrink-0 border-l border-border-soft p-4 xl:block">{aside}</aside>
          ) : null}
        </div>
      </div>
      <MobileNav />
      <MessageDock />
      <WelcomeTour />
      <TermsUpdateNotice />
      <AnnounceReportNotice />
      <NoticeHost />
    </div>
    </MessageDockProvider>
  );
}
