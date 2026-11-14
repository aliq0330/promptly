"use client";

import { useState } from "react";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { ContentPickerDialog } from "@/features/teams/content-picker";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { Button } from "@/components/ui/button";
import { addItemToCollection } from "@/lib/supabase/collections";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { IconComponent } from "@/components/icons/icon";
import type { TranslationKey } from "@/lib/i18n/translations";

type AddKind = "prompt" | "workflow" | "preset";

const ROWS: { kind: AddKind; icon: IconComponent; label: TranslationKey }[] = [
  { kind: "prompt", icon: SquareTerminal, label: "feed.filterPrompts" },
  { kind: "workflow", icon: WorkflowIcon, label: "nav.workflows" },
  { kind: "preset", icon: SlidersHorizontal, label: "nav.presets" },
];

/**
 * "İçerik ekle" (docs/history/386-*): ortak koleksiyona (ve sahibin kendi koleksiyonuna) Prompt / Workflow / Ayar paketi ekler. Seçme penceresi
 * ekip dosyasındaki `ContentPickerDialog`'un aynısıdır (Paylaştıklarım / Başkalarının paylaştıkları, gelişmiş arama) — ikinci bir seçici yazılmadı.
 * Eklemeyi veritabanı denetler (yalnız herkese açık, yayında içerik; `added_by` sunucuda yazılır).
 */
export function CollectionAddContent({
  collectionId,
  alreadyKeys,
  onClose,
  onAdded,
}: {
  collectionId: string;
  /** `${tür}:${kimlik}` — koleksiyonda zaten olan içerikler ("Eklendi" işaretlenir). */
  alreadyKeys: ReadonlySet<string>;
  onClose: () => void;
  /** Bir içerik eklendi: sayfa listeyi yeniden okur. */
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<AddKind | null>(null);

  if (kind) {
    const already = new Set([...alreadyKeys].filter((key) => key.startsWith(`${kind}:`)).map((key) => key.slice(kind.length + 1)));
    return (
      <ContentPickerDialog
        kind={kind}
        alreadyIds={already}
        onClose={() => {
          setKind(null);
          onClose();
        }}
        onPick={async (item) => {
          await addItemToCollection(collectionId, item.id, kind);
          onAdded();
        }}
      />
    );
  }

  return (
    <SpaceDialog
      title={t("collab.addTitle")}
      onClose={onClose}
      overLayers
      footer={
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      }
    >
      <p className="mb-3 text-caption text-text-muted">{t("collab.addHint")}</p>
      <ul className="space-y-2">
        {ROWS.map((row) => (
          <li key={row.kind}>
            <button
              type="button"
              onClick={() => setKind(row.kind)}
              data-collection-add-kind={row.kind}
              className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-left text-small font-medium text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
                <row.icon size={18} aria-hidden />
              </span>
              {t(row.label)}
            </button>
          </li>
        ))}
      </ul>
    </SpaceDialog>
  );
}
