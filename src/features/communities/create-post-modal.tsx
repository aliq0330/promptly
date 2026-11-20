"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { IconComponent } from "@/components/icons/icon";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Sparkles } from "@/components/icons/sparkles";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { X } from "@/components/icons/x";
import { Modal } from "@/components/ui/modal";
import { SearchField } from "@/components/ui/search-field";
import { DialogShell } from "@/components/ui/dialog-shell";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { useLanguage, useTranslation } from "@/lib/i18n/language-provider";
import { fetchOwnShareableRecent, type CommunityPostType, type ShareableContent } from "@/lib/supabase/communities";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn, formatRelativeTime } from "@/lib/utils";
import { ShareNoteDialog } from "./share-to-community-modal";

type NewType = Exclude<CommunityPostType, "space" | "skill">;

/** Mevcut oluşturma ekranları — ikinci bir form YOK: topluluk bağlamı yalnızca `?community=` ile taşınır. */
const CREATE_HREF: Record<NewType, string> = { prompt: "/create?mode=prompt", request: "/requests/new", workflow: "/workflows/create", preset: "/presets/create" };
const TYPES: { type: NewType; icon: IconComponent; label: TranslationKey; desc: TranslationKey }[] = [
  { type: "prompt", icon: SquareTerminal, label: "communities.feed.type.prompt", desc: "cs.post.desc.prompt" },
  { type: "request", icon: Sparkles, label: "communities.feed.type.request", desc: "cs.post.desc.request" },
  { type: "workflow", icon: WorkflowIcon, label: "communities.feed.type.workflow", desc: "cs.post.desc.workflow" },
  { type: "preset", icon: SlidersHorizontal, label: "communities.feed.type.preset", desc: "cs.post.desc.preset" },
];
const ICON_OF: Record<NewType, IconComponent> = { prompt: SquareTerminal, request: Sparkles, workflow: WorkflowIcon, preset: SlidersHorizontal };

type Recent = ShareableContent & { createdAt: string };

/**
 * "Gönderi oluştur" (docs/history/445-*; 178'in iki adımlı seçiminin yerini alır): TEK ekran —
 *   1) Yeni oluştur: dört tür karosu → NORMAL oluşturma ekranı topluluk bağlamıyla (`?community=`); yayınlanınca içerik bu toplulukta
 *      kendi gönderisi olur (yerel gönderi).
 *   2) Var olan içeriğini paylaş: kendi yayında + herkese açık içeriklerinden en yeniler (arama ile) → "Seç" not penceresini açar
 *      (alıntı gönderisi). "Tümünü gör" eski içerik, Space ve Skill için tam seçiciyi (`ShareToCommunityModal`) açar.
 */
export function CreatePostModal({
  communityId,
  communityName,
  userId,
  onClose,
  onApply,
  onShared,
}: {
  communityId: string;
  communityName?: string | null;
  userId: string;
  onClose: () => void;
  onApply: () => void;
  onShared: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Recent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Recent | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        fetchOwnShareableRecent(userId, { search, limit: 6 })
          .then((rows) => {
            if (cancelled) return;
            setItems(rows);
            setFailed(false);
          })
          .catch(() => {
            if (cancelled) return;
            setItems([]);
            setFailed(true);
          });
      },
      search ? 300 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId, search]);

  const tileClass = cn(
    "flex h-full items-start gap-3 rounded-lg card-flat p-4 text-left transition-colors",
    "hover:border-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
  );

  return (
    <>
      <Modal onClose={onClose} labelledBy="create-post-title">
        <DialogShell data-create-post-modal="" className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden">
          <div className="flex shrink-0 items-start gap-3 px-5 pb-2 pt-5 sm:px-6">
            <div className="min-w-0 flex-1 space-y-1">
              <h2 id="create-post-title" className="font-display text-h2 font-bold text-text">
                {t("cs.post.title")}
              </h2>
              <p className="text-small text-text-muted">{communityName ? t("cs.post.sharedIn", { name: communityName }) : t("cs.post.sharedInThis")}</p>
            </div>
            <button type="button" onClick={onClose} aria-label={t("common.close")} className={iconButtonClassName(false, "h-10 w-10 bg-surface-soft")}>
              <X size={20} aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5 pt-3 sm:px-6">
            <section className="space-y-3" aria-labelledby="create-post-new">
              <p id="create-post-new" className="text-caption font-semibold text-text-muted">
                {t("cs.post.newSection")}
              </p>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {TYPES.map(({ type, icon: Icon, label, desc }) => (
                  <li key={type}>
                    <Link href={`${CREATE_HREF[type]}${CREATE_HREF[type].includes("?") ? "&" : "?"}community=${communityId}`} className={tileClass} data-post-new-type={type}>
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
                        <Icon size={20} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-body font-semibold text-text">{t(label)}</span>
                        <span className="block text-small text-text-muted">{t(desc)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-3" aria-labelledby="create-post-existing" data-post-existing="">
              <p id="create-post-existing" className="text-caption font-semibold text-text-muted">
                {t("cs.post.existingSection")}
              </p>
              <SearchField value={search} onChange={setSearch} placeholder={t("cs.post.search")} clearLabel={t("common.clear")} className="rounded-full" />
              {items === null ? (
                <div className="h-28 rounded-lg skeleton-shimmer" aria-busy="true" />
              ) : failed ? (
                <p role="alert" className="text-small text-danger">
                  {t("communities.feed.pickLoadError")}
                </p>
              ) : items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-small text-text-muted">{t("cs.post.empty")}</p>
              ) : (
                <ul className="divide-y divide-border-soft" data-post-recent="">
                  {items.map((item) => {
                    const Icon = ICON_OF[item.type as NewType] ?? SquareTerminal;
                    return (
                      <li key={`${item.type}:${item.id}`} className="flex items-center gap-3 py-3" data-post-recent-item={item.id}>
                        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-surface-soft text-text-secondary">
                          <Icon size={20} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body font-semibold text-text">{item.title || t("communities.feed.untitled")}</span>
                          <span className="block text-caption text-text-muted">
                            {t(`communities.feed.type.${item.type}` as TranslationKey)} · {formatRelativeTime(item.createdAt, language)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setPicked(item)}
                          data-post-recent-pick={item.id}
                          className="inline-flex h-9 shrink-0 items-center rounded-full border border-border-strong bg-surface px-4 text-small font-semibold text-text hover:border-primary hover:text-primary"
                        >
                          {t("cs.post.pick")}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button type="button" onClick={onApply} data-post-option="apply" className="min-h-9 text-small font-semibold text-primary hover:text-primary-hover">
                {t("cs.post.seeAll")}
              </button>
              <p className="text-caption text-text-muted">{t("cs.post.footnote")}</p>
            </section>
          </div>
        </DialogShell>
      </Modal>
      {picked && (
        <ShareNoteDialog
          communityId={communityId}
          type={picked.type}
          item={{ id: picked.id, title: picked.title || t("communities.feed.untitled") }}
          onClose={() => setPicked(null)}
          onShared={async () => {
            setPicked(null);
            await onShared();
          }}
        />
      )}
    </>
  );
}
