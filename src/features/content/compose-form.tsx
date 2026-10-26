"use client";

import { useId, useState, type HTMLAttributes, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/types";

/*
 * Oluşturma formunun ortak parçaları (docs/history/244-*, kullanıcı üç yön arasından "A · tek sayfa form"u seçti): Prompt, İstek,
 * Workflow ve Hazır ayar aynı iskeleti kullanır — başlıklı bölümler (`ComposeSection`), etiketli alanlar (`FormField`: Zorunlu /
 * opsiyonel işareti, ipucu, hata), tek satırda açılan isteğe bağlı ayrıntılar (`FormDisclosure`). Yeni bir oluşturma formu bunları kullanır.
 */

export const formInputClassName =
  "w-full rounded-xl border border-border-strong bg-surface px-3.5 text-body text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
export const formTextInputClassName = cn(formInputClassName, "h-12");
export const formTextareaClassName = cn(formInputClassName, "resize-none py-3");

/** Formun başlıklı bölümü: küçük BÜYÜK HARF başlık + alanlar; bölümler arasında ince çizgi. */
export function ComposeSection({ title, children, ...rest }: { title: string; children: ReactNode } & Omit<HTMLAttributes<HTMLElement>, "title">) {
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
  children,
  ...rest
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string | null;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  const { t } = useTranslation();
  const labelId = useId();
  const labelClass = "text-body font-semibold text-text";
  return (
    <div className="space-y-2" role={htmlFor ? undefined : "group"} aria-labelledby={htmlFor ? undefined : labelId} {...rest}>
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
        {required && <span className="text-caption font-semibold text-secondary">{t("compose.required")}</span>}
        {optional && <span className="text-caption text-text-muted">{t("common.optional")}</span>}
      </div>
      {children}
      {error ? (
        <p data-field-error="" className="text-caption font-semibold text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-caption text-text-muted">{hint}</p>
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
  const [open, setOpen] = useState(false);
  const panelId = useId();
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
