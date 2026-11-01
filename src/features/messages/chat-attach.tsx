"use client";

import { useState } from "react";
import { Check, FileDown, ImagePlus, Search, Shapes, SlidersHorizontal, Sparkles, SquareTerminal, Workflow, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldControlClassName } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { LoadMore } from "@/features/feed/load-more";
import { useShareableContent } from "@/features/communities/use-shareable-content";
import type { CommunityPostType, ShareableContent } from "@/lib/supabase/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/** Sohbette kütüphaneden paylaşılabilen türler (docs/history/268-*): "Var olan içeriği paylaş" (`ShareExistingModal`) ile aynı beş tür ve aynı sorgu. */
export const LIBRARY_TYPES: { type: CommunityPostType; icon: LucideIcon }[] = [
  { type: "prompt", icon: SquareTerminal },
  { type: "request", icon: Sparkles },
  { type: "workflow", icon: Workflow },
  { type: "preset", icon: SlidersHorizontal },
  { type: "space", icon: Shapes },
];

/**
 * Composer'ın "+" düğmesinin açtığı alt sayfa: fotoğraf yükle · GIF · prompt içe aktar · kütüphaneden paylaş (tür seç → seçici).
 * `onGif` / `onImport` / `onPickType` yoksa ilgili satır çizilmez (ilk mesaj ekranı yalnız fotoğraf + GIF sunar).
 */
