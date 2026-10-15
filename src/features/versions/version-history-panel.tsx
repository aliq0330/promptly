"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, History, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { copyTextToClipboard, formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { RestoreOutcome } from "@/lib/supabase/content-versions";
import { defaultComparison, latestVersionNumber, orderComparison } from "@/lib/version-history";

/** What every content type's version row has in common; each type adds its own snapshot fields. */
export interface HistoryVersion {
  id: string;
  versionNumber: number;
  createdAt: string;
  source: "initial" | "owner_edit" | "edit_suggestion_accepted";
}

const SOURCE_LABEL_KEYS: Record<HistoryVersion["source"], TranslationKey> = {
  initial: "promptHistory.sourceInitial",
  owner_edit: "promptHistory.sourceOwnerEdit",
  edit_suggestion_accepted: "promptHistory.sourceSuggestionAccepted",
};

/** One-shot hand-off across the page reload that follows a successful restore (see `VersionRestoreToast`). */
export const RESTORE_NOTICE_KEY = "promptly:version-restored";

/**
 * The ONE version list of the four content types (prompt, prompt request, workflow, preset): newest first,
 * "Güncel" on the highest number only, relative time, the reason for each version, an optional copy action,
 * a single open comparison with two version pickers, and the owner's restore flow. What differs per type is
 * handed in: `renderComparison` (its diff view), `copyText`, `onRestore` and the confirmation text.
 *
 * Restore is never optimistic: the confirm dialog stays open until the server confirms. Only then does the page
 * reload (the page's content, caches and counters all re-read the restored data) with a one-time notice; a failure
 * leaves everything as it was and says so. The list is read-only otherwise — history rows are never edited here.
 */
