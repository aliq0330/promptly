"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useLibraryVariables } from "@/features/spaces/library-parts";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { extractVariableTokenNames } from "@/lib/prompt-variables";
import { diffWords, type DiffWord } from "@/lib/text-diff";
import { addReviewComment, decideItem, fetchItemReview, type ItemReview, type TeamActionError } from "@/lib/supabase/teams";
import { teamLink } from "@/lib/teams";
import { cn, formatRelativeTime } from "@/lib/utils";
import { shortName } from "./team-library-section";
import { waitingText } from "./team-ui";
import type { TeamCtx } from "./team-page";

/** Kontrol listesi (mockup 11): saklanan anahtarlar yenidir; eski `clear/variables/safe` satırları yalnız geçmişte kalır. */
const CHECKLIST: { key: string; label: TranslationKey }[] = [
  { key: "variables_ok", label: "tm.lib.check.variablesOk" },
  { key: "tone", label: "tm.lib.check.tone" },
  { key: "sample_ok", label: "tm.lib.check.sampleOk" },
];

/** Bir sürümün metni: `{değişken}` turuncu, silinen kırmızı, eklenen yeşil vurgu. */
function DiffText({ parts, show }: { parts: DiffWord[]; show: "del" | "add" }) {
  return (
    <p className="prompt-text whitespace-pre-wrap break-words text-small leading-relaxed" data-diff={show}>
      {parts
        .filter((part) => part.op === "same" || part.op === show)
        .map((part, index) => {
          const tone = part.op === "del" ? "rounded bg-danger/15 px-0.5" : part.op === "add" ? "rounded bg-success/15 px-0.5" : "";
          return (
            <span key={index} className={tone}>
              {part.text.split(/(\{[^{}\s]+\})/g).map((piece, i) => (/^\{[^{}\s]+\}$/.test(piece) ? <span key={i} className="text-secondary">{piece}</span> : <span key={i}>{piece}</span>))}
            </span>
          );
        })}
    </p>
  );
}

/**
 * Onay incelemesi, tam sayfa (mockup 11 / P12): solda iki sürümün kelime farkı + değişken özeti + örnek çıktı, sağda kontrol listesi, yorumlar, gerekçe ve
 * Onayla / Değişiklik iste. Karar `space_decide_item` ile sunucuda verilir (n onay, yazar kendi promptunu onaylayamaz).
 */