export function ChatAttachSheet({
  onClose,
  onPhoto,
  onGif,
  onImport,
  onPickType,
}: {
  onClose: () => void;
  onPhoto: () => void;
  onGif?: () => void;
  onImport?: () => void;
  onPickType?: (type: CommunityPostType) => void;
}) {
  const { t } = useTranslation();
  const rowClass =
    "flex min-h-16 w-full items-center gap-3.5 rounded-xl px-2 text-left transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <Modal onClose={onClose} labelledBy="chat-attach-title" variant="sheet">
      <div data-chat-attach className="flex w-full max-w-lg flex-col overflow-y-auto rounded-t-2xl border border-b-0 border-border-soft bg-surface px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 shadow-pop">
        <h2 id="chat-attach-title" className="sr-only">
          {t("messages.attach.title")}
        </h2>
        <button type="button" onClick={onPhoto} className={rowClass} data-attach-photo>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <ImagePlus size={22} strokeWidth={1.75} aria-hidden />
          </span>
          <span className="flex flex-col">
            <span className="text-body font-semibold text-text">{t("messages.attach.photo")}</span>
            <span className="text-small text-text-muted">{t("messages.attach.photoHint")}</span>
          </span>
        </button>
        {onGif && (
          <button type="button" onClick={onGif} className={rowClass} data-attach-gif>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <span aria-hidden className="rounded-[5px] border-[1.75px] border-current px-[3px] py-[2px] text-[10px] font-extrabold leading-none tracking-[0.04em]">
                {t("gif.badge")}
              </span>
            </span>
            <span className="flex flex-col">
              <span className="text-body font-semibold text-text">{t("messages.attach.gif")}</span>
              <span className="text-small text-text-muted">{t("messages.attach.gifHint")}</span>
            </span>
          </button>
        )}
        {onImport && (
          <button type="button" onClick={onImport} className={rowClass} data-attach-import>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <FileDown size={22} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="flex flex-col">
              <span className="text-body font-semibold text-text">{t("messages.attach.import")}</span>
              <span className="text-small text-text-muted">{t("messages.attach.importHint")}</span>
            </span>
          </button>
        )}
        {onPickType && (
          <>
            <div className="mx-2 my-2 border-t border-border-soft" />
            <p className="px-2 pb-3 pt-1 text-small font-semibold text-text-muted">{t("messages.library.title")}</p>
            <ul className="grid grid-cols-5 gap-1 px-0.5">
              {LIBRARY_TYPES.map(({ type, icon: Icon }) => (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => onPickType(type)}
                    data-attach-library={type}
                    className="flex w-full flex-col items-center gap-2 rounded-xl px-1 py-1.5 text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                      <Icon size={24} strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="text-caption font-medium">{t(`communities.feed.type.${type}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * Kütüphaneden paylaş: tür sekmeleri + başlık araması + tek seçim; "Ekle" seçileni mesaja ekler (not yazılıp gönderilir). Liste, "Var olan içeriği paylaş"
 * ile AYNI kaynaktan gelir (`useShareableContent`): kendi yayında + herkese açık içerikler (alıcının okuyamayacağı özel içerik listelenmez).
 */
export function ChatLibraryPicker({
  userId,
  initialType,
  onPick,
  onClose,
}: {
  userId: string;
  initialType: CommunityPostType;
  onPick: (item: ShareableContent) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<CommunityPostType>(initialType);
  const { search, setSearch, list } = useShareableContent(userId, type);
  const items = list.items;
  const loadError = list.failed && items !== null && items.length === 0;
  const [selected, setSelected] = useState<ShareableContent | null>(null);
  const Icon = LIBRARY_TYPES.find((entry) => entry.type === type)?.icon ?? SquareTerminal;

  function changeType(next: CommunityPostType) {
    setType(next);
    setSelected(null);
    setSearch("");
  }

  return (
    <Modal onClose={onClose} labelledBy="chat-library-title">
      <div data-chat-library className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-1 pt-4">
          <h2 id="chat-library-title" className="font-display text-h3 font-bold text-text">
            {t("messages.library.title")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="shrink-0 px-5 pb-1 pt-2">
          <Tabs variant="segmented" ariaLabel={t("communities.feed.typeAria")} active={type} onChange={changeType} items={LIBRARY_TYPES.map(({ type: value }) => ({ key: value, label: t(`communities.feed.type.${value}`) }))} />
        </div>
        <div className="shrink-0 px-5 pb-2 pt-2">
          <label className="relative block">
            <span className="sr-only">{t("communities.feed.pickSearch")}</span>
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("communities.feed.pickSearch")}
              className={cn(fieldControlClassName, "h-11 pl-10")}
            />
          </label>
          <p className="mt-2 text-caption text-text-muted">{t("messages.library.help")}</p>
        </div>
        <div className="min-h-[8rem] flex-1 overflow-y-auto px-2 pb-2">
          {loadError ? (
            <p role="alert" className="px-3 py-6 text-center text-small text-danger">
              {t("communities.feed.pickLoadError")}
            </p>
          ) : items === null || list.loading ? (
            <div className="mx-3 mt-2 h-20 animate-pulse rounded-lg bg-surface-soft" aria-busy="true" />
          ) : items.length === 0 ? (
            <p className="mx-3 mt-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-small text-text-muted">{t("communities.feed.pickEmpty")}</p>
          ) : (
            <ul role="radiogroup" aria-label={t("communities.feed.pickAria")}>
              {items.map((item) => {
                const isSelected = selected?.id === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      data-library-item={item.id}
                      onClick={() => setSelected(item)}
                      className={cn(
                        "flex min-h-16 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        isSelected ? "bg-primary-soft" : "hover:bg-surface-soft",
                      )}
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                        <Icon size={22} strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-semibold text-text">{item.title || t("communities.feed.untitled")}</span>
                        <span className="block truncate text-small text-text-muted">{t(`communities.feed.type.${type}`)}</span>
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                          isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
                        )}
                      >
                        {isSelected && <Check size={14} strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {items !== null && items.length > 0 && <LoadMore failed={list.failed} hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={list.grow} />}
        </div>
        <div data-dialog-footer className="shrink-0 border-t border-border-soft px-5 py-3">
          <Button type="button" size="lg" className="w-full" disabled={!selected} onClick={() => selected && onPick(selected)} data-library-add>
            {selected ? t("messages.library.add", { type: t(`communities.feed.type.${type}`) }) : t("messages.library.pickOne")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
