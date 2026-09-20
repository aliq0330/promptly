"use client";

import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { diffPromptContent, versionToComparable } from "./prompt-diff";
import { FieldDiffBlock } from "./prompt-diff-modal";
import { formatRelativeTime } from "@/lib/utils";
import type { PromptVersion } from "@/types";

/**
 * "Sürüm Karşılaştırması" (Aşama 30) — deliberately a separate, distinctly
 * labeled screen from "Farkları Karşılaştır" (`PromptDiffModal`, remix
 * comparison): a remix comparison compares two DIFFERENT content ids, this
 * always compares two versions of the SAME content id. Both snapshots are
 * already loaded (the caller already fetched the version list) — no
 * network round-trip here, and like every other comparison in this app it
 * never mutates anything or sends a notification (Aşama 32).
 */
export function VersionDiffModal({
  from,
  to,
  onClose,
}: {
  from: PromptVersion;
  to: PromptVersion;
  onClose: () => void;
}) {
  const fields = diffPromptContent(versionToComparable(from), versionToComparable(to));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="version-diff-title">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-surface shadow-lg">
        <div className="flex items-start justify-between gap-2 border-b border-border p-4">
          <div className="min-w-0">
            <h2 id="version-diff-title" className="truncate text-base font-semibold text-text">
              Sürüm Karşılaştırması — v{from.versionNumber} → v{to.versionNumber}
            </h2>
            <div className="mt-1 flex items-center gap-4 text-xs text-text-muted">
              <span className="flex items-center gap-1.5">
                {from.createdBy && <Avatar src={from.createdBy.avatarUrl} alt={from.createdBy.displayName} size={18} />}
                v{from.versionNumber} · {formatRelativeTime(from.createdAt)}
              </span>
              <span aria-hidden>→</span>
              <span className="flex items-center gap-1.5">
                {to.createdBy && <Avatar src={to.createdBy.avatarUrl} alt={to.createdBy.displayName} size={18} />}
                v{to.versionNumber} · {formatRelativeTime(to.createdAt)}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="shrink-0 rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {to.changeSummary && (
            <p className="rounded-md bg-accent-surface/60 px-3 py-2 text-sm text-text">
              <span className="font-semibold">Değişiklik özeti:</span> {to.changeSummary}
            </p>
          )}
          {fields.map((field) => (
            <FieldDiffBlock key={field.field} field={field} mode="unified" />
          ))}
        </div>
      </div>
    </div>
  );
}
