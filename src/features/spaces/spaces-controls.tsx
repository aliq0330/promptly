"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { ScrollRow } from "@/components/ui/scroll-row";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { SPACE_KIND_LABEL, SPACE_KINDS, SPACE_SORTS, SPACE_VISIBILITIES, SPACE_VISIBILITY_LABEL, type SpaceKind, type SpaceSort, type SpaceVisibility } from "@/lib/spaces";
import type { TranslationKey } from "@/lib/i18n/translations";
import { SPACE_KIND_ICON, SPACE_KIND_TINT } from "./space-visuals";

/** sm+ = açılır kutu, altı = alt sayfa (paylaşılan `Modal`). */
function useWide() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia("(min-width: 640px)");
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia("(min-width: 640px)").matches,
    () => false,
  );
}

export interface SectionMenuItem<K extends string> {
  key: K;
  label: string;
  /** Bekleyen sayı (davet) — mavi rozet. */
  count?: number;
}

/**
 * "Tümü ▾" (docs/history/231-*): bölüm balonlarının yerini alan TEK menü. Telefonda alt sayfa, masaüstünde açılır kutu; bekleyen
 * davet varken düğmede mavi nokta, "Davetler" satırında sayaç. Aynı seçenekler (Tümü · Benim · Paylaşılan · Sabitli · Herkese açık · Arşiv · Davetler).
 */
export function SpacesSectionMenu<K extends string>({ items, active, onChange, ariaLabel }: { items: SectionMenuItem<K>[]; active: K; onChange: (key: K) => void; ariaLabel: string }) {
  const { t } = useTranslation();
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = items.find((item) => item.key === active) ?? items[0];
  const pending = items.find((item) => item.count)?.count ?? 0;

  useEffect(() => {
    if (!open || !wide) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, wide]);

  const list = (
    <div role="radiogroup" aria-label={ariaLabel} className="space-y-0.5">
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            role="radio"
            aria-checked={selected}
            data-section-option={item.key}
            onClick={() => {
              onChange(item.key);
              setOpen(false);
            }}
            className={cn(
              "flex min-h-12 w-full items-center gap-2 rounded-lg px-3 text-left text-body transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              selected ? "font-semibold text-text" : "text-text-secondary",
              item.key === "invites" && "mt-1 border-t border-border-soft",
            )}
          >
            <span className="flex-1">{item.label}</span>
            {item.count ? <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-caption font-bold text-primary-foreground">{item.count}</span> : null}
            {selected && <Check size={18} className="text-primary" aria-hidden />}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        data-section-menu
        className="relative inline-flex h-11 items-center gap-2 rounded-xl bg-surface-soft pl-4 pr-3 text-body font-semibold text-text transition-colors hover:bg-border-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {current?.label}
        <ChevronDown size={18} aria-hidden className={cn("transition-transform", open && "rotate-180")} />
        {pending > 0 && <span aria-hidden data-section-dot className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />}
      </button>
      {open && wide && <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-border-soft bg-surface p-2 shadow-pop animate-pop-in">{list}</div>}
      {open && !wide && (
        <Modal onClose={() => setOpen(false)} labelledBy="spaces-section-title" variant="sheet">
          <div role="document" onClick={(event) => event.stopPropagation()} className="max-h-[85dvh] w-full overflow-y-auto rounded-t-xl bg-surface px-4 pb-6 pt-3 shadow-pop">
            <h2 id="spaces-section-title" className="px-3 pb-2 text-h3 font-semibold text-text">
              {t("spaces.home.title")}
            </h2>
            {list}
          </div>
        </Modal>
      )}
    </div>
  );
}

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
