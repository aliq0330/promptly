"use client";

import { useState } from "react";
import { Globe, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAME_MAX = 80;

/**
 * Shared name + visibility form, used both for creating a new collection
 * (embedded inside SaveToCollectionModal, or standalone from the profile
 * page) and for editing an existing one (CollectionFormModal). No modal
 * chrome of its own — the caller supplies that, so the same fields render
 * identically in both contexts.
 */
export function CollectionForm({
  initialName = "",
  initialVisibility = "private",
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialVisibility?: "public" | "private";
  submitLabel: string;
  onSubmit: (values: { name: string; visibility: "public" | "private" }) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [visibility, setVisibility] = useState<"public" | "private">(initialVisibility);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= NAME_MAX;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: trimmed, visibility });
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem başarısız oldu, lütfen tekrar dene.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="collection-name" className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Koleksiyon adı
        </label>
        <input
          id="collection-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={NAME_MAX}
          placeholder="Koleksiyon adını yaz..."
          autoFocus
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="text-right text-xs text-text-muted">
          {trimmed.length}/{NAME_MAX}
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Gizlilik</p>
        <div className="space-y-2">
          <VisibilityOption
            icon={Globe}
            title="Herkese açık"
            description="Koleksiyonunu herkes görebilir."
            selected={visibility === "public"}
            onSelect={() => setVisibility("public")}
          />
          <VisibilityOption
            icon={Lock}
            title="Sadece ben"
            description="Sadece sen görebilirsin."
            selected={visibility === "private"}
            onSelect={() => setVisibility("private")}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            İptal
          </Button>
        )}
        <Button type="submit" disabled={!isValid || isSubmitting} className={onCancel ? undefined : "w-full justify-center"}>
          {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function VisibilityOption({
  icon: Icon,
  title,
  description,
  selected,
  onSelect,
}: {
  icon: typeof Globe;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
        selected ? "border-primary bg-accent-surface" : "border-border hover:bg-accent-surface/50",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-primary" : "border-border",
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium text-text">
          <Icon size={14} />
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-text-muted">{description}</span>
      </span>
    </button>
  );
}
