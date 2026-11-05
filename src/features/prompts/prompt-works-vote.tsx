"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Check, ImagePlus, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { PROMPT_COPIED_EVENT } from "@/features/prompts/copy-prompt-button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { summarizeWorks, toggleVote, worksInvitePlan, type WorksInvitePlan, type WorksState } from "@/lib/prompt-works";
import { postCommentOnPrompt } from "@/lib/supabase/comments";
import { fetchPromptWorks, setPromptWorks } from "@/lib/supabase/prompt-works";
import { bumpCommentCount } from "@/features/prompts/comment-count-store";
import { publishWorksVote } from "@/features/prompts/works-badges";
import { announceCommentPosted, requestAddResult } from "@/features/prompts/works-events";

/**
 * "Çalıştı mı?" (docs/history/296-*): promptu kopyalayıp deneyen kişi tek dokunuşla oy verir; sayılar herkese açık promptta herkese görünür.
 * Kimin oy verebileceği sunucu kuralıdır (kopyalamış olmalı, yazar değil, engel yok): `can_vote` sunucudan gelir, arayüz yalnız yansıtır.
 * Az oyla yüzde gösterilmez; "Kanıtlanmış" rozeti yeterli oy + Wilson alt sınırı ister (`lib/prompt-works.ts`).
 *
 * Oydan hemen sonra İSTEĞE BAĞLI bir davet açılır (docs/history/341-*): "Çalışmadı" → belirgin yorum kutusu (yaratıcı için en değerli bilgi), "Çalıştı" →
 * sönük tek satır; görsel/video/ses promptunda "Sonucunu paylaş" öne çıkar (kanıt), metin promptunda "Yorum ekle". Oy tek doğruluk kaynağıdır ve
 * bu davetten bağımsızdır: yazmasan da oy geçerlidir. Yorum/sonuç yanında rozet olarak yalnız oyun yansıması görünür (`works-badges.tsx`).
 */
