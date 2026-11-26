"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "@/components/icons/alert-circle";
import { Check } from "@/components/icons/check";
import { Loader2 } from "@/components/icons/loader-2";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input, Select, fieldLabelClassName } from "@/components/ui/field";
import { OptionCheckbox } from "@/components/ui/option-group";
import { useTranslation } from "@/lib/i18n/language-provider";
import { commentsAllowedFor, planCopy, type CopyDestKind, type PlanItem, type PlanPin } from "@/lib/space-copy-plan";
import { fetchCopyScope, totalSkipped } from "@/lib/supabase/space-copy";
import { runTransfer, transferSteps, TransferError, type TransferDest, type TransferOutcome, type TransferRequest, type TransferStep, type TransferStepState } from "@/lib/supabase/space-transfer";
import { listSpaces, type SpaceSummary } from "@/lib/supabase/spaces";
import { listProjects, type ProjectSummary } from "@/lib/supabase/team-projects";
import { listMyTeams, type TeamSummary } from "@/lib/supabase/teams";
import { SpaceDialog } from "./space-modals";

type Phase = "form" | "running" | "done" | "failed";
interface StepRow {
  key: TransferStep;
  state: "pending" | TransferStepState;
  meta?: string;
}

/**
 * Öğeleri başka bir yere kopyalama penceresi (docs/history/461-*, 462-*): yeni Space · var olan Space · ekip: yeni dosya (projeye Space'in adıyla dosya + aynı adla
 * pano) · ekip: var olan dosya. Kaynak bir kişisel Space, bir ekip dosyasının alanı ya da panoda seçilen öğelerdir. Yorumlar (yazar/tarih/çözüldü korunarak) ve
 * görseller de kopyalanır; neyin kopyalanmadığı baştan yazılır, sonuçta sayılarla gösterilir. Kaynağa yalnız (istenirse, en son) arşivleme yazılır.
 */
