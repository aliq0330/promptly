"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { buttonClassName } from "@/components/ui/button";
import { OptionRowGroup } from "@/components/ui/option-group";
import { ContentRowKicker, ContentThumb } from "@/features/content/content-row";
import { usePickerCards } from "@/features/content/use-picker-cards";
import { attachmentKey } from "@/lib/supabase/comment-attachments";
import { Modal } from "@/components/ui/modal";
import { fieldControlClassName } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { QuoteSection } from "@/features/quotes/quote-section";
import { type CommunityPostType } from "@/lib/supabase/communities";
import { spaceHref } from "@/lib/spaces";
import { LoadMore } from "@/features/feed/load-more";
import { useShareableContent } from "@/features/communities/use-shareable-content";
import { useTranslation } from "@/lib/i18n/language-provider";
import { presetHref, promptHref, requestHref, skillHref, workflowHref } from "@/lib/utils";
import { DialogShell } from "@/components/ui/dialog-shell";
import { SKILLS_MENU_ENABLED } from "@/lib/skills/flag";

const TYPES: CommunityPostType[] = SKILLS_MENU_ENABLED ? ["prompt", "request", "workflow", "preset", "skill"] : ["prompt", "request", "workflow", "preset"];

function hrefOf(type: CommunityPostType, id: string): string {
  if (type === "prompt") return promptHref({ id });
  if (type === "request") return requestHref({ id });
  if (type === "workflow") return workflowHref({ id });
  if (type === "preset") return presetHref({ id });
  if (type === "skill") return skillHref({ id });
  return spaceHref(id);
}

/**
 * Oluştur → "Var olan içeriği paylaş" (docs/history/215-*): kullanıcının KENDİ yayında + herkese açık içeriklerinden (ve herkese açık
 * Space'lerinden) biri seçilir, aynı "Alıntıla" formuyla (`QuoteSection`) akışta ve/veya bir ya da birkaç toplulukta alıntılanır. Özel
 * ya da taslak içerik listelenmez — duyurmak içeriği otomatik herkese açmaz. Mesajla/hikâyeyle paylaşım içeriğin kendi Paylaş'ındadır.
 * Bir içerik seçilince Alıntıla formu listenin ÜSTÜNE ikinci bir pencerede açılır (docs/history/338-*): uzun listenin altına inmek gerekmez;
 * pencere kapanınca liste ve seçim yerinde kalır, seçili satıra tekrar dokunmak pencereyi yeniden açar.
 */
export function ShareExistingModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [type, setType] = useState<CommunityPostType>("prompt");
  const { search, setSearch, list } = useShareableContent(userId, type);
  const items = list.items;
  const cards = usePickerCards(items ? items.map((item) => ({ type, id: item.id, title: item.title })) : null);
  const loadError = list.failed && items !== null && items.length === 0;
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);

  // Tür değişince seçim ve arama sıfırlanır.
  function changeType(next: CommunityPostType) {
    setType(next);
    setSelected(null);
    setQuoteOpen(false);
    setSearch("");
  }

  return (
    <>
      <Modal onClose={onClose} labelledBy="share-existing-title">
        <DialogShell className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-lg card-flat shadow-pop" data-share-existing="">
          <div className="space-y-1 px-5 pb-2 pt-5">
            <h2 id="share-existing-title" className="text-body font-semibold text-text">
              {t("create.shareExistingTitle")}
            </h2>
            <p className="text-small text-text-muted">{t("shareExisting.help")}</p>
          </div>
          <div className="px-5">
            <Tabs variant="segmented" ariaLabel={t("communities.feed.typeAria")} active={type} onChange={changeType} items={TYPES.map((value) => ({ key: value, label: t(`communities.feed.type.${value}`) }))} />
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-3">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("communities.feed.pickSearch")}
              aria-label={t("communities.feed.pickSearch")}
              className={`${fieldControlClassName} h-10`}
            />
            {loadError ? (
              <p role="alert" className="text-small text-danger">
                {t("communities.feed.pickLoadError")}
              </p>
            ) : items === null || list.loading ? (
              <div className="h-20 skeleton-shimmer rounded-lg" aria-busy="true" />
            ) : items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-small text-text-muted">{t("communities.feed.pickEmpty")}</p>
            ) : (
              <OptionRowGroup<string>
                ariaLabel={t("communities.feed.pickAria")}
                value={selected?.id ?? null}
                reselect
                onChange={(id) => {
                  const item = items.find((entry) => entry.id === id);
                  if (!item) return;
                  setSelected({ id: item.id, title: item.title || t("communities.feed.untitled") });
                  setQuoteOpen(true);
                }}
                options={items.map((item) => ({
                  key: item.id,
                  leading: <ContentThumb type={type} src={cards.get(attachmentKey({ type, id: item.id }))?.thumbnailUrl} skillCover={cards.get(attachmentKey({ type, id: item.id }))?.skillCoverPath} />,
                  kicker: <ContentRowKicker type={type} />,
                  label: item.title || t("communities.feed.untitled"),
                  attrs: { "data-share-existing-item": item.id },
                }))}
              />
            )}
            {items !== null && items.length > 0 && (
              <LoadMore failed={list.failed} hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={list.grow} />
            )}
          </div>
        </DialogShell>
      </Modal>
      {selected && (
        // Seçim değişince form sıfırlansın (önceki içeriğin alıntı sonuçları taşınmasın).
        <QuoteSection
          key={`${type}:${selected.id}`}
          type={type}
          contentId={selected.id}
          mode="popup"
          hideTrigger
          open={quoteOpen}
          onOpenChange={setQuoteOpen}
          contextTitle={selected.title}
          extra={
            <Link href={hrefOf(type, selected.id)} onClick={onClose} className={buttonClassName({ size: "sm", variant: "outline", className: "gap-1.5" })}>
              {t("shareExisting.open")}
              <ArrowUpRight size={16} aria-hidden />
            </Link>
          }
        />
      )}
    </>
  );
}
