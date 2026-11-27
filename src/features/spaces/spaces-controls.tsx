"use client";

import { X } from "@/components/icons/x";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { SPACE_KIND_LABEL, SPACE_KINDS, SPACE_SORTS, type SpaceKind, type SpaceSort } from "@/lib/spaces";
import type { TranslationKey } from "@/lib/i18n/translations";
import { DialogShell } from "@/components/ui/dialog-shell";
import { iconButtonClassName } from "@/components/ui/icon-button";

const SORT_LABEL: Record<SpaceSort, TranslationKey> = {
  updated: "spaces.sort.updated",
  opened: "spaces.sort.opened",
  created: "spaces.sort.created",
  title: "spaces.sort.title",
};

/**
 * "Filtrele ve sırala" (docs/history/231-*): sıralama (eski açılır liste) + tür. Tür yüklenmiş Space'ler üzerinde
 * çalışır (sunucu RPC'si yalnız bölüm/sıralama/arama bilir); "Daha fazla" sonraki sayfayı getirir.
 */
export function SpacesFilterSheet({
  sort,
  onSort,
  kind,
  onKind,
  signedIn,
  onReset,
  onClose,
}: {
  sort: SpaceSort;
  onSort: (sort: SpaceSort) => void;
  kind: SpaceKind | null;
  onKind: (kind: SpaceKind | null) => void;
  signedIn: boolean;
  onReset: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dirty = sort !== "updated" || kind !== null;
  return (
    <Modal onClose={onClose} labelledBy="spaces-filter-title">
      <DialogShell role="document" className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-lg card-flat shadow-pop">
        <div className="flex items-center gap-2 px-5 pb-1 pt-4">
          <h2 id="spaces-filter-title" className="min-w-0 flex-1 text-h3 font-bold text-text">
            {t("spaces.home.filterTitle")}
          </h2>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className={iconButtonClassName(false, "h-10 w-10 rounded-md")}>
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5 pt-2">
          <fieldset className="space-y-2">
            <legend className="text-label font-semibold text-text-muted">{t("spaces.sort.label")}</legend>
            <div className="flex flex-wrap gap-2">
              {SPACE_SORTS.filter((key) => key !== "opened" || signedIn).map((key) => (
                <Chip key={key} selected={sort === key} onClick={() => onSort(key)}>
                  {t(SORT_LABEL[key])}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-label font-semibold text-text-muted">{t("spaces.filter.kind")}</legend>
            <div className="flex flex-wrap gap-2">
              <Chip selected={kind === null} onClick={() => onKind(null)}>
                {t("spaces.filter.all")}
              </Chip>
              {SPACE_KINDS.map((key) => (
                <Chip key={key} selected={kind === key} onClick={() => onKind(kind === key ? null : key)}>
                  {t(SPACE_KIND_LABEL[key])}
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border-soft px-5 py-3">
          <button type="button" onClick={onReset} disabled={!dirty} className="text-small font-semibold text-primary-text hover:underline disabled:pointer-events-none disabled:text-text-muted disabled:no-underline">
            {t("spaces.filter.reset")}
          </button>
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-sm bg-primary px-5 text-small font-semibold text-primary-foreground hover:bg-primary-hover">
            {t("spaces.filter.done")}
          </button>
        </div>
      </DialogShell>
    </Modal>
  );
}

/** Karo işaretinin dolgusu: tür başına bir renk (düz blok, simge yok; ad yanında yazılıdır). */
const KIND_SWATCH: Record<SpaceKind, string> = {
  moodboard: "bg-primary-text",
  character: "bg-text",
  brand: "bg-primary",
  game_world: "bg-text-muted",
  interior: "bg-primary-soft",
  free: "bg-border",
  team_area: "bg-border",
};

/** "Yeni bir Space başlatın" (Stil 2, docs/history/474-*): tür başına tek satırlık karo (renk işareti + ad); dokununca Yeni Space penceresi o türle açılır. */
export function SpaceTemplates({ onPick }: { onPick: (kind: SpaceKind) => void }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="spaces-templates" className="mb-5" data-testid="space-templates">
      <h2 id="spaces-templates" className="mb-2 text-caption font-semibold text-text-muted">
        {t("spaces.home.startNew")}
      </h2>
      <ul className="grid grid-cols-2 gap-[0.625rem] sm:grid-cols-3">
        {SPACE_KINDS.map((kind) => (
          <li key={kind} className="min-w-0">
            <button
              type="button"
              onClick={() => onPick(kind)}
              data-space-template={kind}
              className="flex h-14 w-full items-center gap-[0.625rem] rounded-md card-flat px-[0.875rem] text-left text-small font-semibold text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span aria-hidden className={cn("h-6 w-6 shrink-0 rounded-sm", KIND_SWATCH[kind])} />
              <span className="min-w-0 truncate">{t(SPACE_KIND_LABEL[kind])}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