export function CopyItemsDialog({
  sourceSpaceId,
  sourceTitle,
  itemIds,
  defaultDestination = "newSpace",
  allowArchive = true,
  onArchived,
  onClose,
}: {
  sourceSpaceId: string;
  sourceTitle: string;
  /** Verilirse yalnız bu öğeler; yoksa kaynağın tamamı. */
  itemIds?: string[] | null;
  defaultDestination?: CopyDestKind;
  /** Kaynak bir kişisel Space ise "arşivle" kutusu çıkar (yalnız tamamı kopyalanırken). */
  allowArchive?: boolean;
  /** Kaynak arşivlenince çağrılır (sayfa kendini tazelesin). */
  onArchived?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const selection = itemIds && itemIds.length > 0 ? itemIds : null;
  const [dest, setDest] = useState<CopyDestKind>(defaultDestination);
  const [title, setTitle] = useState(() => t("spaces.copy.defaultTitle", { title: sourceTitle }).slice(0, 80));
  const [fileName, setFileName] = useState(() => sourceTitle.slice(0, 80));
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [scope, setScope] = useState<{ items: PlanItem[]; pins: PlanPin[] } | null>(null);
  const [spaceId, setSpaceId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [fileId, setFileId] = useState("");
  const [copyComments, setCopyComments] = useState(true);
  const [archive, setArchive] = useState(true);
  const [phase, setPhase] = useState<Phase>("form");
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [outcome, setOutcome] = useState<TransferOutcome | null>(null);
  const [failure, setFailure] = useState<TransferError | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void listSpaces({ filter: "all", limit: 60 })
      .then((list) => alive && setSpaces(list.filter((space) => space.id !== sourceSpaceId && !space.teamId && !space.archivedAt && (space.myRole === "owner" || space.myRole === "editor"))))
      .catch(() => alive && setSpaces([]));
    void listMyTeams()
      .then((page) => alive && setTeams(page.items))
      .catch(() => alive && setTeams([]));
    void fetchCopyScope(sourceSpaceId)
      .then((result) => alive && setScope(result))
      .catch(() => alive && setScope(null));
    return () => {
      alive = false;
    };
  }, [sourceSpaceId]);

  useEffect(() => {
    if (!teamId) return;
    let alive = true;
    void listProjects(teamId)
      .then((list) => alive && setProjects(list))
      .catch(() => alive && setProjects([]));
    return () => {
      alive = false;
    };
  }, [teamId]);

  const project = useMemo(() => projects?.find((entry) => entry.id === projectId) ?? null, [projects, projectId]);
  const files = useMemo(() => (project?.files ?? []).filter((file) => file.mainAreaId && file.mainAreaId !== sourceSpaceId), [project, sourceSpaceId]);
  const plan = useMemo(() => (scope ? planCopy(scope.items, scope.pins, selection, dest) : null), [scope, selection, dest]);

  const projectProblem = (entry: ProjectSummary): string | null => {
    if (entry.archivedAt) return t("spaces.copy.archivedProj");
    if (dest === "teamNew") return entry.myRole === "lead" ? null : t("spaces.copy.needLead");
    return entry.myRole === "lead" || entry.myRole === "edit" ? null : t("spaces.copy.noEdit");
  };

  const commentsOn = copyComments && commentsAllowedFor(dest) && (plan?.commentRoots ?? 0) > 0;
  const showArchive = allowArchive && !selection;
  const ready =
    dest === "newSpace" ? title.trim().length > 0 : dest === "space" ? Boolean(spaceId) : dest === "teamNew" ? Boolean(projectId) && fileName.trim().length > 0 : Boolean(fileId);

  function buildRequest(): TransferRequest | null {
    let target: TransferDest;
    if (dest === "newSpace") target = { kind: "newSpace", title: title.trim() };
    else if (dest === "space") target = { kind: "space", spaceId };
    else if (dest === "teamNew") target = { kind: "teamNew", teamId, projectId, fileTitle: fileName.trim() };
    else {
      const file = files.find((entry) => entry.id === fileId);
      if (!file?.mainAreaId) return null;
      target = { kind: "teamFile", teamId, projectId, fileId: file.id, areaId: file.mainAreaId };
    }
    return { fromSpaceId: sourceSpaceId, itemIds: selection, dest: target, copyComments: commentsOn, archiveSource: showArchive && archive };
  }

  async function run() {
    const request = buildRequest();
    if (!request || !ready || phase === "running") return;
    setError(null);
    setFailure(null);
    setOutcome(null);
    setSteps(transferSteps(request).map((key) => ({ key, state: "pending" as const })));
    setPhase("running");
    try {
      const result = await runTransfer(request, (key, state, meta) => setSteps((rows) => rows.map((row) => (row.key === key ? { ...row, state, meta: meta ?? row.meta } : row))));
      setOutcome(result);
      setPhase("done");
      if (result.archived) onArchived?.();
    } catch (err) {
      setFailure(err instanceof TransferError ? err : new TransferError(err instanceof Error ? err.message : String(err), "items", null, true));
      setPhase("failed");
    }
  }

  const skipLines = outcome
    ? [
        outcome.copy.skipped.privateNote > 0 && t("spaces.copy.skip.privateNote", { count: outcome.copy.skipped.privateNote }),
        outcome.copy.skipped.media > 0 && t("spaces.copy.skip.media", { count: outcome.copy.skipped.media }),
        outcome.copy.skipped.unavailable > 0 && t("spaces.copy.skip.unavailable", { count: outcome.copy.skipped.unavailable }),
        outcome.copy.skipped.drawingInFile > 0 && t("spaces.copy.skip.drawingInFile", { count: outcome.copy.skipped.drawingInFile }),
        outcome.copy.skipped.duplicate > 0 && t("spaces.copy.skip.duplicate", { count: outcome.copy.skipped.duplicate }),
      ].filter((line): line is string => Boolean(line))
    : [];

  const stepsList = (
    <ul className="space-y-2" data-copy-steps>
      {steps.map((row) => (
        <li key={row.key} data-copy-step={row.key} data-state={row.state} className="flex items-center gap-3 rounded-md border border-border-soft px-3 py-2.5 text-small">
          <span
            aria-hidden
            className={
              row.state === "done"
                ? "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success-soft text-success"
                : row.state === "fail"
                  ? "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-danger-soft text-danger"
                  : "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-soft text-text-muted"
            }
          >
            {row.state === "done" ? <Check size={12} /> : row.state === "fail" ? <AlertCircle size={12} /> : row.state === "run" ? <Loader2 size={12} className="animate-spin" /> : null}
          </span>
          <span className="min-w-0 flex-1">{t(`spaces.copy.step.${row.key}` as const)}</span>
          {row.meta && <span className="shrink-0 text-caption tabular-nums text-text-muted">{row.meta}</span>}
        </li>
      ))}
    </ul>
  );

  return (
    <SpaceDialog
      title={t("spaces.copy.title")}
      onClose={onClose}
      busy={phase === "running"}
      overLayers
      formTestId="copy-items-dialog"
      onSubmit={(event) => {
        event.preventDefault();
        if (phase === "form") void run();
      }}
      footer={
        phase === "done" && outcome ? (
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.close")}
            </Button>
            <Link href={outcome.href} className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-small font-semibold text-primary-foreground" data-copy-open>
              {t("spaces.copy.open")}
            </Link>
          </>
        ) : phase === "failed" ? (
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.close")}
            </Button>
            {/* key: "Tekrar dene" ile "Kopyala" AYNI konumdaki düğmedir; anahtar yoksa React düğmeyi yeniden kullanır, tür "submit"e dönünce aynı tıklama formu yeniden gönderir. */}
            <Button key="retry" type="button" onClick={() => setPhase("form")} data-copy-retry>
              {t("spaces.copy.retry")}
            </Button>
          </>
        ) : phase === "running" ? (
          <Button type="button" disabled>
            <Loader2 size={16} className="animate-spin" aria-hidden />
            {t("spaces.copy.run")}
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button key="run" type="submit" disabled={!ready} data-copy-run>
              {t("spaces.copy.run")}
            </Button>
          </>
        )
      }
    >
      {phase === "form" ? (
        <div className="space-y-4">
          <p className="text-small text-text-secondary">{selection ? t("spaces.copy.fromSelection", { count: selection.length, title: sourceTitle }) : t("spaces.copy.fromSpace", { title: sourceTitle })}</p>
          <ChoiceGroup<CopyDestKind>
            ariaLabel={t("spaces.copy.destination")}
            variant="pill"
            showHint
            value={dest}
            onChange={(next) => {
              setDest(next);
              setFileId("");
            }}
            options={[
              { key: "newSpace", label: t("spaces.copy.dest.new") },
              { key: "space", label: t("spaces.copy.dest.space") },
              { key: "teamNew", label: t("spaces.copy.dest.teamNew"), hint: t("spaces.copy.dest.teamNewHint") },
              { key: "teamFile", label: t("spaces.copy.dest.teamFile"), hint: t("spaces.copy.dest.teamFileHint") },
            ]}
          />
          {dest === "newSpace" && (
            <div>
              <label className={fieldLabelClassName} htmlFor="copy-title">
                {t("spaces.copy.newTitle")}
              </label>
              <Input id="copy-title" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
            </div>
          )}
          {dest === "space" && (
            <div>
              <label className={fieldLabelClassName} htmlFor="copy-space">
                {t("spaces.copy.pickSpace")}
              </label>
              <Select id="copy-space" value={spaceId} onChange={(event) => setSpaceId(event.target.value)} disabled={spaces === null}>
                <option value="">{spaces === null ? t("common.loading") : spaces.length === 0 ? t("spaces.copy.noSpaces") : t("spaces.copy.choose")}</option>
                {(spaces ?? []).map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.title}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {(dest === "teamNew" || dest === "teamFile") && (
            <div className="space-y-3">
              <div>
                <label className={fieldLabelClassName} htmlFor="copy-team">
                  {t("spaces.copy.pickTeam")}
                </label>
                <Select
                  id="copy-team"
                  value={teamId}
                  disabled={teams === null}
                  onChange={(event) => {
                    setTeamId(event.target.value);
                    setProjects(null);
                    setProjectId("");
                    setFileId("");
                  }}
                >
                  <option value="">{teams === null ? t("common.loading") : teams.length === 0 ? t("spaces.copy.noTeams") : t("spaces.copy.choose")}</option>
                  {(teams ?? []).map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </Select>
              </div>
              {teamId && (
                <div>
                  <label className={fieldLabelClassName} htmlFor="copy-project">
                    {t("spaces.copy.pickProject")}
                  </label>
                  <Select
                    id="copy-project"
                    value={projectId}
                    disabled={projects === null}
                    onChange={(event) => {
                      setProjectId(event.target.value);
                      setFileId("");
                    }}
                  >
                    <option value="">{projects === null ? t("common.loading") : projects.length === 0 ? t("spaces.copy.noProjects") : t("spaces.copy.choose")}</option>
                    {(projects ?? []).map((entry) => {
                      const problem = projectProblem(entry);
                      return (
                        <option key={entry.id} value={entry.id} disabled={Boolean(problem)}>
                          {entry.title}
                          {problem ? ` — ${problem}` : ""}
                        </option>
                      );
                    })}
                  </Select>
                </div>
              )}
              {project && dest === "teamNew" && (
                <div>
                  <label className={fieldLabelClassName} htmlFor="copy-file-name">
                    {t("spaces.copy.fileName")}
                  </label>
                  <Input id="copy-file-name" value={fileName} maxLength={80} onChange={(event) => setFileName(event.target.value)} />
                  <p className="mt-1 text-caption text-text-muted">{t("spaces.copy.fileHint")}</p>
                </div>
              )}
              {project && dest === "teamFile" && (
                <div>
                  <label className={fieldLabelClassName} htmlFor="copy-file">
                    {t("spaces.copy.pickFile")}
                  </label>
                  <Select id="copy-file" value={fileId} onChange={(event) => setFileId(event.target.value)}>
                    <option value="">{files.length === 0 ? t("spaces.copy.noFiles") : t("spaces.copy.choose")}</option>
                    {files.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.title}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          )}
          {plan && (
            <p className="text-small text-text-secondary" data-copy-summary>
              {t("spaces.copy.willCopy")}: <b className="text-text">{t("spaces.copy.itemsCount", { count: plan.copyable })}</b>
              {commentsOn ? <> · <b className="text-text">{t("spaces.copy.commentsCount", { count: plan.commentRoots + plan.commentReplies })}</b></> : null}
              {plan.privateNotes + plan.drawings > 0 ? <> · {t("spaces.copy.willSkip")}: <b className="text-text">{plan.privateNotes + plan.drawings}</b></> : null}
            </p>
          )}
          {plan && plan.total > 200 && (
            <Banner tone="warning" data-copy-big>
              {t("spaces.copy.big", { count: plan.total })}
            </Banner>
          )}
          <OptionCheckbox
            checked={commentsOn}
            onChange={setCopyComments}
            disabled={!commentsAllowedFor(dest) || (plan?.commentRoots ?? 0) === 0}
            label={t("spaces.copy.comments")}
            description={
              !commentsAllowedFor(dest)
                ? t("spaces.copy.commentsFile")
                : (plan?.commentRoots ?? 0) === 0
                  ? t("spaces.copy.commentsNone")
                  : `${t("spaces.copy.commentsHint")}${plan && plan.commentsSkippedPrivate > 0 ? ` ${t("spaces.copy.commentsPrivate", { count: plan.commentsSkippedPrivate })}` : ""}`
            }
            attrs={{ "data-copy-comments": "" }}
          />
          {showArchive && <OptionCheckbox checked={archive} onChange={setArchive} label={t("spaces.copy.archive")} description={t("spaces.copy.archiveHint")} attrs={{ "data-copy-archive": "" }} />}
          <Banner tone="info" data-copy-loss>
            <p className="font-semibold">{t("spaces.copy.lossTitle")}</p>
            <p className="mt-1 text-small">{t(dest === "teamFile" ? "spaces.copy.lossToFile" : dest === "teamNew" ? "spaces.copy.lossToNew" : "spaces.copy.lossToSpace")}</p>
          </Banner>
          {error && (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {stepsList}
          {phase === "done" && outcome && (
            <div className="space-y-3" data-copy-result>
              <p className="text-body font-semibold text-text">{t("spaces.copy.done", { count: outcome.copy.done })}</p>
              {outcome.comments && <p className="text-small text-text-secondary">{t("spaces.copy.doneComments", { roots: outcome.comments.roots, replies: outcome.comments.replies })}</p>}
              {outcome.archived && <p className="text-small text-text-secondary">{t("spaces.copy.doneArchive")}</p>}
              {outcome.commentsFailed && <Banner tone="warning">{t("spaces.copy.warnComments")}</Banner>}
              {outcome.archiveFailed && <Banner tone="warning">{t("spaces.copy.warnArchive")}</Banner>}
              {totalSkipped(outcome.copy) > 0 && (
                <Banner tone="warning" data-copy-skipped>
                  <p className="font-semibold">{t("spaces.copy.skipped", { count: totalSkipped(outcome.copy) })}</p>
                  <ul className="mt-1 list-disc pl-5 text-small">
                    {skipLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </Banner>
              )}
            </div>
          )}
          {phase === "failed" && failure && (
            <InlineAlert data-copy-failed>
              <b>{t("spaces.copy.failTitle", { step: t(`spaces.copy.step.${failure.step}` as const) })}</b>
              <br />
              {failure.message}
              <br />
              {failure.created && !failure.rolledBack ? t("spaces.copy.failOrphan") : failure.created === "file" ? t("spaces.copy.failRolledFile") : failure.created === "space" ? t("spaces.copy.failRolledSpace") : t("spaces.copy.failNothing")}
            </InlineAlert>
          )}
        </div>
      )}
    </SpaceDialog>
  );
}
