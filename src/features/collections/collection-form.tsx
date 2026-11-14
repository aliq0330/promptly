"use client";

import { useEffect, useState } from "react";
import { Globe } from "@/components/icons/globe";
import { Loader2 } from "@/components/icons/loader-2";
import { Lock } from "@/components/icons/lock";
import { TriangleAlert } from "@/components/icons/triangle-alert";
import { Users } from "@/components/icons/users";
import { Button } from "@/components/ui/button";
import { fetchUnshareableItems, removeCollectionItemById, type UnshareableItem } from "@/lib/supabase/collection-members";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

const NAME_MAX = 80;

/**
 * Shared name + visibility form, used both for creating a new collection
 * (embedded inside SaveToCollectionModal, or standalone from the profile
 * page) and for editing an existing one (CollectionFormModal). No modal
 * chrome of its own — the caller supplies that, so the same fields render
 * identically in both contexts.
 */
export interface CollectionFormValues {
  name: string;
  visibility: "public" | "private";
  /** Ortak çalışma (docs/history/386-*): yalnız `showSharing` formlarında; diğerlerinde hep false. */
  shared: boolean;
}

export function CollectionForm({
  initialName = "",
  initialVisibility = "private",
  submitLabel,
  onSubmit,
  onCancel,
  showSharing = false,
  initialShared = false,
  collectionId,
  memberCount = 0,
}: {
  initialName?: string;
  initialVisibility?: "public" | "private";
  submitLabel: string;
  onSubmit: (values: CollectionFormValues) => Promise<void>;
  onCancel?: () => void;
  /** "Ortak çalışma" anahtarı (koleksiyonu oluştururken ve düzenlerken; Kaydet penceresindeki hızlı oluşturmada yok). */
  showSharing?: boolean;
  initialShared?: boolean;
  /** Düzenlemede koleksiyonun kimliği: ortak yapmayı engelleyen içerikler bununla sorgulanır. */
  collectionId?: string;
  /** Düzenlemede mevcut ortak sayısı (kapatırken uyarı için). */
  memberCount?: number;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [visibility, setVisibility] = useState<"public" | "private">(initialVisibility);
  const [shared, setShared] = useState(initialShared);
  const [unshareable, setUnshareable] = useState<UnshareableItem[]>([]);
  const [checking, setChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mevcut koleksiyonu ortak yaparken: ortak olamayacak içerikler önceden listelenir (sunucu da reddeder, bu yalnız önceden haber verir).
  useEffect(() => {
    let cancelled = false;
    if (!showSharing || !shared || initialShared || !collectionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the list when sharing is turned off again
      setUnshareable([]);
      return;
    }
    setChecking(true);
    fetchUnshareableItems(collectionId)
      .then((list) => !cancelled && setUnshareable(list))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : t("common.actionFailedRetry")))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` is stable per language and must not refetch
  }, [showSharing, shared, initialShared, collectionId]);

  async function dropUnshareable(item: UnshareableItem) {
    try {
      await removeCollectionItemById(item.itemId);
      setUnshareable((prev) => prev.filter((other) => other.itemId !== item.itemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.actionFailedRetry"));
    }
  }

  const trimmed = name.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= NAME_MAX && !checking && unshareable.length === 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: trimmed, visibility, shared: showSharing && shared });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.actionFailedRetry"));
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="collection-name" className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          {t("collection.nameLabel")}
        </label>
        <input
          id="collection-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={NAME_MAX}
          placeholder={t("collection.namePlaceholder")}
          autoFocus
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-small text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/15 shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
        />
        <p className="text-right text-caption text-text-muted">
          {trimmed.length}/{NAME_MAX}
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">{t("collection.privacyLabel")}</p>
        <div className="space-y-2">
          <VisibilityOption
            icon={Globe}
            title={t("collection.visibilityPublicShort")}
            description={t("collection.visibilityPublicDescription")}
            selected={visibility === "public"}
            onSelect={() => setVisibility("public")}
          />
          <VisibilityOption
            icon={Lock}
            title={t("collection.visibilityPrivateShort")}
            description={t("collection.visibilityPrivateDescription")}
            selected={visibility === "private"}
            onSelect={() => setVisibility("private")}
          />
        </div>
      </div>

      {showSharing && (
        <div className="space-y-2" data-collection-sharing="">
          <button
            type="button"
            role="switch"
            aria-checked={shared}
            onClick={() => setShared((prev) => !prev)}
            className={cn("flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors", shared ? "border-primary bg-accent-surface" : "border-border hover:bg-accent-surface/50")}
          >
            <Users size={18} className="shrink-0 text-text-secondary" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-small font-medium text-text">{t("collab.sharedLabel")}</span>
              <span className="block text-caption text-text-muted">{t("collab.sharedHint")}</span>
            </span>
            <span aria-hidden className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", shared ? "bg-primary" : "bg-border-strong")}>
              <span className={cn("absolute top-1 h-4 w-4 rounded-full bg-primary-foreground transition-[left]", shared ? "left-5" : "left-1")} />
            </span>
          </button>
          {checking && <p className="text-caption text-text-muted">{t("collab.checking")}</p>}
          {unshareable.length > 0 && (
            <div role="alert" className="space-y-2 rounded-md bg-warning/10 p-3 text-small text-text" data-collection-unshareable="">
              <p className="flex items-center gap-2 font-semibold text-warning">
                <TriangleAlert size={16} aria-hidden />
                {t("collab.unshareableTitle", { count: unshareable.length })}
              </p>
              <ul className="space-y-1.5">
                {unshareable.map((item) => (
                  <li key={item.itemId} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {item.title ?? t("collab.untitled")} <span className="text-text-muted">({item.reason === "community" ? t("collab.reasonCommunity") : t("collab.reasonNotPublic")})</span>
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={() => void dropUnshareable(item)}>
                      {t("collab.removeItem")}
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-caption text-text-secondary">{t("collab.unshareableHint")}</p>
            </div>
          )}
          {!shared && initialShared && memberCount > 0 && <p className="rounded-md bg-warning/10 px-3 py-2 text-caption text-text">{t("collab.turnOffWarn", { count: memberCount })}</p>}
        </div>
      )}

      {error && <p className="text-small text-danger">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            {t("common.cancelAction")}
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
        <span className="flex items-center gap-1.5 text-small font-medium text-text">
          <Icon size={14} />
          {title}
        </span>
        <span className="mt-0.5 block text-caption text-text-muted">{description}</span>
      </span>
    </button>
  );
}