export function PromptWorksVote({ promptId, isOwn, contentType }: { promptId: string; isOwn: boolean; contentType?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<WorksState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Oy verince başparmak sıçrar; rozet OTURUM İÇİNDE "Kanıtlanmış"a geçerse büyüyerek gelir ve üzerinden parlama geçer (sayfa açılışında oynamaz; docs/history/335-*).
  const [popSeq, setPopSeq] = useState(0);
  const [provenSeq, setProvenSeq] = useState(0);
  const [wasProven, setWasProven] = useState(false);
  // Oydan sonraki isteğe bağlı davet (yalnız oturumda, oy verilince açılır; sayfa açılışında hiç çıkmaz).
  const [invite, setInvite] = useState<WorksInvitePlan | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    void fetchPromptWorks(promptId).then((next) => {
      if (cancelled) return;
      setState(next);
      // Kendi oyum yorum/sonuç rozetlerine yansısın (sayfa açılışında ayrıca sorulmasına gerek kalmaz).
      if (next && userId) publishWorksVote(promptId, userId, next.myVote);
    });
    return () => {
      cancelled = true;
    };
  }, [promptId, userId]);

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
  const isProven = summary.tier === "proven";
  if (isProven !== wasProven) {
    setWasProven(isProven);
    if (isProven && state.myVote !== null) setProvenSeq((n) => n + 1);
  }
  const signedInVoter = !!userId && !isOwn;
  // Oy yok + oy verme imkânı yok + ipucu da gerekmiyorsa (ziyaretçi/yazar) blok hiç çizilmez: boş "0 oy" gürültüsü olmasın.
  if (summary.tier === "none" && !state.canVote && !signedInVoter) return null;

  async function vote(works: boolean) {
    if (!state || busy) return;
    const previous = state;
    const next = toggleVote(state, works);
    if (next.myVote !== null) setPopSeq((n) => n + 1);
    setState(next);
    setBusy(true);
    setError(null);
    try {
      const saved = await setPromptWorks(promptId, next.myVote);
      setState(saved);
      if (userId) publishWorksVote(promptId, userId, saved.myVote);
      setSent(false);
      setInviteError(null);
      if (saved.myVote === null) {
        setInvite(null);
      } else {
        const plan = worksInvitePlan(saved.myVote, contentType);
        setInvite(plan);
        setCommentOpen(plan.commentOpen);
      }
    } catch (failure) {
      setState(previous);
      setError(failure instanceof Error && failure.message ? failure.message : t("prompt.works.voteFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function sendComment() {
    const body = draft.trim();
    if (!userId || !body || sending) return;
    setSending(true);
    setInviteError(null);
    try {
      const comment = await postCommentOnPrompt(promptId, userId, body, null);
      bumpCommentCount(promptId, 1);
      announceCommentPosted({ promptId, comment });
      setDraft("");
      setInvite(null);
      setSent(true);
    } catch (failure) {
      console.error("works invite comment", failure);
      setInviteError(t("comments.postFailed"));
    } finally {
      setSending(false);
    }
  }

  function dismissInvite() {
    setInvite(null);
    setDraft("");
    setInviteError(null);
  }

  const showInvite = state.canVote && state.myVote !== null && invite !== null;

  return (
    <section data-works-vote aria-labelledby="works-vote-title" className="mt-4 space-y-3 rounded-xl border border-border-soft bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="works-vote-title" className="text-small font-semibold text-text">
          {t("prompt.works.title")}
        </h3>
        <p className="flex flex-wrap items-center gap-2 text-caption text-text-secondary" data-works-summary>
          {summary.tier === "proven" && (
            <span key={provenSeq} title={t("prompt.works.provenHint")} className={cn("inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary", provenSeq > 0 && "mi-badge-in mi-shine")}>
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
            <span key={`up-${state.myVote === true ? popSeq : 0}`} className={cn("inline-flex", state.myVote === true && popSeq > 0 && "mi-pop")}>
              <ThumbsUp size={14} strokeWidth={1.75} aria-hidden />
            </span>{" "}
            {t("prompt.works.yes")}
          </Button>
          <Button variant={state.myVote === false ? "primary" : "outline"} size="sm" aria-pressed={state.myVote === false} disabled={busy} onClick={() => void vote(false)}>
            <span key={`down-${state.myVote === false ? popSeq : 0}`} className={cn("inline-flex", state.myVote === false && popSeq > 0 && "mi-pop")}>
              <ThumbsDown size={14} strokeWidth={1.75} aria-hidden />
            </span>{" "}
            {t("prompt.works.no")}
          </Button>
          {state.myVote !== null && <span className="text-caption text-text-muted">{t("prompt.works.undoHint")}</span>}
        </div>
      ) : (
        signedInVoter && <p className="text-caption text-text-muted">{t("prompt.works.copyFirst")}</p>
      )}

      {showInvite && invite && (
        <div data-works-invite={invite.emphasis} className="space-y-2 border-t border-border-soft pt-3">
          {invite.emphasis === "strong" ? (
            <>
              <label htmlFor="works-invite-text" className="block text-small font-semibold text-text">
                {t("prompt.works.inviteNoTitle")}
              </label>
              <p className="text-caption text-text-secondary">{t("prompt.works.inviteNoHint")}</p>
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-caption text-text-secondary">
              <Check size={14} strokeWidth={2} className="shrink-0 text-success" aria-hidden />
              {t(invite.primary === "result" ? "prompt.works.inviteYesResult" : "prompt.works.inviteYesComment")}
            </p>
          )}

          {commentOpen ? (
            <>
              <textarea
                id="works-invite-text"
                rows={3}
                maxLength={2000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t(state.myVote === false ? "prompt.works.inviteNoPlaceholder" : "prompt.works.inviteYesPlaceholder")}
                aria-label={t("prompt.works.inviteTextAria")}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-small text-text shadow-xs transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-border-strong focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={dismissInvite} disabled={sending}>
                  {t("prompt.works.inviteLater")}
                </Button>
                <Button type="button" size="sm" onClick={() => void sendComment()} disabled={!draft.trim() || sending}>
                  {sending ? t("common.sending") : t("prompt.works.inviteSend")}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {(invite.primary === "result" ? (["result", "comment"] as const) : (["comment", "result"] as const)).map((action, index) =>
                action === "result" ? (
                  <Button key="result" type="button" size="sm" variant={index === 0 ? "outline" : "ghost"} onClick={() => requestAddResult(promptId)}>
                    <ImagePlus size={14} strokeWidth={1.75} aria-hidden /> {t("prompt.works.inviteShareResult")}
                  </Button>
                ) : (
                  <Button key="comment" type="button" size="sm" variant={index === 0 ? "outline" : "ghost"} onClick={() => setCommentOpen(true)}>
                    {t("prompt.works.inviteAddComment")}
                  </Button>
                ),
              )}
              <Button type="button" variant="ghost" size="sm" onClick={dismissInvite} className="text-text-muted">
                {t("prompt.works.inviteLater")}
              </Button>
            </div>
          )}
          {inviteError && (
            <p role="alert" className="text-caption text-danger">
              {inviteError}
            </p>
          )}
        </div>
      )}

      {sent && !showInvite && (
        <p role="status" className="flex items-center gap-1.5 border-t border-border-soft pt-3 text-caption text-text-secondary" data-works-invite-sent>
          <Check size={14} strokeWidth={2} className="shrink-0 text-success" aria-hidden />
          {t("prompt.works.inviteSent")}
        </p>
      )}

      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
