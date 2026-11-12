"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, SubmitButton } from "@/features/spaces/space-forms";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useSpaceContext } from "@/features/spaces/space-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { SpaceItem } from "@/lib/supabase/spaces";
import { proposeChange } from "@/lib/supabase/team-projects";
import type { TeamActionError } from "@/lib/supabase/teams";

/** Onaylı öğe için değişiklik önerisi: öneri ayrı tabloda durur (öğe değişmez); lider onaylarsa uygulanır. */
export function ProposeChangeDialog({ item, onClose, onDone }: { item: SpaceItem; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  // Ekibe özgü prompt öğesi başvurudur (başlık/metin öğede değil prompt satırındadır): öneri formu oradan dolar (docs/history/376-*).
  const { sources } = useSpaceContext();
  const teamPrompt = item.kind === "prompt" && !item.isDraft && item.promptId ? (sources.prompts.get(item.promptId) ?? null) : null;
  const [title, setTitle] = useState(item.title || teamPrompt?.title || "");
  const [body, setBody] = useState(item.body || teamPrompt?.promptText || "");
  const [note, setNote] = useState(item.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await proposeChange(item.id, { title: title.trim(), body, note });
      onDone();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };
  return (
    <SpaceDialog
      title={t("tp.review.proposeDialog")}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void submit(event)}
      formTestId="area-propose-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{t("tp.review.proposeSend")}</SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-label font-semibold text-text">{t("tp.review.fieldTitle")}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-small" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-label font-semibold text-text">{t("tp.review.fieldBody")}</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={8000} rows={6} className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-small" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-label font-semibold text-text">{t("tp.review.fieldNote")}</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-small" />
        </label>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}
