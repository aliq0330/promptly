"use client";

import { Children, type ReactNode } from "react";
import { Users } from "lucide-react";
import { useCommunityContext } from "@/features/communities/community-return";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { ContentVisibility } from "@/types";
import { FormSection } from "./form-section";
import { VisibilitySwitch } from "./visibility-switch";

/**
 * The end of every creation form (Prompt, Prompt İsteği, Generator, Workflow,
 * Hazır Ayar), always the same:
 *
 *   ┌ Görünürlük card ─────┐   [switch] (+ `extra`, e.g. an answer's "show on profile")
 *   └──────────────────────┘
 *   ┌ actions card ────────┐   [Taslağa kaydet] [Paylaş]
 *   └──────────────────────┘
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
  /** Notices/errors rendered between the switch and the buttons. */
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const hasNotices = Children.toArray(children).length > 0;
  // Topluluktan açıldıysa (`?community=`): içerik topluluğa ÖZGÜDÜR — görünürlük seçilmez (yalnız topluluğu okuyabilenler görür) ve taslak olmaz.
  const community = useCommunityContext();
  const inCommunity = community.communityId !== null;
  const showVisibility = visibility !== undefined && onVisibilityChange !== undefined && !inCommunity;
  return (
    <div className={cn("min-w-0 space-y-4", className)} data-create-form-actions>
      {inCommunity && (
        <p role="status" data-community-context className="flex items-start gap-2 rounded-lg bg-primary-soft px-3.5 py-3 text-small text-text">
          <Users size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 break-words">
            {community.name ? t("communities.create.contextBanner", { name: community.name }) : t("communities.create.contextBannerGeneric")}
          </span>
        </p>
      )}
      {(showVisibility || extra) && (
        <FormSection title={t("visibility.label")}>
          <div className="space-y-3">
            {showVisibility && <VisibilitySwitch value={visibility} onChange={onVisibilityChange} disabled={busy} hideLabel />}
            {extra}
          </div>
        </FormSection>
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
            disabled={busy || publishDisabled}
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
