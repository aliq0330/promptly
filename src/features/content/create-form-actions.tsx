"use client";

import { Children, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Megaphone } from "lucide-react";
import { useCommunityContext } from "@/features/communities/community-return";
import { AnnouncePicker, setPendingAnnounce, useAnnounceCommunities, type AnnounceSelection } from "@/features/communities/announce-picker";
import { useAuth } from "@/features/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { ContentVisibility } from "@/types";
import { FormSection } from "./form-section";
import { AudienceField, useDestinationBlock, type Audience } from "./share-destination-field";

/**
 * The end of every creation form (Prompt, Prompt İsteği, Generator, Workflow,
 * Hazır Ayar), always the same:
 *
 *   ┌ Görünürlük card ─────┐   [switch] (+ `extra`, e.g. an answer's "show on profile")
 *   └──────────────────────┘
 *   ┌ actions card ────────┐   [Taslağa kaydet] [Paylaş]
 *   └──────────────────────┘
 *
 * Above them sits the "Kim görsün?" field (`AudienceField`, docs/history/215-*; replaces 197's destination picker + the visibility
 * switch): Herkese açık / Sadece ben / Sadece bir topluluk. A community makes the content community-only (no draft). Public content can
 * also be announced in communities ("Topluluklarda da duyur"): the selection is sent once the content exists (`runPendingAnnounce`,
 * called from the forms' `useCommunityReturn`), and a sentence says what will happen.
 *
 * "Paylaş" is the primary action; with no `onPublish` it is the form's submit
 * button, so the form's own `onSubmit` (and its validation) stays the single
 * publish path. `onSaveDraft` omitted = no draft button (editing something
 * already published, or a mode that can't be a draft).
 */
export function CreateFormActions({
  visibility,
  onVisibilityChange,
  extra,
  onSaveDraft,
  onPublish,
  publishLabel,
  saveDraftLabel,
  busy = false,
  publishDisabled = false,
  hideDestination = false,
  children,
  className,
}: {
  /** Omit (with `onVisibilityChange`) when the mode must stay public, e.g. an answer to a request. */
  visibility?: ContentVisibility;
  onVisibilityChange?: (next: ContentVisibility) => void;
  /** Extra switch rows shown under the visibility switch. */
  extra?: ReactNode;
  onSaveDraft?: () => void;
  /** When set the primary button is a plain button calling it; otherwise it submits the surrounding form. */
  onPublish?: () => void;
  publishLabel?: string;
  saveDraftLabel?: string;
  busy?: boolean;
  /** Disables only the primary button (e.g. blocking validation errors), not the draft button. */
  publishDisabled?: boolean;
  /** Editing something already published: it cannot move, so there is no destination picker. */
  hideDestination?: boolean;
  /** Notices/errors rendered between the switch and the buttons. */
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const hasNotices = Children.toArray(children).length > 0;
  // Topluluktan açıldıysa (`?community=`) ya da seçildiyse: içerik topluluğa ÖZGÜDÜR — görünürlük seçilmez (yalnız topluluğu okuyabilenler görür) ve taslak olmaz.
  const community = useCommunityContext();
  const inCommunity = community.communityId !== null;
  const blockedReason = useDestinationBlock(hideDestination ? null : community.communityId);
  const canChooseVisibility = visibility !== undefined && onVisibilityChange !== undefined;
  const audience: Audience = inCommunity ? "community" : visibility === "private" ? "private" : "public";
  const allowCommunity = !hideDestination;
  const showAudience = canChooseVisibility || allowCommunity;

  // "Topluluklarda da duyur": yalnız yeni + herkese açık içerikte (düzenlemede yok; özel/topluluğa özgü içerik duyurulamaz).
  const canAnnounce = Boolean(user) && !hideDestination && audience === "public";
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [announce, setAnnounce] = useState<AnnounceSelection>({ communityIds: [], note: "" });
  const communities = useAnnounceCommunities(canAnnounce && announceOpen);
  const announceCount = canAnnounce ? announce.communityIds.length : 0;
  useEffect(() => {
    setPendingAnnounce(canAnnounce ? announce : null, new Map(communities.list.map((item) => [item.id, item.name])));
  }, [canAnnounce, announce, communities.list]);
  useEffect(() => () => setPendingAnnounce(null, new Map()), []);

  const summary =
    audience === "community"
      ? t("publish.summary.community", { name: community.name ?? "…" })
      : audience === "private"
        ? t("publish.summary.private")
        : announceCount > 0
          ? t("publish.summary.publicAnnounce", { count: announceCount })
          : t("publish.summary.public");

  return (
    <div className={cn("min-w-0 space-y-4", className)} data-create-form-actions>
      {showAudience ? (
        <AudienceField
          value={audience}
          onVisibilityChange={canChooseVisibility ? onVisibilityChange : undefined}
          allowPrivate={canChooseVisibility}
          allowCommunity={allowCommunity}
          blockedReason={blockedReason}
          disabled={busy}
        >
          {extra}
        </AudienceField>
      ) : (
        extra && (
          <FormSection title={t("visibility.label")}>
            <div className="space-y-3">{extra}</div>
          </FormSection>
        )
      )}
      {canAnnounce && (
        <FormSection>
          <button
            type="button"
            onClick={() => setAnnounceOpen((open) => !open)}
            aria-expanded={announceOpen}
            data-publish-announce-toggle=""
            className="flex w-full items-center gap-3 text-left"
          >
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
              <Megaphone size={17} strokeWidth={1.9} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-label font-semibold text-text">
                {t("publish.announceTitle")}
                {announceCount > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-caption text-primary-foreground">{announceCount}</span>}
              </span>
              <span className="block text-caption text-text-muted">{t("publish.announceHint")}</span>
            </span>
            <ChevronDown size={18} aria-hidden className={cn("shrink-0 text-text-muted transition-transform", announceOpen && "rotate-180")} />
          </button>
          {announceOpen && (
            <div className="mt-3">
              <AnnouncePicker value={announce} onChange={setAnnounce} communities={communities.list} status={communities.status} disabled={busy} />
            </div>
          )}
        </FormSection>
      )}
      {showAudience && (
        <p data-publish-summary={audience} className="px-1 text-small text-text-secondary">
          {summary}
        </p>
      )}
      <FormSection>
        {hasNotices && <div className="mb-4 space-y-3">{children}</div>}
        <div className="flex gap-2 sm:justify-end">
          {onSaveDraft && !inCommunity && (
            <Button type="button" variant="outline" size="lg" disabled={busy} onClick={onSaveDraft} className="min-w-0 flex-1 px-4 sm:flex-none sm:px-6" data-action="save-draft">
              {saveDraftLabel ?? t("createActions.saveDraft")}
            </Button>
          )}
          <Button
            type={onPublish ? "button" : "submit"}
            size="lg"
            disabled={busy || publishDisabled || blockedReason !== null}
            onClick={onPublish}
            className={cn("min-w-0 px-4 sm:px-8", onSaveDraft ? "flex-1 sm:flex-none" : "w-full sm:w-auto")}
            data-action="publish"
          >
            {publishLabel ?? t("common.share")}
          </Button>
        </div>
      </FormSection>
    </div>
  );
}
