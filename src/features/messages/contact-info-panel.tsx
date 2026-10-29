"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Ban, ChevronLeft, ChevronRight, Eraser, Pin, Search, Star, Trash2, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { ReportButton } from "@/features/moderation/report-button";
import type { useBlockState } from "@/features/moderation/use-block-state";
import { fetchConversationPhotos, type ConversationPhoto } from "@/lib/supabase/messages";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, profileHref } from "@/lib/utils";
import { useMessageImageUrls } from "./message-image-grid";
import type { Conversation, UserProfile } from "@/types";

const CARD = "shrink-0 overflow-hidden rounded-2xl border border-border-soft bg-surface";
const ROW =
  "flex min-h-14 w-full items-center gap-3.5 pl-4 text-left text-body text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-50";

function Row({ icon, children, value, onClick, href, danger, last, testId }: { icon: ReactNode; children: ReactNode; value?: ReactNode; onClick?: () => void; href?: string; danger?: boolean; last?: boolean; testId?: string }) {
  const inner = (
    <>
      <span className={cn("shrink-0", danger ? "text-danger" : "text-text")}>{icon}</span>
      <span className={cn("flex min-h-14 flex-1 items-center justify-between gap-2 pr-3.5", !last && "border-b border-border-soft", danger && "text-danger")}>
        <span>{children}</span>
        {value !== undefined && (
          <span className="flex items-center gap-0.5 text-small text-text-muted">
            {value}
            {(onClick || href) && !danger && <ChevronRight size={17} aria-hidden />}
          </span>
        )}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={ROW} data-contact-row={testId}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={ROW} data-contact-row={testId}>
      {inner}
    </button>
  );
}

/**
 * Kişi bilgisi (docs/history/268-*, WhatsApp "Kişi bilgisi" gibi): sohbet başlığında kişiye dokununca açılır. Telefonda tam ekran, geniş ekranda sağdan açılan
 * panel. Profil resmi + ad + kullanıcı adı, Ara / Profil, bu sohbette paylaşılan fotoğraflar, bu sohbetin yıldızlı ve sabit mesajları ve sohbetle ilgili
 * işlemler (arşivle · mesajları temizle · sil · engelle · şikâyet). Fotoğraflar yalnız bu kişinin GÖREBİLDİĞİ mesajlardan gelir.
 * İşlemlerin hepsi sohbet başlığındaki ⋮ menüsüyle AYNI yoldan çalışır (aynı onay pencereleri, aynı sunucu yazımı).
 */
