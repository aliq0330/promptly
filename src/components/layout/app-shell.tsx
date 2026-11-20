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
import { LiveNotificationToasts } from "@/features/notifications/live-toasts";
import { MessageDock } from "@/features/messages/message-dock";
import { MessageDockProvider } from "@/features/messages/message-dock-provider";
import { CallProvider } from "@/features/calls/call-provider";
import { useTranslation } from "@/lib/i18n/language-provider";

interface AppShellProps {
  children: ReactNode;
}

/**
 * Three compositions of one shell:
 *   mobile  (<md):  header + content + bottom nav
 *   tablet  (md–lg): 84px labelled rail + header + content
 *   desktop (lg+):  248px grouped sidebar + header + content (+ optional aside); the Messages workspace (`/messages*`) keeps the 84px rail instead (docs/history/450-*)
 * One destination, one place (docs/history/387-*): the three navs list the same destinations, the header is status only (search, Odak, bell, messages).
 * Below `lg` the header and the bottom nav slide away while scrolling down (`useChromeAutoHide`).
 * Odak (`/focus`) is a page of its own (docs/history/248-*): its route gets NO bars at all — no header, sidebar, bottom nav or
 * skip link in the DOM — only the providers, the notices and its own full-screen stage. (Hiding them was not enough on iPhone:
 * Safari took the strip behind its toolbar from the fixed bottom nav even while it was hidden.)
 * From `lg` a signed-in member also gets the Messages dock (docs/history/328-*): a pill fixed to the bottom-right that opens a chat panel without leaving the page.
 */
export function AppShell({ children }: AppShellProps) {
  // 1-1 arama (docs/history/449-*): gelen arama her sayfada (Odak dahil) çalar; sağlayıcı yalnız oturumlu üyede abone olur.
  return (
    <CallProvider>
      <AppShellFrame>{children}</AppShellFrame>
    </CallProvider>
  );
}

function AppShellFrame({ children }: AppShellProps) {
  const { t } = useTranslation();
  useChromeAutoHide();
  const pathname = usePathname() ?? "";
  const bare = /^\/focus\/?$/.test(pathname);
  // Mesajlar çalışma alanıdır (docs/history/450-*): masaüstünde de 84 px ince ray + tam genişlik çalışma alanı; 248 px kenar çubuğu çizilmez.
  const workspace = /^\/messages(\/|$)/.test(pathname);
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
      <NavRail desktop={workspace} />
      {!workspace && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <div className="flex flex-1">
          <main id="main-content" className="min-w-0 flex-1 pb-(--nav-clearance) md:pb-10">
            {children}
          </main>
        </div>
      </div>
      <MobileNav />
      <MessageDock />
      <LiveNotificationToasts />
      <WelcomeTour />
      <TermsUpdateNotice />
      <AnnounceReportNotice />
      <NoticeHost />
    </div>
    </MessageDockProvider>
  );
}
