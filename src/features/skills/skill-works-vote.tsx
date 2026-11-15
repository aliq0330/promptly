"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck } from "@/components/icons/badge-check";
import { ThumbsDown } from "@/components/icons/thumbs-down";
import { ThumbsUp } from "@/components/icons/thumbs-up";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { summarizeWorks, toggleVote, type WorksState } from "@/lib/prompt-works";
import { fetchSkillWorks, fetchSkillWorksByTool, setSkillWorks, setSkillWorksTool, WORKS_TOOLS, type WorksTool, type WorksToolRow } from "@/lib/supabase/skill-works";
import { SKILL_COMPAT_LABEL, skillLabelText } from "@/lib/skills/categories";

/**
 * Skill "Çalıştı mı?" (docs/history/393-*): Skill'i indirmiş (kullanmış) kişi tek dokunuşla oy verir; sayılar herkese açık Skill'de herkese görünür.
 * Kimin oy verebileceği sunucu kuralıdır (`can_vote`); eşikler ve iyimser güncelleme prompttakiyle AYNIDIR (`lib/prompt-works.ts`: az oyla yüzde yok, "Kanıtlanmış" = ≥10 oy + Wilson alt sınırı).
 * Yazma/yorum daveti bu dilimde yok.
 */
export function SkillWorksVote({ skillId, isOwn, justDownloaded }: { skillId: string; isOwn: boolean; /** İndirme yapılınca artar: indirme kaydı yazıldıktan sonra oy hakkı yeniden sorulur. */ justDownloaded: number }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<WorksState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tools, setTools] = useState<WorksToolRow[]>([]);
  const [myTool, setMyTool] = useState<WorksTool | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    void fetchSkillWorks(skillId).then((next) => !cancelled && setState(next));
    void fetchSkillWorksByTool(skillId).then((rows) => !cancelled && setTools(rows));
    return () => {
      cancelled = true;
    };
  }, [skillId]);
  useEffect(() => load(), [load, userId, justDownloaded]);

  if (!state) return null;
  const summary = summarizeWorks(state.yes, state.no);
  const signedInVoter = !!userId && !isOwn;
  if (summary.tier === "none" && !state.canVote && !signedInVoter) return null;

  async function vote(works: boolean) {
    if (!state || busy) return;
    const previous = state;
    const next = toggleVote(state, works);
    setState(next);
    setBusy(true);
    setError(null);
    try {
      setState(await setSkillWorks(skillId, next.myVote));
    } catch (failure) {
      setState(previous);
      setError(failure instanceof Error && failure.message ? failure.message : t("prompt.works.voteFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function chooseTool(tool: WorksTool) {
    if (busy) return;
    const next = myTool === tool ? null : tool;
    setBusy(true);
    setError(null);
    try {
      await setSkillWorksTool(skillId, next);
      setMyTool(next);
      setTools(await fetchSkillWorksByTool(skillId));
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : t("prompt.works.voteFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-skill-works aria-labelledby="skill-works-title" className="space-y-3 rounded-lg border border-border-soft bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="skill-works-title" className="text-small font-semibold text-text">
          {t("skill.works.title")}
        </h3>
        <p className="flex flex-wrap items-center gap-2 text-caption text-text-secondary" data-skill-works-summary>
          {summary.tier === "proven" && (
            <span title={t("prompt.works.provenHint")} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary">
              <BadgeCheck size={12} aria-hidden />
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
          <Button variant={state.myVote === true ? "primary" : "outline"} size="sm" aria-pressed={state.myVote === true} disabled={busy} onClick={() => void vote(true)} data-skill-works-yes="">
            <ThumbsUp size={14} aria-hidden /> {t("prompt.works.yes")}
          </Button>
          <Button variant={state.myVote === false ? "primary" : "outline"} size="sm" aria-pressed={state.myVote === false} disabled={busy} onClick={() => void vote(false)} data-skill-works-no="">
            <ThumbsDown size={14} aria-hidden /> {t("prompt.works.no")}
          </Button>
          {state.myVote !== null && <span className="text-caption text-text-muted">{t("prompt.works.undoHint")}</span>}
        </div>
      ) : (
        signedInVoter && <p className="text-caption text-text-muted">{t("skill.works.useFirst")}</p>
      )}
      {state.canVote && state.myVote !== null && (
        <div role="group" aria-label={t("skill.works.toolAria")} className="flex flex-wrap items-center gap-2" data-skill-works-tool-picker="">
          <span className="text-caption text-text-muted">{t("skill.works.toolPrompt")}</span>
          {WORKS_TOOLS.map((tool) => (
            <Button key={tool} variant={myTool === tool ? "primary" : "outline"} size="sm" aria-pressed={myTool === tool} disabled={busy} onClick={() => void chooseTool(tool)} data-skill-works-tool={tool}>
              {skillLabelText(SKILL_COMPAT_LABEL[tool], t)}
            </Button>
          ))}
        </div>
      )}
      {tools.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary" data-skill-works-by-tool="">
          {tools.map((row) => (
            <li key={row.tool} data-skill-works-tool-row={row.tool}>
              <span className="font-semibold text-text">{skillLabelText(SKILL_COMPAT_LABEL[row.tool], t)}</span>: {t("skill.works.toolCounts", { yes: row.yes, no: row.no })}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
