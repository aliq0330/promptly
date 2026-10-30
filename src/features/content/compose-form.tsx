"use client";

import { createContext, useContext, useId, useState, type HTMLAttributes, type ReactNode } from "react";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/types";

/*
 * Oluşturma formunun ortak parçaları (docs/history/244-*, kullanıcı üç yön arasından "A · tek sayfa form"u seçti): Prompt, İstek,
 * Workflow ve Hazır ayar aynı iskeleti kullanır — başlıklı bölümler (`ComposeSection`), etiketli alanlar (`FormField`: Zorunlu /
 * opsiyonel işareti, ipucu, hata), tek satırda açılan isteğe bağlı ayrıntılar (`FormDisclosure`). Yeni bir oluşturma formu bunları kullanır.
 */

/**
 * "Stüdyo" düzeni (docs/history/286-*): `ComposeShell studio` içindeki formlar — bölüm başlığı, alan etiketi, satır içi ayrıntılar ve girdiler
 * mockup'taki gibi sade çizilir. Bağlam dışındaki (İstek, Workflow, Hazır ayar) formlar eskisi gibi kalır.
 */
const ComposeStudioContext = createContext(false);
export const ComposeStudioProvider = ComposeStudioContext.Provider;
export function useComposeStudio(): boolean {
  return useContext(ComposeStudioContext);
}

export const studioInputClassName =
  "w-full rounded-xl border border-border bg-surface px-3 py-[9px] text-[0.875rem] leading-normal text-text placeholder:text-text-muted transition-colors focus:border-primary focus:outline-none aria-[invalid=true]:border-danger";
export const studioTextareaClassName = cn(studioInputClassName, "resize-none");
/** Araç çubuğu çipi (Değişken ekle · Katalogdan · Görselden yardım · Yeni): `primary` = açık mavi dolgulu ana eylem. */
export function studioChipClassName(primary = false): string {
  return cn(
    "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-[0.78rem] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
    primary ? "border-transparent bg-primary-soft text-primary hover:bg-primary-soft/70" : "border-border bg-surface text-text-secondary hover:border-border-strong hover:bg-surface-soft",
  );
}

export const formInputClassName =
  "w-full rounded-xl border border-border-strong bg-surface px-3.5 text-body text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
export const formTextInputClassName = cn(formInputClassName, "h-12");
export const formTextareaClassName = cn(formInputClassName, "resize-none py-3");

