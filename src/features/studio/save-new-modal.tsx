"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { StudioSnapshot } from "@/lib/studio-diff";
import { KIND_ICONS } from "./studio-meta";
import type { StudioResult, StudioSources } from "./studio-model";
import { availableTargets, defaultNewTitle, editHrefFor, type SaveTarget } from "./studio-save";

const TARGETS: SaveTarget[] = ["prompt", "generator", "workflow"];

/** "Yeni Olarak Oluştur": pick Prompt / Generator / Workflow; the original is never touched and the copy is a private draft. */
export function SaveNewModal({
  draft,
  result,
  sources,
  onSave,
  onClose,
}: {
  draft: StudioSnapshot;
  result: StudioResult;
  sources: StudioSources;
  onSave: (target: SaveTarget, title: string) => Promise<string>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const available = availableTargets(draft, result);
  const first = TARGETS.find((x) => available[x]) ?? "prompt";
  const [target, setTarget] = useState<SaveTarget>(first);
  const [titles, setTitles] = useState<Partial<Record<SaveTarget, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ target: SaveTarget; id: string } | null>(null);
  const suffix = t("studio.newSuffix");
  const title = titles[target] ?? defaultNewTitle(target, draft, suffix);
  void sources;

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await onSave(target, title);
      setDone({ target, id });
    } catch (err) {
      console.error("studio save", err);
      setError(t("studio.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="studio-save-title">
      <div className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-y-auto rounded-xl border border-border-soft bg-surface p-5 shadow-pop" onClick={(event) => event.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 id="studio-save-title" className="text-h3 font-semibold text-text">
            {t("studio.saveNew")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="-mr-2 -mt-1 flex h-10 w-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {done ? (
          <div className="space-y-4 pt-2" role="status">
            <p className="flex items-center gap-2 text-small text-text">
              <Check className="h-4 w-4 text-success" aria-hidden />
              {t("studio.saved")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href={editHrefFor(done.target, done.id)} className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-small font-medium text-primary-foreground hover:bg-primary-hover">
                {t("studio.openNew")}
              </Link>
              <Button type="button" variant="outline" onClick={onClose} className="h-11">
                {t("common.close")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-small text-text-secondary">{t("studio.saveNewHint")}</p>
            <div role="radiogroup" aria-label={t("studio.saveNew")} className="grid gap-2">
              {TARGETS.map((x) => {
                const Icon = KIND_ICONS[x];
                const enabled = available[x];
                return (
                  <button
                    key={x}
                    type="button"
                    role="radio"
                    aria-checked={target === x}
                    disabled={!enabled}
                    onClick={() => setTarget(x)}
                    className={cn(
                      "flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45",
                      target === x ? "border-primary bg-primary-soft" : "border-border-soft hover:bg-surface-soft",
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-small font-medium text-text">{t(`studio.newAs.${x}` as const)}</span>
                      {!enabled && <span className="block text-caption text-text-muted">{t("studio.needSource", { name: t(`studio.kind.${x}` as const) })}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div>
              <label htmlFor="studio-new-title" className="mb-1.5 block text-small font-medium text-text">
                {t("studio.newTitle")}
              </label>
              <input
                id="studio-new-title"
                value={title}
                onChange={(event) => setTitles((prev) => ({ ...prev, [target]: event.target.value }))}
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-body text-text focus:border-primary/60 shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong"
              />
            </div>
            {error && (
              <p role="alert" className="text-small text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} className="h-11">
                {t("common.cancel")}
              </Button>
              <Button type="button" onClick={submit} disabled={!available[target] || !title.trim() || busy} className="h-11">
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {t("studio.createDraft")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
