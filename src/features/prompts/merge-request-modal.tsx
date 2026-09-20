"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { createMergeRequest } from "@/lib/supabase/merge-requests";
import type { MergeRequest, RemixGraphNode } from "@/types";

/**
 * "Merge talebi oluştur" (Aşama 6) — a real, permanent submission, never a
 * fake local-only draft. Every field the spec asks for is here: fixed
 * contribution source, a real ancestor picked as the target (never an
 * arbitrary prompt — `candidates` is pre-filtered by the caller to the
 * source's actual ancestor chain), a summary, an optional longer
 * description. All the "before submitting" checks (source/target still
 * exist, requester owns source, target accepts merges, no duplicate
 * pending request) happen inside the `create_merge_request` RPC — this
 * form only has to show the RPC's own rejection message honestly, never
 * silently swallow it.
 */
export function MergeRequestModal({
  source,
  candidates,
  onClose,
  onCreated,
}: {
  source: RemixGraphNode;
  candidates: RemixGraphNode[];
  onClose: () => void;
  onCreated: (result: { requestId: string; status: MergeRequest["status"] }) => void;
}) {
  const [targetId, setTargetId] = useState(candidates[0]?.id ?? "");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = candidates.find((c) => c.id === targetId);

  async function handleSubmit() {
    if (!target || !summary.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await createMergeRequest({
        sourcePromptId: source.id,
        targetPromptId: target.id,
        contributionSummary: summary,
        description: description || undefined,
      });
      onCreated(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge talebi gönderilemedi, lütfen tekrar dene.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="merge-modal-title">
      <div className="w-full max-w-lg space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="merge-modal-title" className="text-base font-semibold text-text">
              Merge talebi oluştur
            </h2>
            <p className="text-xs text-text-muted">
              &quot;{source.title}&quot; içeriğindeki katkını seçtiğin hedefe gönder.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Katkı kaynağı</p>
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <Avatar src={source.author.avatarUrl} alt={source.author.displayName} size={24} />
            <span className="truncate font-medium text-text">{source.title}</span>
            <span className="text-xs text-text-muted">({source.author.displayName})</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="merge-target" className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Merge hedefi
          </label>
          <select
            id="merge-target"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.rootPromptId === null || candidate.id === candidate.rootPromptId
                  ? "Kök orijinal — "
                  : "Doğrudan kaynak — "}
                {candidate.title} ({candidate.author.displayName})
              </option>
            ))}
          </select>
          {target && (
            <p className="text-xs text-text-muted">
              Hedef sahibi: <span className="font-medium text-text">{target.author.displayName}</span> — karar verme yetkisi ona ait.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="merge-summary" className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Katkı özeti *
          </label>
          <input
            id="merge-summary"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            maxLength={500}
            placeholder="Örn. Mor tonlara geçiş ve daha modern bir görünüm"
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="merge-description" className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Açıklama (opsiyonel)
          </label>
          <textarea
            id="merge-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Katkının neden faydalı olduğunu anlat…"
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            İptal
          </Button>
          <Button type="button" disabled={!target || !summary.trim() || isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? "Gönderiliyor..." : "Gönder"}
          </Button>
        </div>
      </div>
    </div>
  );
}
