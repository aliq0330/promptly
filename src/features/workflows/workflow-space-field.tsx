"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Lock, Plus } from "lucide-react";
import { FormDisclosure } from "@/features/content/compose-form";
import { SwitchRow } from "@/features/content/visibility-switch";
import { SpaceCoverArt } from "@/features/spaces/space-visuals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchWorkflowSpaceLinks } from "@/lib/supabase/workflow-flow";
import { EMPTY_SPACE_CHOICE, type WorkflowSpaceChoice } from "@/lib/supabase/workflow-space";
import { listEditableSpaces, summaryArt, type SpaceSummary } from "@/lib/supabase/spaces";
import { cn } from "@/lib/utils";
import type { ContentVisibility } from "@/types";

/**
 * Formun "Space'te göster" kararı (docs/history/261-*). Düzenlemede workflow'un düzenleyebildiğin Space'lerdeki mevcut bağı bir kez
 * okunur ve seçimi önceden doldurur; yeni workflow'da kapalı başlar. Karar kaydedilince (yayında) `applyWorkflowSpaceChoice` uygular.
 */
export function useWorkflowSpaceChoice(workflowId: string | null, userId: string | null) {
  const [choice, setChoice] = useState<WorkflowSpaceChoice>(EMPTY_SPACE_CHOICE);
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const prefilled = useRef(false);
  const touched = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    listEditableSpaces().then(
      (list) => !cancelled && setSpaces(list),
      () => {
        if (!cancelled) {
          setSpaces([]);
          setFailed(true);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Düzenleme: var olan bağ (yalnız düzenleyebildiğin Space'ler) seçimi doldurur; kullanıcı dokunduktan sonra ezilmez.
  useEffect(() => {
    if (!workflowId || !spaces || prefilled.current) return;
    prefilled.current = true;
    let cancelled = false;
    fetchWorkflowSpaceLinks(workflowId).then((links) => {
      if (cancelled || touched.current) return;
      const editable = new Set(spaces.map((space) => space.id));
      const link = links.find((entry) => editable.has(entry.spaceId));
      if (link) {
        setChoice({ enabled: true, spaceId: link.spaceId, showIo: link.showIo, showLinks: link.showLinks, showRelations: link.showRelations, existing: { itemId: link.itemId, spaceId: link.spaceId } });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workflowId, spaces]);

  function update(next: WorkflowSpaceChoice) {
    touched.current = true;
    setChoice(next);
  }
  /** Kaydedildikten sonra: seçim artık "var olan bağ"dır (bir sonraki Paylaş'ta çift öğe açılmasın). */
  function settle(linked: { itemId: string; spaceId: string } | null) {
    setChoice((current) => (linked ? { ...current, enabled: true, spaceId: linked.spaceId, existing: linked } : { ...current, enabled: false, spaceId: null, existing: null }));
  }
  return { choice, update, settle, spaces, failed };
}

export function WorkflowSpaceField({
  choice,
  onChange,
  spaces,
  failed,
  workflowVisibility,
  isDraft,
}: {
  choice: WorkflowSpaceChoice;
  onChange: (next: WorkflowSpaceChoice) => void;
  spaces: SpaceSummary[] | null;
  failed: boolean;
  workflowVisibility: ContentVisibility;
  /** Taslakta kaydedilen workflow Space'e eklenmez; bağ yayınlayınca kurulur. */
  isDraft: boolean;
}) {
  const { t } = useTranslation();
  const selected = choice.spaceId && choice.spaceId !== "new" ? (spaces?.find((space) => space.id === choice.spaceId) ?? null) : null;
  const spaceIsPublic = selected ? selected.visibility === "public" : false;
  const summary = !choice.enabled ? t("wfSpace.field.off") : choice.spaceId === "new" ? t("wfSpace.field.newSpace") : (selected?.title ?? t("compose.notChosen"));

  let note: { text: string; warn: boolean } | null = null;
  if (choice.enabled && choice.spaceId) {
    if (workflowVisibility === "private") note = { text: t("wfSpace.field.noteWorkflowPrivate"), warn: true };
    else if (choice.spaceId === "new" || (selected && !spaceIsPublic)) note = { text: t("wfSpace.field.noteSpacePrivate"), warn: true };
    else if (selected) note = { text: t("wfSpace.field.notePublic"), warn: false };
  }

  const layers: { key: "showIo" | "showLinks" | "showRelations"; label: string; hint: string }[] = [
    { key: "showIo", label: t("wfSpace.layer.io"), hint: t("wfSpace.layer.ioHint") },
    { key: "showLinks", label: t("wfSpace.layer.links"), hint: t("wfSpace.layer.linksHint") },
    { key: "showRelations", label: t("wfSpace.layer.relations"), hint: t("wfSpace.layer.relationsHint") },
  ];

  return (
    <FormDisclosure id="space" label={t("wfSpace.field.label")} hint={t("wfSpace.field.hint")} value={summary}>
      <div className="space-y-4">
        <SwitchRow
          checked={choice.enabled}
          onChange={(enabled) => onChange({ ...choice, enabled })}
          icon={<Plus size={18} />}
          title={choice.enabled ? t("wfSpace.field.on") : t("wfSpace.field.off")}
          description={t("wfSpace.field.switchHint")}
          ariaLabel={t("wfSpace.field.label")}
        />

        {choice.enabled && (
          <>
            <div role="radiogroup" aria-label={t("wfSpace.field.pick")} className="space-y-2">
              {spaces === null && <p className="text-small text-text-muted">{t("common.loading")}</p>}
              {failed && <p className="text-small text-danger">{t("wfSpace.field.loadFailed")}</p>}
              {(spaces ?? []).map((space) => {
                const active = choice.spaceId === space.id;
                return (
                  <button
                    key={space.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChange({ ...choice, spaceId: space.id })}
                    className={cn("flex w-full items-center gap-3 rounded-xl border bg-surface p-2.5 text-left transition-colors", active ? "border-primary ring-1 ring-primary" : "border-border hover:bg-surface-soft")}
                  >
                    <span className={cn("h-4 w-4 shrink-0 rounded-full border-2", active ? "border-[5px] border-primary" : "border-border-strong")} aria-hidden />
                    <SpaceCoverArt urls={summaryArt(space)} className="h-10 w-10 shrink-0 overflow-hidden rounded-lg" iconSize={16} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-semibold text-text">{space.title}</span>
                      <span className="block truncate text-caption text-text-muted">{t("spaces.count.images", { count: space.imageCount })} · {t("spaces.count.prompts", { count: space.promptCount })}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-soft px-2 py-0.5 text-caption font-semibold text-text-secondary">
                      {space.visibility === "public" ? <Globe size={12} aria-hidden /> : <Lock size={12} aria-hidden />}
                      {t(space.visibility === "public" ? "spaces.visibility.public" : space.visibility === "link" ? "spaces.visibility.link" : "spaces.visibility.private")}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                role="radio"
                aria-checked={choice.spaceId === "new"}
                onClick={() => onChange({ ...choice, spaceId: "new" })}
                className={cn("flex w-full items-center gap-3 rounded-xl border bg-surface p-2.5 text-left transition-colors", choice.spaceId === "new" ? "border-primary ring-1 ring-primary" : "border-border hover:bg-surface-soft")}
              >
                <span className={cn("h-4 w-4 shrink-0 rounded-full border-2", choice.spaceId === "new" ? "border-[5px] border-primary" : "border-border-strong")} aria-hidden />
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-soft text-text-secondary">
                  <Plus size={16} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold text-text">{t("wfSpace.field.newSpace")}</span>
                  <span className="block text-caption text-text-muted">{t("wfSpace.field.newSpaceHint")}</span>
                </span>
              </button>
            </div>

            <div>
              <p className="mb-2 text-caption font-bold uppercase tracking-[0.06em] text-text-secondary">{t("wfSpace.import.layers")}</p>
              <div className="space-y-2">
                {layers.map((row) => (
                  <label key={row.key} className="flex items-start gap-2.5 text-small text-text">
                    <input type="checkbox" checked={choice[row.key]} onChange={(event) => onChange({ ...choice, [row.key]: event.target.checked })} className="mt-1 h-4 w-4 accent-primary" />
                    <span>
                      <span className="block font-medium">{row.label}</span>
                      <span className="block text-caption text-text-muted">{row.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {note && (
              <p role="status" className={cn("flex items-start gap-2 rounded-xl px-3 py-2 text-small text-text-secondary", note.warn ? "bg-warning/10" : "bg-primary-soft")}>
                {note.warn ? <Lock size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden /> : <Globe size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden />}
                {note.text}
              </p>
            )}
            {isDraft && <p className="text-caption text-text-muted">{t("wfSpace.field.draftHint")}</p>}
          </>
        )}
      </div>
    </FormDisclosure>
  );
}
