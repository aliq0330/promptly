"use client";

import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { fieldControlClassName } from "@/components/ui/field";

/**
 * The Başlık and Açıklama fields shared by every creation screen (Prompt,
 * Prompt İsteği, Generator, Workflow, Hazır Ayar), so they look and behave the
 * same everywhere: same label row (optional "*" / "(isteğe bağlı)" mark and an
 * optional live counter), same control height, same error line. The screens
 * differ only in copy, limits and validation, which come in through props.
 *
 * Shared field order of the five forms:
 *   Kategori → Başlık → Açıklama → Kapak/Görseller → Araç → (türe özgü içerik) → Etiketler → Görünürlük → Taslak/Paylaş
 */
interface CoreFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  /** Shows the red "*". */
  required?: boolean;
  /** Shows "(isteğe bağlı)" next to the label. */
  optional?: boolean;
  /** Shows "n/max" at the right of the label row. */
  showCounter?: boolean;
  error?: string | null;
  onBlur?: () => void;
  /** Native `required` attribute (browser validation) — only the Prompt form used it. */
  nativeRequired?: boolean;
}

function FieldLabel({ id, label, required, optional, counter }: { id: string; label: string; required?: boolean; optional?: boolean; counter?: string }) {
  const { t } = useTranslation();
  return (
    <label htmlFor={id} className="mb-1.5 flex items-center justify-between gap-2 text-sm font-medium text-text">
      <span>
        {label}
        {required && <span className="text-danger"> *</span>}
        {optional && <span className="font-normal text-text-muted"> ({t("common.optional")})</span>}
      </span>
      {counter && <span className="text-xs font-normal text-text-muted">{counter}</span>}
    </label>
  );
}

const CONTROL = fieldControlClassName;

export function TitleField({ id, label, value, onChange, placeholder, maxLength, required, optional, showCounter, error, onBlur, nativeRequired }: CoreFieldProps) {
  return (
    <div>
      <FieldLabel id={id} label={label} required={required} optional={optional} counter={showCounter && maxLength ? `${value.length}/${maxLength}` : undefined} />
      <input
        id={id}
        type="text"
        value={value}
        maxLength={maxLength}
        required={nativeRequired}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, "h-11", error ? "border-danger" : "border-border")}
      />
      {error && <p className="mt-1 text-caption text-danger">{error}</p>}
    </div>
  );
}

export function DescriptionField({ id, label, value, onChange, placeholder, maxLength, required, optional, showCounter, error, onBlur, nativeRequired }: CoreFieldProps) {
  return (
    <div>
      <FieldLabel id={id} label={label} required={required} optional={optional} counter={showCounter && maxLength ? `${value.length}/${maxLength}` : undefined} />
      <textarea
        id={id}
        rows={3}
        value={value}
        maxLength={maxLength}
        required={nativeRequired}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, "resize-none py-2", error ? "border-danger" : "border-border")}
      />
      {error && <p className="mt-1 text-caption text-danger">{error}</p>}
    </div>
  );
}
