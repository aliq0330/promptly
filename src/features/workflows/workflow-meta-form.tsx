"use client";

import { MultiImagePicker } from "@/features/content/multi-image-picker";
import { composeBodyClassName, composeTitleClassName } from "@/features/content/compose";
import { ComposeBody, ContentTypePicker } from "@/features/content/compose-fields";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import type { MultiImageItem } from "@/lib/supabase/media-input";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";

export interface WorkflowMeta {
  title: string;
  description: string;
  media: MultiImageItem[];
  /** The workflow's main content type (same single-type picker as every other creation screen). The full `content_types` list stored on the row is this plus the types of the steps' linked content. */
  contentType: ContentTypeId;
  category: string | null;
  subcategory: string | null;
  tools: string[];
}

export const EMPTY_META: WorkflowMeta = { title: "", description: "", media: [], contentType: "image", category: null, subcategory: null, tools: [] };

/**
 * Workflow başlığı (docs/history/216-*): avatar + ad + tür hapı, başlık, açıklama ve küçük kapak şeridi — Prompt / İstek / Hazır ayarla
 * aynı düzen. Kategori, Araç ve Etiketler yazma ekranında değil "Paylaşmadan önce" penceresindedir (editör bunları alt sayfalarla açar).
 */
export function WorkflowMetaForm({
  meta,
  onChange,
  titleError,
  profile,
  audienceLabel,
  onAudience,
}: {
  meta: WorkflowMeta;
  onChange: (patch: Partial<WorkflowMeta>) => void;
  titleError?: boolean;
  profile: UserProfile | null;
  audienceLabel?: string;
  onAudience?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <ComposeBody
      profile={profile}
      audienceLabel={audienceLabel}
      onAudience={onAudience}
      typeSlot={<ContentTypePicker value={meta.contentType} onChange={(type) => onChange({ contentType: type, category: null, subcategory: null })} />}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-3">
          <div className="space-y-1.5">
            <input
              id="wf-title"
              value={meta.title}
              onChange={(event) => onChange({ title: event.target.value })}
              maxLength={120}
              placeholder={t("workflow.titlePlaceholder")}
              aria-label={t("workflow.titleLabel")}
              aria-invalid={Boolean(titleError)}
              className={composeTitleClassName}
            />
            {titleError && <p className="text-caption text-danger">{t("workflow.issueTitleRequired")}</p>}
          </div>
          <textarea
            id="wf-desc"
            value={meta.description}
            onChange={(event) => onChange({ description: event.target.value })}
            maxLength={1000}
            rows={2}
            placeholder={t("workflow.descriptionPlaceholder")}
            aria-label={t("workflow.descriptionLabel")}
            className={composeBodyClassName}
          />
        </div>
        <div className="sm:w-48">
          <MultiImagePicker variant="strip" max={4} items={meta.media} onChange={(media) => onChange({ media })} hint="" />
        </div>
      </div>
    </ComposeBody>
  );
}