export function TeamReviewPage({ ctx, itemId, onDone }: { ctx: TeamCtx; itemId: string; onDone: () => void }) {
  const { t, language } = useTranslation();
  const { team } = ctx;
  const router = useRouter();
  const [review, setReview] = useState<ItemReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"changes" | "comments">("changes");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const library = useLibraryVariables(team.librarySpaceId ?? "", Boolean(team.librarySpaceId));
  const back = teamLink(team.id, "library");

  // Telefonda sabit "Onayla" çubuğu var: alt menü örtmesin (globals.css `data-fullscreen-detail`).
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-fullscreen-detail", "");
    return () => root.removeAttribute("data-fullscreen-detail");
  }, []);

  const load = useCallback(() => {
    void fetchItemReview(itemId).then(setReview, (e: TeamActionError) => setError(e.message));
  }, [itemId]);
  useEffect(load, [load]);

  const leave = () => {
    onDone();
    router.replace(back);
  };
  const decide = async (decision: "approve" | "changes") => {
    setBusy(true);
    setError(null);
    try {
      await decideItem(itemId, decision, note.trim(), CHECKLIST.map((c) => ({ key: c.key, done: Boolean(checks[c.key]) })));
      leave();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };
  const send = async () => {
    if (!comment.trim()) return;
    try {
      await addReviewComment(itemId, comment.trim());
      setComment("");
      load();
    } catch (e) {
      setError((e as TeamActionError).message);
    }
  };

  const base = review?.base ?? null;
  const diff = useMemo(() => (review && base ? diffWords(base.body, review.item.body) : []), [review, base]);
  const vars = useMemo(() => {
    if (!review) return { added: [] as string[], removed: [] as string[], same: [] as string[] };
    const now = extractVariableTokenNames(review.item.body);
    const before = base ? extractVariableTokenNames(base.body) : [];
    return { added: now.filter((n) => !before.includes(n)), removed: before.filter((n) => !now.includes(n)), same: now.filter((n) => before.includes(n)) };
  }, [review, base]);
  const sampleLines = (review?.sample?.body ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  const sentAgo = review?.item.reviewRequestedAt ? formatRelativeTime(review.item.reviewRequestedAt, language) : null;
  const waiting = waitingText(t, review?.item.reviewRequestedAt);
  // Gerekçe şart: boşsa karar yerine gerekçe alanına götürür (telefonda "Yorumlar" sekmesine geçer).
  const askChanges = () => {
    if (note.trim()) return void decide("changes");
    setTab("comments");
    window.setTimeout(() => noteRef.current?.focus(), 50);
  };
  const approveCount = review?.approvals.filter((a) => a.decision === "approve").length ?? 0;
  const stateLabel = review?.item.state === "pending" ? t("tm.lib.state.pending") : review ? t(`tm.lib.state.${review.item.state}` as "tm.lib.state.approved") : "";

  return (
    <section className="space-y-5 max-md:pb-36" data-testid="team-review">
      <div>
        <Link href={back} className="inline-flex items-center gap-1.5 text-small font-medium text-text-secondary underline-offset-2 hover:text-text hover:underline" data-review-back>
          <ArrowLeft size={15} aria-hidden />
          <span className="md:hidden">{t("tm.lib.reviewCrumb", { team: team.name })}</span>
          <span className="max-md:hidden">{t("tm.lib.crumb", { team: team.name })}</span>
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="min-w-0 break-words text-h2 sm:text-h1">{review?.item.title ?? t("tm.lib.review")}</h1>
          {review && <span className="inline-flex h-7 items-center rounded-full bg-warning/10 px-3 text-small font-bold text-warning">{stateLabel}</span>}
          {review && base && <span className="text-small text-text-secondary">{t("tm.lib.rev", { rev: review.item.rev })}</span>}
          {review && (
            <span className="ml-auto text-small text-text-secondary max-md:ml-0 max-md:basis-full">
              {[review.item.requestedByName ? t("tm.lib.sentBy", { name: shortName(review.item.requestedByName) }) : null, waiting].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      </div>

      {review && (
        <div role="tablist" aria-label={t("tm.lib.reviewHeading")} className="grid grid-cols-2 rounded-full bg-surface-soft p-1 md:hidden" data-review-tabs>
          {(["changes", "comments"] as const).map((key) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={cn("h-10 rounded-full text-small font-bold", tab === key ? "bg-surface text-primary shadow-xs" : "text-text-secondary")}>
              {t(key === "changes" ? "tm.lib.tab.changes" : "tm.lib.tab.comments")}
              {key === "comments" && review.comments.length > 0 && <span className="ml-1.5 rounded-full bg-secondary px-1.5 text-caption text-white">{review.comments.length}</span>}
            </button>
          ))}
        </div>
      )}
      {!review ? (
        <p className="text-small text-text-muted" role={error ? "alert" : undefined}>
          {error ?? t("common.loading")}
        </p>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className={cn("min-w-0 space-y-4", tab === "comments" && "max-md:hidden")}>
            <div className={cn("grid gap-3", base && "md:grid-cols-2")}>
              {base && (
                <article className="rounded-2xl border border-border-soft bg-surface p-4" data-review-base>
                  <header className="mb-2.5 flex items-baseline justify-between gap-2 text-caption">
                    <strong className="font-bold text-text">{t("tm.lib.prevApproved")}</strong>
                    <span className="text-text-muted">{[shortName(base.author), formatRelativeTime(base.at, language)].filter(Boolean).join(" · ")}</span>
                  </header>
                  <DiffText parts={diff} show="del" />
                </article>
              )}
              <article className="rounded-2xl border border-border-soft bg-surface p-4" data-review-new>
                <header className="mb-2.5 flex items-baseline justify-between gap-2 text-caption">
                  <strong className="font-bold text-text">{t("tm.lib.newVersion", { rev: review.item.rev })}</strong>
                  <span className="text-text-muted">{[shortName(review.item.requestedByName), sentAgo].filter(Boolean).join(" · ")}</span>
                </header>
                {base ? <DiffText parts={diff} show="add" /> : <DiffText parts={[{ op: "same", text: review.item.body }]} show="add" />}
              </article>
            </div>

            {(vars.added.length > 0 || vars.removed.length > 0 || vars.same.length > 0) && (
              <div className="flex flex-wrap gap-2" data-review-vars>
                {vars.added.map((name) => (
                  <span key={`a-${name}`} className="inline-flex h-8 items-center rounded-full bg-success/10 px-3 text-small font-semibold text-success">
                    + {`{${name}}`}
                    {library.shared[name] !== undefined ? ` · ${t("tm.lib.teamVariable")}` : ""}
                  </span>
                ))}
                {vars.removed.map((name) => (
                  <span key={`r-${name}`} className="inline-flex h-8 items-center rounded-full bg-danger/10 px-3 text-small font-semibold text-danger">
                    − {`{${name}}`}
                  </span>
                ))}
                {vars.same.length > 0 && base && (
                  <span className="inline-flex h-8 items-center rounded-full bg-surface-soft px-3 text-small font-semibold text-text-secondary">
                    {t("tm.lib.unchanged", { names: vars.same.map((n) => `{${n}}`).join(", ") })}
                  </span>
                )}
              </div>
            )}

            {sampleLines.length > 0 && (
              <article className="rounded-2xl border border-border-soft bg-surface p-4" data-review-sample>
                <header className="mb-2.5 flex items-baseline justify-between gap-2 text-caption">
                  <strong className="text-small font-bold text-text">{t("tm.lib.sample")}</strong>
                  {review.sample?.author && <span className="text-text-muted">{t("tm.lib.sampleBy", { name: shortName(review.sample.author) })}</span>}
                </header>
                <ul className="space-y-2">
                  {sampleLines.map((line, index) => (
                    <li key={index} className="rounded-lg bg-surface-soft px-3 py-2.5 text-small text-text">
                      {line}
                    </li>
                  ))}
                </ul>
              </article>
            )}
          </div>

          <aside className="rounded-2xl border border-border-soft bg-surface p-4 lg:sticky lg:top-4" data-review-panel>
            <h2 className="mb-3 text-h3 font-bold max-md:hidden">{t("tm.lib.reviewHeading")}</h2>
            {review.canDecide && (
              <fieldset className={cn("mb-3 space-y-1", tab === "comments" && "max-md:hidden")}>
                <legend className="mb-1 text-small font-bold text-text md:sr-only">{t("tm.lib.checklist")}</legend>
                {CHECKLIST.map((check) => (
                  <label key={check.key} className="flex min-h-8 cursor-pointer items-center gap-2.5 text-small text-text">
                    <input type="checkbox" checked={Boolean(checks[check.key])} onChange={(event) => setChecks((prev) => ({ ...prev, [check.key]: event.target.checked }))} className="h-[18px] w-[18px] accent-[var(--color-primary)]" />
                    {t(check.label)}
                  </label>
                ))}
              </fieldset>
            )}
            <ul className={cn("space-y-3 border-t border-border-soft pt-3 max-md:border-0 max-md:pt-0", tab === "changes" && "max-md:hidden")} data-review-comments>
              {review.comments.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  <Avatar src={null} alt={c.name ?? ""} size={28} />
                  <div className="min-w-0 text-small">
                    <p>
                      <strong className="font-bold text-text">{shortName(c.name) || t("tm.lib.system")}</strong> <span className="text-caption text-text-muted">{formatRelativeTime(c.at, language)}</span>
                    </p>
                    <p className="whitespace-pre-wrap break-words text-text-secondary">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            {review.canDecide && (
              <>
                <textarea
                  ref={noteRef}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder={t("tm.lib.noteOptional")}
                  aria-label={t("tm.lib.note")}
                  className={cn("mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-small", tab === "changes" && "max-md:hidden")}
                />
                <div className="mt-3 space-y-2 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:mt-0 max-md:border-t max-md:border-border-soft max-md:bg-surface max-md:p-4 max-md:pb-3" data-review-actions>
                  <Button type="button" size="lg" className="w-full" disabled={busy} onClick={() => void decide("approve")} data-review-approve>
                    {t("tm.lib.approve")}
                  </Button>
                  <Button type="button" size="lg" variant="outline" className="w-full" disabled={busy} onClick={askChanges} data-review-changes>
                    {t("tm.lib.requestChanges")}
                  </Button>
                <p className="text-center text-caption text-text-muted">
                    {review.approvers && review.approvers.length > 0
                      ? t("tm.lib.enoughBy", { need: review.needed, names: review.approvers.slice(0, 3).map(shortName).join(", ") })
                      : t("tm.lib.needed", { have: approveCount, need: review.needed })}
                  </p>
                </div>

              </>
            )}
            {!review.canDecide && <p className="mt-3 text-caption text-text-muted">{t("tm.lib.needed", { have: approveCount, need: review.needed })}</p>}
            <button type="button" onClick={() => setCommentOpen((open) => !open)} className={cn("mt-3 w-full text-center text-caption font-medium text-primary hover:underline", tab === "changes" && "max-md:hidden")}>
              {t("tm.lib.writeComment")}
            </button>
            {commentOpen && (
              <div className="mt-2 flex gap-2">
                <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t("tm.lib.commentPlaceholder")} aria-label={t("tm.lib.commentPlaceholder")} maxLength={1000} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-small" />
                <Button type="button" variant="outline" disabled={!comment.trim()} onClick={() => void send()}>
                  {t("tm.lib.send")}
                </Button>
              </div>
            )}
            {error && (
              <p role="alert" className="mt-2 text-small text-danger">
                {error}
              </p>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
