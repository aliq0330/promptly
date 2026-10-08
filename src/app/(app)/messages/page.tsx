"use client";

import { Suspense } from "react";
import { MessageCircle } from "lucide-react";
import { ConversationsPane } from "@/features/messages/conversations-pane";
import { useTranslation } from "@/lib/i18n/language-provider";

function MessagesPageInner() {
  const { t } = useTranslation();
  return (
    <>
      {/* Phone: the list is the whole page. On tablet/desktop the layout
          already shows it in the left pane, so this side is the "no chat
          selected" placeholder instead. */}
      <div className="md:hidden">
        <ConversationsPane />
      </div>
      <div className="hidden h-full flex-col items-center justify-center gap-2 px-6 text-center md:flex">
        <span className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl border border-border-soft bg-primary-soft text-primary shadow-xs">
          <MessageCircle size={26} strokeWidth={1.75} />
        </span>
        <h2 className="text-h2 text-text">{t("messages.selectConversationTitle")}</h2>
        <p className="max-w-xs text-sm text-text-muted">{t("messages.selectConversationBody")}</p>
      </div>
    </>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesPageInner />
    </Suspense>
  );
}
