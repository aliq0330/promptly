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
        <MessageCircle size={40} className="text-text-muted" strokeWidth={1.5} />
        <h2 className="text-h3 font-semibold text-text">{t("messages.selectConversationTitle")}</h2>
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
