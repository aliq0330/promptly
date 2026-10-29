"use client";

import { useEffect, useState } from "react";
import { fetchConversationPhotos, type ConversationPhoto } from "@/lib/supabase/messages";
import { useTranslation } from "@/lib/i18n/language-provider";
import { InfoCard } from "./info-panel-kit";
import { useMessageImageUrls } from "./message-image-grid";

/**
 * "Paylaşılan fotoğraflar": bu sohbette görebildiğin fotoğrafların son dördü + toplam; dokununca o mesaja gider. Hem Kişi bilgisi hem
 * Topluluk bilgisi aynı kartı kullanır (okuma yalnız çağıranın GÖREBİLDİĞİ mesajlardan gelir).
 */
export function InfoPhotosCard({ conversationId, onJumpToMessage }: { conversationId: string; onJumpToMessage: (messageId: string) => void }) {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<{ items: ConversationPhoto[]; truncated: boolean } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchConversationPhotos(conversationId)
      .then((result) => {
        if (alive) setPhotos({ items: result.photos, truncated: result.truncated });
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [conversationId]);

  const preview = (photos?.items ?? []).slice(0, 4);
  const urls = useMessageImageUrls(preview.map((photo) => photo.attachment));
  const count = photos ? `${photos.items.length}${photos.truncated ? "+" : ""}` : "";

  return (
    <InfoCard aria-label={t("messages.contact.photos")} data-contact-photos className="pb-3.5">
      <div className="flex h-12 items-center justify-between px-4">
        <h3 className="text-body font-semibold text-text">{t("messages.contact.photos")}</h3>
        <span className="text-small text-text-muted" data-contact-photo-count>
          {count}
        </span>
      </div>
      {failed ? (
        <p role="alert" className="px-4 text-small text-danger">
          {t("messages.contact.photosError")}
        </p>
      ) : photos === null ? (
        <div className="mx-3 grid grid-cols-4 gap-2" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <span key={index} className="aspect-square animate-pulse rounded-xl bg-surface-soft" />
          ))}
        </div>
      ) : preview.length === 0 ? (
        <p className="px-4 text-small text-text-muted">{t("messages.contact.photosEmpty")}</p>
      ) : (
        <ul className="mx-3 grid grid-cols-4 gap-2">
          {preview.map((photo, index) => {
            const url = urls.get(photo.attachment.path);
            return (
              <li key={`${photo.messageId}:${photo.attachment.path}:${index}`}>
                <button
                  type="button"
                  onClick={() => onJumpToMessage(photo.messageId)}
                  aria-label={t("messages.contact.openPhotoAria", { index: index + 1 })}
                  data-contact-photo
                  className="relative block aspect-square w-full overflow-hidden rounded-xl bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {url && (
                    // eslint-disable-next-line @next/next/no-img-element -- imzalı (signed) özel bucket adresi
                    <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </InfoCard>
  );
}