export function ContactInfoPanel({
  conversation,
  participant,
  viewerId,
  starredCount,
  pinnedCount,
  blockState,
  busy,
  onClose,
  onSearch,
  onJumpToMessage,
  onShowPinned,
  onToggleArchive,
  onAsk,
}: {
  conversation: Conversation;
  participant: UserProfile;
  viewerId: string;
  starredCount: number;
  pinnedCount: number;
  blockState: ReturnType<typeof useBlockState>;
  busy: boolean;
  onClose: () => void;
  onSearch: () => void;
  onJumpToMessage: (messageId: string) => void;
  onShowPinned: () => void;
  onToggleArchive: () => void;
  onAsk: (kind: "clear" | "delete") => void;
}) {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<{ items: ConversationPhoto[]; truncated: boolean } | null>(null);
  const [photosFailed, setPhotosFailed] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const archived = Boolean(conversation.archivedAt);

  useEffect(() => {
    let alive = true;
    fetchConversationPhotos(conversation.id, viewerId)
      .then((result) => {
        if (alive) setPhotos({ items: result.photos, truncated: result.truncated });
      })
      .catch(() => {
        if (alive) setPhotosFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [conversation.id, viewerId]);

  const preview = (photos?.items ?? []).slice(0, 4);
  const urls = useMessageImageUrls(preview.map((photo) => photo.attachment));
  const photoCount = photos ? `${photos.items.length}${photos.truncated ? "+" : ""}` : "";

  async function handleBlock() {
    if (!blockState.isBlocked && !confirmingBlock) {
      setConfirmingBlock(true);
      return;
    }
    setConfirmingBlock(false);
    await blockState.toggle();
  }

  return (
    <Modal onClose={onClose} labelledBy="contact-info-title" variant="side">
      <div data-contact-info className="flex h-full w-screen max-w-full flex-col overflow-y-auto bg-background pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:w-[26rem] sm:border-l sm:border-border-soft" onClick={(event) => event.stopPropagation()}>
        <div className="relative flex h-16 shrink-0 items-center px-3">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-text shadow-card transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronLeft size={22} aria-hidden />
          </button>
          <h2 id="contact-info-title" className="pointer-events-none absolute inset-x-0 text-center text-body font-semibold text-text">
            {t("messages.contact.title")}
          </h2>
        </div>

        <div className="flex shrink-0 flex-col items-center px-4 pt-1">
          <Avatar src={participant.avatarUrl} alt={participant.displayName} size={124} />
          <p className="mt-3.5 text-center font-display text-h1 font-bold tracking-[-0.02em] text-text" data-contact-name>
            {participant.displayName}
          </p>
          <p className="text-body text-text-muted" data-contact-username>
            @{participant.username}
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2.5 px-3 pt-5">
          <button
            type="button"
            onClick={onSearch}
            className="flex h-[5.25rem] flex-col items-center justify-center gap-2 rounded-2xl border border-border-soft bg-surface text-small font-medium text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Search size={24} strokeWidth={1.75} className="text-primary" aria-hidden />
            {t("messages.contact.search")}
          </button>
          <Link
            href={profileHref(participant)}
            className="flex h-[5.25rem] flex-col items-center justify-center gap-2 rounded-2xl border border-border-soft bg-surface text-small font-medium text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <User size={24} strokeWidth={1.75} className="text-primary" aria-hidden />
            {t("messages.contact.profile")}
          </Link>
        </div>

        <section className={cn(CARD, "mx-3 mt-3.5 pb-3.5")} aria-label={t("messages.contact.photos")} data-contact-photos>
          <div className="flex h-12 items-center justify-between px-4">
            <h3 className="text-body font-semibold text-text">{t("messages.contact.photos")}</h3>
            <span className="text-small text-text-muted" data-contact-photo-count>
              {photoCount}
            </span>
          </div>
          {photosFailed ? (
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
        </section>

        <section className={cn(CARD, "mx-3 mt-3")}>
          <Row icon={<Star size={22} strokeWidth={1.7} aria-hidden />} href="/messages/starred" value={starredCount > 0 ? starredCount : t("messages.contact.none")} testId="starred">
            {t("messages.contact.starred")}
          </Row>
          <Row icon={<Pin size={22} strokeWidth={1.7} aria-hidden />} onClick={pinnedCount > 0 ? onShowPinned : undefined} value={pinnedCount > 0 ? pinnedCount : t("messages.contact.none")} last testId="pinned">
            {t("messages.contact.pinned")}
          </Row>
        </section>

        <section className={cn(CARD, "mx-3 mt-3")} aria-label={t("messages.contact.settings")}>
          <Row icon={archived ? <ArchiveRestore size={22} strokeWidth={1.7} aria-hidden /> : <Archive size={22} strokeWidth={1.7} aria-hidden />} onClick={busy ? undefined : onToggleArchive} testId="archive">
            {archived ? t("messages.unarchive") : t("messages.archive")}
          </Row>
          <Row icon={<Eraser size={22} strokeWidth={1.7} aria-hidden />} onClick={() => onAsk("clear")} last testId="clear">
            {t("messages.clearHistory")}
          </Row>
        </section>

        <section className={cn(CARD, "mx-3 mt-3")}>
          <Row icon={<Trash2 size={22} strokeWidth={1.7} aria-hidden />} onClick={() => onAsk("delete")} danger testId="delete">
            {t("messages.deleteChat")}
          </Row>
          {blockState.canBlock && (
            <Row icon={<Ban size={22} strokeWidth={1.7} aria-hidden />} onClick={() => void handleBlock()} danger={!blockState.isBlocked} testId="block">
              {blockState.isBlocked ? t("profile.unblock") : confirmingBlock ? t("common.confirmDelete") : t("profile.block")}
            </Row>
          )}
          <div className="pl-4 pr-3.5 py-2" data-contact-row="report">
            <ReportButton targetType="user" targetId={participant.id} label={t("profile.reportThisUser")} menuItem={false} />
          </div>
        </section>
      </div>
    </Modal>
  );
}
