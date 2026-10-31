"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { PROMPT_COPIED_EVENT } from "@/features/prompts/copy-prompt-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { summarizeWorks, toggleVote, type WorksState } from "@/lib/prompt-works";
import { fetchPromptWorks, setPromptWorks } from "@/lib/supabase/prompt-works";

/**
 * "Çalıştı mı?" (docs/history/296-*): promptu kopyalayıp deneyen kişi tek dokunuşla oy verir; sayılar herkese açık promptta herkese görünür.
 * Kimin oy verebileceği sunucu kuralıdır (kopyalamış olmalı, yazar değil, engel yok): `can_vote` sunucudan gelir, arayüz yalnız yansıtır.
 * Az oyla yüzde gösterilmez; "Kanıtlanmış" rozeti yeterli oy + Wilson alt sınırı ister (`lib/prompt-works.ts`).
 */
export function PromptWorksVote({ promptId, isOwn }: { promptId: string; isOwn: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<WorksState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    void fetchPromptWorks(promptId).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [promptId]);

  // Sayfa açılınca ve oturum değişince yükle; kopyalama kaydı yazılınca yeniden (oy verebilir hâle gelmiş olabilir).
  useEffect(() => load(), [load, userId]);
  useEffect(() => {
    const onCopied = (event: Event) => {
      if ((event as CustomEvent<{ promptId?: string }>).detail?.promptId === promptId) load();
    };
    window.addEventListener(PROMPT_COPIED_EVENT, onCopied);
    return () => window.removeEventListener(PROMPT_COPIED_EVENT, onCopied);
  }, [promptId, load]);

  if (!state) return null;
  const summary = summarizeWorks(state.yes, state.no);
  const signedInVoter = !!userId && !isOwn;
  // Oy yok + oy verme imkânı yok + ipucu da gerekmiyorsa (ziyaretçi/yazar) blok hiç çizilmez: boş "0 oy" gürültüsü olmasın.
  if (summary.tier === "none" && !state.canVote && !signedInVoter) return null;

  async function vote(works: boolean) {
    if (!state || busy) return;
    const previous = state;
    const next = toggleVote(state, works);
    setState(next);
    setBusy(true);
    setError(null);
    try {
      setState(await setPromptWorks(promptId, next.myVote));
    } catch (failure) {
      setState(previous);
      setError(failure instanceof Error && failure.message ? failure.message : t("prompt.works.voteFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-works-vote aria-labelledby="works-vote-title" className="mt-4 space-y-3 rounded-xl border border-border-soft bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="works-vote-title" className="text-small font-semibold text-text">
          {t("prompt.works.title")}
        </h3>
        <p className="flex flex-wrap items-center gap-2 text-caption text-text-secondary" data-works-summary>
          {summary.tier === "proven" && (
            <span title={t("prompt.works.provenHint")} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary">
              <BadgeCheck size={13} strokeWidth={1.75} aria-hidden />
              {t("prompt.works.proven")}
            </span>
          )}
          {summary.tier === "mixed" || summary.tier === "proven"
            ? t("prompt.works.summary", { percent: summary.percent, total: summary.total })
            : summary.tier === "few"
              ? t("prompt.works.few", { total: summary.total })
              : null}
        </p>
      </div>

      {state.canVote ? (
        <div role="group" aria-label={t("prompt.works.groupAria")} className="flex flex-wrap items-center gap-2">
          <Button variant={state.myVote === true ? "primary" : "outline"} size="sm" aria-pressed={state.myVote === true} disabled={busy} onClick={() => void vote(true)}>
            <ThumbsUp size={14} strokeWidth={1.75} aria-hidden /> {t("prompt.works.yes")}
          </Button>
          <Button variant={state.myVote === false ? "primary" : "outline"} size="sm" aria-pressed={state.myVote === false} disabled={busy} onClick={() => void vote(false)}>
            <ThumbsDown size={14} strokeWidth={1.75} aria-hidden /> {t("prompt.works.no")}
          </Button>
          {state.myVote !== null && <span className="text-caption text-text-muted">{t("prompt.works.undoHint")}</span>}
        </div>
      ) : (
        signedInVoter && <p className="text-caption text-text-muted">{t("prompt.works.copyFirst")}</p>
      )}

      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
