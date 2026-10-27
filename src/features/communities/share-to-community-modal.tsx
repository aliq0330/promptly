"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldControlClassName, fieldLabelClassName } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { shareToCommunity, type CommunityPostType } from "@/lib/supabase/communities";
import { COMMUNITY_NOTE_MAX } from "@/lib/communities";
import { LoadMore } from "@/features/feed/load-more";
import { useShareableContent } from "@/features/communities/use-shareable-content";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

const TYPES: CommunityPostType[] = ["prompt", "request", "workflow", "preset", "space"];

/**
 * "Mevcut içeriğe başvur": kullanıcının KENDİ yayında ve herkese açık içeriklerinden biri seçilir; isteğe bağlı not eklenir. İçerik
 * kopyalanmaz — akışa kendi kimliği, beğenisi ve yorumları olan bağımsız bir BAŞVURU gönderisi eklenir (işaret edilen içeriğin
 * sayaçlarına dokunmaz). Özel ya da taslak içerik burada listelenmez — başvuru içeriği otomatik herkese açmaz. Yeni içerik için
 * `CreatePostModal` normal oluşturma ekranını topluluk bağlamıyla (`?community=`) açar.
 */
export function ShareToCommunityModal({ communityId, userId, onClose, onShared }: { communityId: string; userId: string; onClose: () => void; onShared: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const [type, setType] = useState<CommunityPostType>("prompt");
  const { search, setSearch, list } = useShareableContent(userId, type);
  const items = list.items;
  const loadError = list.failed && items !== null && items.length === 0;
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const { busy, error, run } = useAsyncAction();

  // Tür değişince seçim ve arama sıfırlanır.
  function changeType(next: CommunityPostType) {
    setType(next);
    setSelected(null);
    setSearch("");
  }

  async function submit() {
    if (!selected) return;
    const ok = await run(async () => {
      await shareToCommunity(communityId, type, selected, note);
      return true;
    });
    if (ok) await onShared();
  }

  return (
    <Modal onClose={busy ? () => undefined : onClose} labelledBy="share-community-title">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="space-y-1 px-5 pb-2 pt-5">
          <h2 id="share-community-title" className="text-base font-semibold text-text">
            {t("communities.feed.shareTitle")}
          </h2>
          <p className="text-small text-text-muted">{t("communities.feed.shareHelp")}</p>
        </div>
        <div className="px-5">
          <Tabs variant="segmented" ariaLabel={t("communities.feed.typeAria")} active={type} onChange={changeType} items={TYPES.map((value) => ({ key: value, label: t(`communities.feed.type.${value}`) }))} />
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-3">
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
            <div className="h-20 animate-pulse rounded-lg bg-surface-soft" aria-busy="true" />
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-small text-text-muted">{t("communities.feed.pickEmpty")}</p>
          ) : (
            <ul className="space-y-1.5" role="radiogroup" aria-label={t("communities.feed.pickAria")}>
              {items.map((item) => (
                <li key={item.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition-colors",
                      selected === item.id ? "border-primary/50 bg-primary-soft/40" : "border-border-soft bg-background hover:border-border-strong",
                    )}
                  >
                    <input type="radio" name="share-content" checked={selected === item.id} onChange={() => setSelected(item.id)} disabled={busy} className="accent-[var(--color-primary)]" />
                    <span className="min-w-0 break-words">{item.title || t("communities.feed.untitled")}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {items !== null && items.length > 0 && (
            <LoadMore failed={list.failed} hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={list.grow} />
          )}

          <div>
            <label htmlFor="share-note" className={fieldLabelClassName}>
              {t("communities.feed.noteLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
            </label>
            <textarea id="share-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={COMMUNITY_NOTE_MAX} disabled={busy} placeholder={t("communities.feed.notePlaceholder")} className={`${fieldControlClassName} resize-none py-2.5`} />
            <p className="mt-1 text-caption text-text-muted">{`${[...note.trim()].length}/${COMMUNITY_NOTE_MAX}`} · {t("communities.feed.visibilityNote")}</p>
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border-soft px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" size="sm" onClick={() => void submit()} disabled={busy || !selected}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {t("communities.feed.shareSubmit")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
