"use client";

import { Suspense, type ReactNode } from "react";
import { ConversationsPane } from "@/features/messages/conversations-pane";

/**
 * Shared frame for `/messages` and `/messages/local`. Phone (< md): just the
 * page, as before (list page → full-screen chat). Tablet/desktop (md+): a
 * fixed two-pane workspace — conversation list on the left, the open chat
 * (or an empty state) on the right. Widths are clamp()-based so the split
 * follows the viewport instead of fixed pixel breakpoints, and the frame
 * stops growing on very wide screens.
 */
export default function MessagesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="md:fixed md:bottom-0 md:left-[72px] md:right-0 md:top-16 md:z-10 md:bg-background lg:left-64">
      <div className="mx-auto flex h-full max-w-[1500px] md:border-x md:border-border">
        <aside className="hidden w-[clamp(280px,35%,340px)] shrink-0 flex-col border-r border-border bg-surface md:flex lg:w-[clamp(320px,30%,420px)]">
          <Suspense fallback={null}>
            <ConversationsPane embedded />
          </Suspense>
        </aside>
        <section className="relative min-w-0 flex-1 md:flex md:min-h-0 md:flex-col">{children}</section>
      </div>
    </div>
  );
}
