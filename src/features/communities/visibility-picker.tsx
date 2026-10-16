"use client";

import { useId } from "react";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fieldLabelClassName } from "@/components/ui/field";
import { VISIBILITY_ICONS } from "./visibility-label";
import { VISIBILITY_HELP_KEYS, VISIBILITY_LABEL_KEYS, VISIBILITY_OPTIONS } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import type { GroupVisibility } from "@/types";

type Fact = "discover" | "search" | "content" | "chat" | "join";
const FACTS: readonly Fact[] = ["discover", "search", "content", "chat", "join"];

const FACT_LABEL_KEYS: Record<Fact, TranslationKey> = {
  discover: "communities.visibility.fact.discover",
  search: "communities.visibility.fact.search",
  content: "communities.visibility.fact.content",
  chat: "communities.visibility.fact.chat",
  join: "communities.visibility.fact.join",
};

const FACT_VALUE_KEYS: Record<GroupVisibility, Record<Fact, TranslationKey>> = {
  public: {
    discover: "communities.visibility.value.public.discover",
    search: "communities.visibility.value.public.search",
    content: "communities.visibility.value.public.content",
    chat: "communities.visibility.value.public.chat",
    join: "communities.visibility.value.public.join",
  },
  restricted: {
    discover: "communities.visibility.value.restricted.discover",
    search: "communities.visibility.value.restricted.search",
    content: "communities.visibility.value.restricted.content",
    chat: "communities.visibility.value.restricted.chat",
    join: "communities.visibility.value.restricted.join",
  },
  private: {
    discover: "communities.visibility.value.private.discover",
    search: "communities.visibility.value.private.search",
    content: "communities.visibility.value.private.content",
    chat: "communities.visibility.value.private.chat",
    join: "communities.visibility.value.private.join",
  },
};

/** Düzey × olgu: "açık" mı (yeşil onay) yoksa kısıtlı mı (kapalı işareti). Yalnızca görsel ipucu; metin her zaman yazılıdır (renge bağımlı değil). */
function isOpen(level: GroupVisibility, fact: Fact): boolean {
  if (fact === "chat") return false;
  if (fact === "discover") return level === "public";
  if (fact === "search") return level !== "private";
  if (fact === "content") return level === "public";
  return level === "public";
}

/**
 * Görünürlük seçici (oluşturma ve Ayarlar): üç düzey bir radyo grubunda; SEÇİLİ düzey vurgulanır ("Seçili" rozeti + çerçeve) ve her düzeyin
 * gizlilik sonuçları SEÇİMDEN ÖNCE görülür. Mobilde kompakt kartlar (her kartta olgu listesi), masaüstünde karşılaştırma tablosu.
 * `value` seçili/mevcut düzeydir; Ayarlar'da `onChange` onay penceresini açar, değer yalnız başarıdan sonra değişir.
 */
export function VisibilityPicker({
  value,
  onChange,
  disabled = false,
  name = "community-visibility",
  currentLabel,
}: {
  value: GroupVisibility;
  onChange: (next: GroupVisibility) => void;
  disabled?: boolean;
  name?: string;
  /** Verilirse seçili kartta "Seçili" yerine bu etiket (ör. Ayarlar'da "Şu anki"). */
  currentLabel?: string;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className={fieldLabelClassName}>{t("groups.visibility.label")}</legend>
      <div role="radiogroup" aria-label={t("communities.visibility.optionsAria")} className="grid gap-2 md:grid-cols-3">
        {VISIBILITY_OPTIONS.map((option) => {
          const Icon = VISIBILITY_ICONS[option];
          const selected = value === option;
          return (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-lg border bg-background px-3.5 py-3 text-sm text-text transition-colors duration-200 ease-soft focus-within:ring-2 focus-within:ring-primary/40 hover:border-border-strong",
                selected ? "border-primary bg-primary-soft/50 shadow-xs" : "border-border-soft",
                disabled && "cursor-not-allowed opacity-70",
              )}
            >
              <span className="flex items-start gap-2.5">
                <input
                  type="radio"
                  name={name}
                  value={option}
                  checked={selected}
                  onChange={() => onChange(option)}
                  aria-labelledby={`${baseId}-${option}-title`}
                  aria-describedby={`${baseId}-${option}-help`}
                  className="mt-1 accent-[var(--color-primary)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 font-medium">
                    <Icon size={14} aria-hidden />
                    <span id={`${baseId}-${option}-title`}>{t(VISIBILITY_LABEL_KEYS[option])}</span>
                    {selected && <Badge variant="accent">{currentLabel ?? t("communities.visibility.selected")}</Badge>}
                  </span>
                  <span id={`${baseId}-${option}-help`} className="mt-0.5 block text-caption text-text-muted">{t(VISIBILITY_HELP_KEYS[option])}</span>
                </span>
              </span>
              {/* Mobil: kompakt olgu listesi (masaüstünde aşağıdaki tablo gösterilir). */}
              <dl className="space-y-1 border-t border-border-soft pt-2 md:hidden">
                {FACTS.map((fact) => (
                  <div key={fact} className="flex items-start justify-between gap-3 text-caption">
                    <dt className="shrink-0 text-text-muted">{t(FACT_LABEL_KEYS[fact])}</dt>
                    <dd className="text-right text-text-secondary">{t(FACT_VALUE_KEYS[option][fact])}</dd>
                  </div>
                ))}
              </dl>
            </label>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-border-soft md:block">
        <table className="w-full table-fixed border-collapse text-left text-caption">
          <caption className="sr-only">{t("communities.visibility.comparisonCaption")}</caption>
          <thead>
            <tr className="bg-surface-soft/60">
              <th scope="col" className="w-1/4 px-3 py-2 font-medium text-text-muted" />
              {VISIBILITY_OPTIONS.map((option) => (
                <th key={option} scope="col" className={cn("px-3 py-2 font-semibold", value === option ? "bg-primary-soft/60 text-primary" : "text-text")}>
                  {t(VISIBILITY_LABEL_KEYS[option])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FACTS.map((fact) => (
              <tr key={fact} className="border-t border-border-soft">
                <th scope="row" className="px-3 py-2 align-top font-medium text-text-muted">
                  {t(FACT_LABEL_KEYS[fact])}
                </th>
                {VISIBILITY_OPTIONS.map((option) => (
                  <td key={option} className={cn("px-3 py-2 align-top text-text-secondary", value === option && "bg-primary-soft/30")}>
                    <span className="flex items-start gap-1.5">
                      {isOpen(option, fact) ? <Check size={12} className="mt-0.5 shrink-0 text-success" aria-hidden /> : <X size={12} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />}
                      <span>{t(FACT_VALUE_KEYS[option][fact])}</span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}