/** Formun başlıklı bölümü: küçük BÜYÜK HARF başlık + alanlar; bölümler arasında ince çizgi. */
export function ComposeSection({ title, children, ...rest }: { title: string; children: ReactNode } & Omit<HTMLAttributes<HTMLElement>, "title">) {
  const studio = useComposeStudio();
  if (studio) {
    return (
      <section className="flex flex-col gap-3.5" {...rest}>
        <h2 className="font-display text-[1.0625rem] font-bold leading-snug text-text">{title}</h2>
        {children}
      </section>
    );
  }
  return (
    <section className="border-t border-border-soft pt-6 first:border-t-0 first:pt-0" {...rest}>
      <h2 className="mb-4 font-sans text-caption font-bold uppercase tracking-[0.06em] text-text-secondary">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

/** Etiketli alan: etiket + "Zorunlu" / "opsiyonel", altında ipucu ya da (varsa) hata. `htmlFor` verilmezse etiket bir grup adıdır. */
export function FormField({
  label,
  htmlFor,
  required = false,
  optional = false,
  hint,
  error,
  counter,
  children,
  ...rest
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string | null;
  /** Stüdyo düzeninde etiketin sağındaki sayaç ("19/80"). */
  counter?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  const { t } = useTranslation();
  const studio = useComposeStudio();
  const labelId = useId();
  const labelClass = studio ? "text-[0.84375rem] font-bold text-text" : "text-body font-semibold text-text";
  return (
    <div className={studio ? "space-y-1.5" : "space-y-2"} role={htmlFor ? undefined : "group"} aria-labelledby={htmlFor ? undefined : labelId} {...rest}>
      <div className="flex items-baseline gap-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className={labelClass}>
            {label}
          </label>
        ) : (
          <span id={labelId} className={labelClass}>
            {label}
          </span>
        )}
        {required && <span className={studio ? "text-[0.71875rem] text-text-muted" : "text-caption font-semibold text-secondary"}>{t("compose.required")}</span>}
        {optional && <span className={studio ? "text-[0.71875rem] text-text-muted" : "text-caption text-text-muted"}>{t("common.optional")}</span>}
        {studio && counter && <span className="ml-auto text-[0.71875rem] tabular-nums text-text-muted">{counter}</span>}
      </div>
      {children}
      {error ? (
        studio ? (
          <p data-field-error="" className="flex items-center gap-1.5 text-[0.78rem] text-danger">
            <AlertCircle size={14} aria-hidden className="shrink-0" />
            {error}
          </p>
        ) : (
          <p data-field-error="" className="text-caption font-semibold text-danger">
            {error}
          </p>
        )
      ) : hint ? (
        <p className={studio ? "text-[0.75rem] text-text-muted" : "text-caption text-text-muted"}>{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Tek satırlık ayrıntı: etiket + seçili değer + ok; dokununca altında kendi seçicisi açılır (eskiden ayrı alt sayfaydı).
 * İsteğe bağlı ayrıntılarda (Araç, Kategori, Etiketler, DNA…) kullanılır; sayfa kısa kalır, seçili değer satırda görünür.
 */
export function FormDisclosure({
  id,
  label,
  hint,
  value,
  badge,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  /** Seçili değer (sağda); boşsa "Seçilmedi". */
  value?: string;
  /** Turuncu sayı: bekleyen öneri sayısı. */
  badge?: number;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const studio = useComposeStudio();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (studio) {
    return (
      <div data-form-row={id} className="border-b border-border-soft">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-12 w-full items-center gap-2.5 px-0.5 py-[13px] text-left text-[0.875rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="shrink-0 font-semibold text-text">{label}</span>
          {badge ? (
            <span aria-hidden className="shrink-0 rounded-full bg-secondary px-1.5 text-caption font-bold leading-4 text-background">
              {badge}
            </span>
          ) : null}
          <span className={cn("ml-auto min-w-0 truncate text-right", value ? "text-[0.8125rem] font-semibold text-primary" : "text-[0.8125rem] text-text-muted")}>
            {value || hint || t("compose.notChosen")}
          </span>
          <ChevronRight size={16} aria-hidden className={cn("shrink-0 text-text-muted transition-transform", open && "rotate-90")} />
        </button>
        {open && (
          <div id={panelId} className="pb-3.5 pt-1">
            {children}
          </div>
        )}
      </div>
    );
  }
  return (
    <div data-form-row={id} className="rounded-xl border border-border-strong bg-surface">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-text">{label}</span>
          {hint && <span className="block truncate text-caption text-text-muted">{hint}</span>}
        </span>
        {badge ? (
          <span aria-hidden className="shrink-0 rounded-full bg-secondary px-1.5 text-caption font-bold leading-4 text-background">
            {badge}
          </span>
        ) : null}
        <span className="max-w-[40%] shrink-0 truncate text-small text-text-muted">{value || t("compose.notChosen")}</span>
        <ChevronDown size={18} aria-hidden className={cn("shrink-0 text-text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={panelId} className="border-t border-border-soft p-3.5">
          {children}
        </div>
      )}
    </div>
  );
}

/** Stüdyo düzeninde satır içi ayrıntıların üstüne ince çizgi çeker (alttaki çizgileri satırların kendisi çizer). Bağlam dışında yalnız aralık verir. */
export function FormDisclosureGroup({ children }: { children: ReactNode }) {
  const studio = useComposeStudio();
  return <div className={studio ? "border-t border-border-soft" : "space-y-5"}>{children}</div>;
}

/** Yalnız bir topluluğa yazılırken formun üstünde görünen satır ("Ali · Açık Topluluk"); dokununca "Kim görsün?" bölümüne götürür. */
export function ComposeAudienceLine({ profile, label, onClick }: { profile: UserProfile | null; label: string; onClick: () => void }) {
  return (
    <div className="mb-5 flex items-center gap-2.5">
      <Avatar src={profile?.avatarUrl ?? null} alt={profile?.displayName ?? ""} size={32} className="shrink-0" />
      <p className="min-w-0 truncate text-body font-bold text-text">
        {profile?.displayName ?? ""}
        <span className="font-normal text-text-muted"> · </span>
        <button type="button" onClick={onClick} data-compose-audience="" className="font-medium text-text-muted underline-offset-2 hover:text-text hover:underline">
          {label}
        </button>
      </p>
    </div>
  );
}