export function VersionHistoryPanel<V extends HistoryVersion>({
  title,
  contentId,
  versions,
  isOwner,
  renderComparison,
  copyText,
  onRestore,
  restoreConfirmKey,
  announceNextVersion = false,
  suggesterName,
}: {
  title: string;
  contentId: string;
  /** Newest first. */
  versions: V[];
  isOwner: boolean;
  renderComparison: (older: V, newer: V) => ReactNode;
  /** Only for content with one primary text (prompt, request); omit for presets and workflows. */
  copyText?: (version: V) => string;
  /** Owner only. Resolves `restored` / `unchanged`; throws when NOTHING was changed. */
  onRestore?: (version: V) => Promise<RestoreOutcome>;
  restoreConfirmKey: TranslationKey;
  /** Add "vN yeni güncel sürüm olacak." under the confirmation text (the Prompt/İstek texts already say it themselves). */
  announceNextVersion?: boolean;
  /** The owner-visible name next to an accepted suggestion (never the suggestion text). */
  suggesterName?: (version: V) => string | null;
}) {
  const { t, language } = useTranslation();
  // At most one comparison is open at a time.
  const [comparison, setComparison] = useState<{ openedFor: string; olderId: string; newerId: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<V | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedId) return;
    const timer = setTimeout(() => setCopiedId(null), 1800);
    return () => clearTimeout(timer);
  }, [copiedId]);

  if (versions.length === 0) return null;

  const latest = latestVersionNumber(versions);
  const byId = new Map(versions.map((version) => [version.id, version]));
  const canRestore = isOwner && Boolean(onRestore);

  function toggleComparison(version: V) {
    if (comparison?.openedFor === version.id) {
      setComparison(null);
      return;
    }
    const initial = defaultComparison(versions, version.id);
    if (!initial) return;
    setComparison({ openedFor: version.id, olderId: initial.older.id, newerId: initial.newer.id });
  }

  async function handleCopy(version: V) {
    if (!copyText) return;
    if (await copyTextToClipboard(copyText(version))) setCopiedId(version.id);
  }

  async function confirmRestore() {
    if (!restoreTarget || !onRestore || restoring) return;
    setRestoring(true);
    setRestoreError(false);
    try {
      const outcome = await onRestore(restoreTarget);
      if (outcome === "unchanged") {
        setRestoreTarget(null);
        setInfo(t("history.restoreUnchanged"));
        return;
      }
      try {
        sessionStorage.setItem(RESTORE_NOTICE_KEY, JSON.stringify({ contentId, from: restoreTarget.versionNumber }));
      } catch {
        // the notice is a courtesy; the restore itself already succeeded
      }
      window.location.reload();
    } catch (err) {
      console.error("restore version", err);
      setRestoreError(true);
    } finally {
      setRestoring(false);
    }
  }

  const pair = comparison ? orderComparison(byId.get(comparison.olderId)!, byId.get(comparison.newerId)!) : null;

  return (
    <section className="space-y-3 rounded-lg border border-border-soft bg-surface p-4 sm:p-5">
      <h2 className="flex items-center gap-1.5 text-label font-semibold text-text">
        <History size={16} />
        {title}
      </h2>

      {info && (
        <p role="status" className="rounded-md bg-surface-soft px-3 py-2 text-small text-text-secondary">
          {info}
        </p>
      )}

      <ul className="space-y-2">
        {versions.map((version) => {
          const isComparing = comparison?.openedFor === version.id;
          const name = suggesterName?.(version) ?? null;
          return (
            <li key={version.id} className="rounded-md border border-border-soft bg-surface-soft p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-text">
                  v{version.versionNumber}
                  {version.versionNumber === latest && <span className="ml-1.5 text-primary">· {t("promptHistory.current")}</span>}
                </span>
                <time dateTime={version.createdAt} title={new Date(version.createdAt).toLocaleString(language === "tr" ? "tr-TR" : "en-US")} className="text-xs text-text-muted">
                  {formatRelativeTime(version.createdAt, language)}
                </time>
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {t(SOURCE_LABEL_KEYS[version.source])}
                {name && <> · {t("history.suggestedBy", { name })}</>}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {versions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => toggleComparison(version)}
                    aria-expanded={isComparing}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {isComparing ? t("promptHistory.hideComparison") : t("history.compare")}
                  </button>
                )}
                {copyText && (
                  <button
                    type="button"
                    onClick={() => handleCopy(version)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text"
                  >
                    {copiedId === version.id ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
                    {copiedId === version.id ? t("common.copied") : t("common.copy")}
                  </button>
                )}
                {canRestore && version.versionNumber !== latest && (
                  <button
                    type="button"
                    onClick={() => {
                      setRestoreError(false);
                      setInfo(null);
                      setRestoreTarget(version);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text"
                  >
                    <RotateCcw size={12} aria-hidden />
                    {t("history.restore")}
                  </button>
                )}
              </div>

              {isComparing && comparison && (
                <div className="mt-3 space-y-3 rounded-md border border-border-soft bg-background p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <VersionPicker
                      label={t("history.oldVersion")}
                      value={comparison.olderId}
                      versions={versions}
                      onChange={(olderId) => setComparison({ ...comparison, olderId })}
                    />
                    <VersionPicker
                      label={t("history.newVersion")}
                      value={comparison.newerId}
                      versions={versions}
                      onChange={(newerId) => setComparison({ ...comparison, newerId })}
                    />
                  </div>
                  {pair ? renderComparison(pair.older, pair.newer) : <p className="text-xs text-text-muted">{t("history.sameVersion")}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {restoreTarget && (
        <Modal onClose={() => !restoring && setRestoreTarget(null)} labelledBy="restore-version-title">
          <div
            className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-2">
              <h2 id="restore-version-title" className="text-base font-semibold text-text">
                {t("history.restoreTitle")}
              </h2>
              <p className="text-small text-text-secondary">{t("history.restoreLead", { from: restoreTarget.versionNumber })}</p>
              <p className="text-small text-text-secondary">{t(restoreConfirmKey, { next: latest + 1, from: restoreTarget.versionNumber })}</p>
              {announceNextVersion && <p className="text-small text-text-secondary">{t("history.restoreNextVersion", { next: latest + 1 })}</p>}
              {restoreError && (
                <p role="alert" className="text-small text-danger">
                  {t("history.restoreFailed")}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRestoreTarget(null)} disabled={restoring}>
                {t("common.cancel")}
              </Button>
              <Button type="button" onClick={confirmRestore} disabled={restoring}>
                {restoring && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {restoring ? t("history.restoring") : t("common.confirm")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function VersionPicker<V extends HistoryVersion>({
  label,
  value,
  versions,
  onChange,
}: {
  label: string;
  value: string;
  versions: V[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-border bg-surface px-2 text-small font-normal text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            v{version.versionNumber}
          </option>
        ))}
      </select>
    </label>
  );
}
