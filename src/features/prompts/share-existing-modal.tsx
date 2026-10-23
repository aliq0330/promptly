"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { QuoteSection } from "@/features/quotes/quote-section";
import { fetchOwnShareableContent, type CommunityPostType, type ShareableContent } from "@/lib/supabase/communities";
import { spaceHref } from "@/lib/spaces";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, presetHref, promptHref, requestHref, workflowHref } from "@/lib/utils";

const TYPES: CommunityPostType[] = ["prompt", "request", "workflow", "preset", "space"];

function hrefOf(type: CommunityPostType, id: string): string {
  if (type === "prompt") return promptHref({ id });
  if (type === "request") return requestHref({ id });
  if (type === "workflow") return workflowHref({ id });
  if (type === "preset") return presetHref({ id });
  return spaceHref(id);
}

/**
 * Oluştur → "Var olan içeriği paylaş" (docs/history/215-*): kullanıcının KENDİ yayında + herkese açık içeriklerinden (ve herkese açık
 * Space'lerinden) biri seçilir, aynı "Alıntıla" satırıyla (`QuoteSection`) akışta ve/veya bir ya da birkaç toplulukta alıntılanır. Özel
 * ya da taslak içerik listelenmez — duyurmak içeriği otomatik herkese açmaz. Mesajla/hikâyeyle paylaşım içeriğin kendi Paylaş'ındadır.
 */
export function ShareExistingModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [type, setType] = useState<CommunityPostType>("prompt");
  const [items, setItems] = useState<ShareableContent[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tür değişince listeyi sıfırla
    setItems(null);
    setLoadError(false);
    setSelected(null);
    fetchOwnShareableContent(userId, type)
      .then((list) => !cancelled && setItems(list))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [type, userId]);

  return (
    <Modal onClose={onClose} labelledBy="share-existing-title">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()} data-share-existing="">
        <div className="space-y-1 px-5 pb-2 pt-5">
          <h2 id="share-existing-title" className="text-base font-semibold text-text">
            {t("create.shareExistingTitle")}
          </h2>
          <p className="text-small text-text-muted">{t("shareExisting.help")}</p>
        </div>
        <div className="px-5">
          <Tabs variant="segmented" ariaLabel={t("communities.feed.typeAria")} active={type} onChange={setType} items={TYPES.map((value) => ({ key: value, label: t(`communities.feed.type.${value}`) }))} />
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-3">
          {loadError ? (
            <p role="alert" className="text-small text-danger">
              {t("communities.feed.pickLoadError")}
            </p>
          ) : items === null ? (
            <div className="h-20 animate-pulse rounded-lg bg-surface-soft" aria-busy="true" />
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-small text-text-muted">{t("communities.feed.pickEmpty")}</p>
          ) : (
            <ul className="space-y-1.5" role="radiogroup" aria-label={t("communities.feed.pickAria")}>
              {items.map((item) => (
                <li key={item.id}>
                  <label
                    data-share-existing-item={item.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition-colors",
                      selected === item.id ? "border-primary/50 bg-primary-soft/40" : "border-border-soft bg-background hover:border-border-strong",
                    )}
                  >
                    <input type="radio" name="share-existing" checked={selected === item.id} onChange={() => setSelected(item.id)} className="accent-[var(--color-primary)]" />
                    <span className="min-w-0 flex-1 break-words">{item.title || t("communities.feed.untitled")}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {selected && (
            <div className="space-y-3 border-t border-border-soft pt-4">
              {/* Seçim değişince satır sıfırlansın (önceki içeriğin duyuru sonuçları taşınmasın). */}
              <QuoteSection key={`${type}:${selected}`} type={type} contentId={selected} />
              <Link href={hrefOf(type, selected)} onClick={onClose} className={buttonClassName({ size: "sm", variant: "outline", className: "gap-1.5" })}>
                {t("shareExisting.open")}
                <ArrowUpRight size={14} aria-hidden />
              </Link>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
