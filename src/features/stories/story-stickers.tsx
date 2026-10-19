"use client";

import { useEffect, useState } from "react";
import { Check, Send } from "lucide-react";
import { answerStoryQuestion, fetchPollResults, voteStoryPoll } from "@/lib/supabase/stories";
import { STORY_LIMITS, pollPercentages } from "@/lib/stories";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { Story, StoryPollResults } from "@/types";

/**
 * Görüntüleyicideki etkileşimli çıkartmalar (docs/history/198-*). Oy ve yanıt sunucuda doğrulanır (kişi başına tek oy, sayılar oy
 * kayıtlarından); sonuçlar yalnız sahibine ve oy vermiş olana açılır. Bu öğelerdeki dokunuşlar hikâyeyi ilerletmez
 * (`data-story-interactive`).
 */

export function PollSticker({
  story,
  isOwner,
  canInteract,
  onOpenResults,
}: {
  story: Story;
  isOwner: boolean;
  /** Oturum açık, sahibi değil ve hikâye etkin. */
  canInteract: boolean;
  onOpenResults?: () => void;
}) {
  const { t } = useTranslation();
  const [results, setResults] = useState<StoryPollResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPollResults(story.id)
      .then((value) => alive && setResults(value))
      .catch(() => alive && setResults({ revealed: false, myVote: null, total: null, counts: null }));
    return () => {
      alive = false;
    };
  }, [story.id]);

  if (story.sticker?.kind !== "poll") return null;
  const options = story.sticker.options;
  const percents = results?.revealed && results.counts ? pollPercentages(results.counts) : null;

  async function vote(index: number) {
    if (!canInteract || busy) return;
    setBusy(true);
    setError(null);
    try {
      await voteStoryPoll(story.id, index);
      setResults(await fetchPollResults(story.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("stories.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-story-interactive className="rounded-[3cqw] bg-story-white p-[3.5cqw] text-story-black shadow-pop">
      <p className="text-center text-[4.6cqw] font-semibold leading-snug">{story.sticker.question}</p>
      <div className="mt-[2.5cqw] space-y-[1.6cqw]" role="group" aria-label={story.sticker.question}>
        {options.map((option, index) => {
          const mine = results?.myVote === index;
          const percent = percents?.[index] ?? null;
          return (
            <button
              key={index}
              type="button"
              disabled={!canInteract || busy}
              aria-pressed={mine}
              onClick={() => void vote(index)}
              className={cn(
                "relative flex min-h-9 w-full items-center justify-between gap-2 overflow-hidden rounded-[2cqw] border px-[3cqw] py-[1.8cqw] text-left text-[4cqw] font-medium transition-colors",
                mine ? "border-story-cobalt" : "border-story-black/15",
                canInteract && !busy && "hover:border-story-cobalt/60",
              )}
            >
              {percent !== null && (
                <span aria-hidden className={cn("absolute inset-y-0 left-0", mine ? "bg-story-cobalt/20" : "bg-story-black/8")} style={{ width: `${percent}%` }} />
              )}
              <span className="relative flex min-w-0 items-center gap-1.5">
                {mine && <Check size={14} className="shrink-0 text-story-cobalt" aria-hidden />}
                <span className="truncate">{option}</span>
              </span>
              {percent !== null && <span className="relative shrink-0 tabular-nums">{percent}%</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-[2cqw] text-center text-[3.2cqw] text-story-black/60" aria-live="polite">
        {error ??
          (results?.revealed
            ? t("stories.poll.totalVotes", { count: results.total ?? 0 })
            : canInteract
              ? t("stories.poll.tapToVote")
              : !isOwner
                ? t("stories.poll.resultsAfterVote")
                : "")}
      </p>
      {isOwner && onOpenResults && (
        <button type="button" onClick={onOpenResults} className="mt-[1.5cqw] w-full text-center text-[3.4cqw] font-semibold text-story-cobalt">
          {t("stories.poll.seeVoters")}
        </button>
      )}
    </div>
  );
}

export function QuestionSticker({
  story,
  isOwner,
  canInteract,
  onFocusChange,
  onOpenAnswers,
}: {
  story: Story;
  isOwner: boolean;
  canInteract: boolean;
  /** Yazarken hikâye duraklasın. */
  onFocusChange: (focused: boolean) => void;
  onOpenAnswers?: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  if (story.sticker?.kind !== "question") return null;

  async function send() {
    const body = text.trim();
    if (!body || state === "sending") return;
    setState("sending");
    setError(null);
    try {
      await answerStoryQuestion(story.id, body);
      setText("");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("stories.error.generic"));
      setState("idle");
    }
  }

  return (
    <div data-story-interactive className="rounded-[3cqw] bg-story-white p-[3.5cqw] text-story-black shadow-pop">
      <p className="text-center text-[4.6cqw] font-semibold leading-snug">{story.sticker.question}</p>
      {isOwner ? (
        <button type="button" onClick={onOpenAnswers} className="mt-[2.5cqw] w-full rounded-[2cqw] bg-story-black/5 px-[3cqw] py-[2.2cqw] text-[3.8cqw] font-semibold text-story-cobalt">
          {t("stories.question.seeAnswers")}
        </button>
      ) : canInteract ? (
        <form
          className="mt-[2.5cqw] flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <input
            value={text}
            maxLength={STORY_LIMITS.answerMax}
            onChange={(event) => setText(event.target.value)}
            onFocus={() => onFocusChange(true)}
            onBlur={() => onFocusChange(false)}
            placeholder={t("stories.question.placeholder")}
            aria-label={t("stories.question.placeholder")}
            className="min-h-9 min-w-0 flex-1 rounded-[2cqw] bg-story-black/5 px-[3cqw] py-[2cqw] text-[3.8cqw] text-story-black placeholder:text-story-black/50 focus:outline-none focus:ring-2 focus:ring-story-cobalt/40"
          />
          <button
            type="submit"
            disabled={!text.trim() || state === "sending"}
            aria-label={t("stories.question.send")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-story-cobalt text-story-white disabled:opacity-40"
          >
            <Send size={15} aria-hidden />
          </button>
        </form>
      ) : (
        <div className="mt-[2.5cqw] rounded-[2cqw] bg-story-black/5 px-[3cqw] py-[2.2cqw] text-center text-[3.6cqw] text-story-black/60">
          {t("stories.question.closed")}
        </div>
      )}
      <p className="mt-[1.6cqw] text-center text-[3.1cqw] leading-snug text-story-black/60" aria-live="polite">
        {error ?? (state === "sent" ? t("stories.question.sent") : canInteract ? t("stories.question.privacyNote") : "")}
      </p>
    </div>
  );
}
