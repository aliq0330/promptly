"use client";

import { X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { ScrollRow } from "@/components/ui/scroll-row";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { SPACE_KIND_LABEL, SPACE_KINDS, SPACE_SORTS, SPACE_VISIBILITIES, SPACE_VISIBILITY_LABEL, type SpaceKind, type SpaceSort, type SpaceVisibility } from "@/lib/spaces";
import type { TranslationKey } from "@/lib/i18n/translations";
import { SPACE_KIND_ICON, SPACE_KIND_TINT } from "./space-visuals";

const SORT_LABEL: Record<SpaceSort, TranslationKey> = {
  updated: "spaces.sort.updated",
  opened: "spaces.sort.opened",
  created: "spaces.sort.created",
  title: "spaces.sort.title",
};

/**
 * "Filtrele ve sırala" (docs/history/231-*): sıralama (eski açılır liste) + tür + görünürlük. Tür ve görünürlük yüklenmiş Space'ler üzerinde
 * çalışır (sunucu RPC'si yalnız bölüm/sıralama/arama bilir); "Daha fazla" sonraki sayfayı getirir.
 */
export function SpacesFilterSheet({
  sort,
  onSort,
  kind,
  onKind,
  visibility,
  onVisibility,
  signedIn,
  onReset,
  onClose,
}: {
  sort: SpaceSort;
  onSort: (sort: SpaceSort) => void;
  kind: SpaceKind | null;
  onKind: (kind: SpaceKind | null) => void;
  visibility: SpaceVisibility | null;
  onVisibility: (visibility: SpaceVisibility | null) => void;
  signedIn: boolean;
  onReset: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dirty = sort !== "updated" || kind !== null || visibility !== null;
  return (
    <Modal onClose={onClose} labelledBy="spaces-filter-title">
      <div role="document" onClick={(event) => event.stopPropagation()} className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-xl border border-border bg-surface shadow-pop">
        <div className="flex items-center gap-2 px-5 pb-1 pt-4">
          <h2 id="spaces-filter-title" className="min-w-0 flex-1 text-h3 font-semibold text-text">
            {t("spaces.home.filterTitle")}
          </h2>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={18} />
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
          <fieldset className="space-y-2">
            <legend className="text-label font-semibold text-text-muted">{t("spaces.filter.visibility")}</legend>
            <div className="flex flex-wrap gap-2">
              <Chip selected={visibility === null} onClick={() => onVisibility(null)}>
                {t("spaces.filter.all")}
              </Chip>
              {SPACE_VISIBILITIES.map((key) => (
                <Chip key={key} selected={visibility === key} onClick={() => onVisibility(visibility === key ? null : key)}>
                  {t(SPACE_VISIBILITY_LABEL[key])}
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border-soft px-5 py-3">
          <button type="button" onClick={onReset} disabled={!dirty} className="text-small font-semibold text-primary hover:underline disabled:pointer-events-none disabled:text-text-muted disabled:no-underline">
            {t("spaces.filter.reset")}
          </button>
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-small font-semibold text-primary-foreground hover:bg-primary-hover">
            {t("spaces.filter.done")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** "Yeni bir Space başlatın" (docs/history/231-*): tür başına renkli karo; dokununca Yeni Space penceresi o türle açılır. */
export function SpaceTemplates({ onPick }: { onPick: (kind: SpaceKind) => void }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="spaces-templates" className="space-y-3" data-testid="space-templates">
      <h2 id="spaces-templates" className="text-small text-text-muted">
        {t("spaces.home.startNew")}
      </h2>
      <ScrollRow as="ul" className="-mx-3 gap-3 px-3 sm:mx-0 sm:px-0">
        {SPACE_KINDS.map((kind) => {
          const Icon = SPACE_KIND_ICON[kind];
          return (
            <li key={kind} className="w-36 shrink-0 sm:w-40">
              <button type="button" onClick={() => onPick(kind)} data-space-template={kind} className="group block w-full space-y-2 text-left focus-visible:outline-none">
                <span className={cn("grid h-24 w-full place-items-center rounded-xl transition-transform duration-200 ease-soft group-active:scale-[0.97] group-focus-visible:ring-2 group-focus-visible:ring-primary", SPACE_KIND_TINT[kind])}>
                  <Icon size={36} strokeWidth={1.5} aria-hidden />
                </span>
                <span className="block truncate text-small font-medium text-text">{t(SPACE_KIND_LABEL[kind])}</span>
              </button>
            </li>
          );
        })}
      </ScrollRow>
    </section>
  );
}
