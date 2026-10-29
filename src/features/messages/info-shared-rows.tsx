"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon, LayoutGrid } from "lucide-react";
import { fetchChatSharedStats, type ChatSharedStats } from "@/lib/supabase/messages";
import { useTranslation } from "@/lib/i18n/language-provider";
import { ChatSharedModal } from "./chat-shared-modal";
import { InfoCard, InfoRow } from "./info-panel-kit";

/**
 * Bilgi sayfalarındaki "Medya ve bağlantılar" (fotoğraf + bağlantı sayısı) ve "Paylaşılan içerik" (kart olarak paylaşılan prompt/istek/workflow/hazır ayar/
 * Space/gönderi sayısı) satırları (docs/history/271-*). Sayılar sunucudan (`chat_shared_stats`); dokununca ilgili liste açılır.
 */
export function InfoSharedRows({ conversationId, onJumpToMessage }: { conversationId: string; onJumpToMessage: (messageId: string) => void }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<ChatSharedStats | null>(null);
  const [open, setOpen] = useState<"media" | "content" | null>(null);

  useEffect(() => {
    let alive = true;
    fetchChatSharedStats(conversationId)
      .then((result) => {
        if (alive) setStats(result);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [conversationId]);

  const mediaCount = stats ? stats.photos + stats.links : null;
  return (
    <>
      <InfoCard>
        <InfoRow icon={<ImageIcon size={18} strokeWidth={1.75} />} onClick={() => setOpen("media")} value={mediaCount ?? "…"} testId="media-links">
          {t("messages.shared.mediaLinks")}
        </InfoRow>
        <InfoRow icon={<LayoutGrid size={18} strokeWidth={1.75} />} onClick={() => setOpen("content")} value={stats ? stats.content : "…"} testId="shared-content">
          {t("messages.shared.content")}
        </InfoRow>
      </InfoCard>
      {open && (
        <ChatSharedModal
          conversationId={conversationId}
          mode={open}
          onClose={() => setOpen(null)}
          onJumpToMessage={(messageId) => {
            setOpen(null);
            onJumpToMessage(messageId);
          }}
        />
      )}
    </>
  );
}
