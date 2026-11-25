"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "@/components/icons/loader-2";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Input, Select, fieldLabelClassName } from "@/components/ui/field";
import { useTranslation } from "@/lib/i18n/language-provider";
import { copySpaceItems, totalSkipped, type CopyResult } from "@/lib/supabase/space-copy";
import { createSpace, listSpaces, type SpaceSummary } from "@/lib/supabase/spaces";
import { listProjects, type ProjectSummary } from "@/lib/supabase/team-projects";
import { listMyTeams, type TeamSummary } from "@/lib/supabase/teams";
import { projectLink } from "@/lib/team-projects";
import { spaceHref } from "@/lib/spaces";
import { SpaceDialog } from "./space-modals";

type Destination = "new" | "space" | "file";

/**
 * Öğeleri başka bir yere kopyalama penceresi (docs/history/461-*): yeni Space · var olan Space · ekip dosyası. Kaynak bir kişisel Space, bir ekip
 * dosyasının alanı ya da panoda seçilen öğelerdir. Neyin kopyalanmadığı (gizli not, onay durumu, yorumlar…) baştan söylenir; sonuçta sayılarla gösterilir.
 */
export function CopyItemsDialog({
  sourceSpaceId,
  sourceTitle,
  itemIds,
  defaultDestination = "new",
  onClose,
}: {
  sourceSpaceId: string;
  sourceTitle: string;
  /** Verilirse yalnız bu öğeler; yoksa kaynağın tamamı. */
  itemIds?: string[] | null;
  defaultDestination?: Destination;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [destination, setDestination] = useState<Destination>(defaultDestination);
  const [title, setTitle] = useState(() => t("spaces.copy.defaultTitle", { title: sourceTitle }).slice(0, 80));
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [spaceId, setSpaceId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [fileAreaId, setFileAreaId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ data: CopyResult; href: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void listSpaces({ filter: "all", limit: 60 })
      .then((list) => alive && setSpaces(list.filter((space) => space.id !== sourceSpaceId && !space.teamId && !space.archivedAt && (space.myRole === "owner" || space.myRole === "editor"))))
      .catch(() => alive && setSpaces([]));
    void listMyTeams()
      .then((page) => alive && setTeams(page.items))
      .catch(() => alive && setTeams([]));
    return () => {
      alive = false;
    };
  }, [sourceSpaceId]);

  useEffect(() => {
    if (!teamId) return;
    let alive = true;
    void listProjects(teamId)
      .then((list) => alive && setProjects(list.filter((project) => !project.archivedAt && (project.myRole === "edit" || project.myRole === "lead"))))
      .catch(() => alive && setProjects([]));
    return () => {
      alive = false;
    };
  }, [teamId]);

  const project = useMemo(() => projects?.find((entry) => entry.id === projectId) ?? null, [projects, projectId]);
  const files = useMemo(() => (project?.files ?? []).filter((file) => file.mainAreaId && file.mainAreaId !== sourceSpaceId), [project, sourceSpaceId]);

  const ready = destination === "new" ? title.trim().length > 0 : destination === "space" ? Boolean(spaceId) : Boolean(fileAreaId);

  async function run() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      let target = destination === "space" ? spaceId : fileAreaId;
      let href = destination === "file" ? projectLink(teamId, projectId, { file: files.find((file) => file.mainAreaId === fileAreaId)?.id ?? undefined }) : spaceHref(target);
      if (destination === "new") {
        target = await createSpace({ title, description: "", kind: "free", groups: [] });
        href = spaceHref(target);
      }
      const data = await copySpaceItems({ fromSpaceId: sourceSpaceId, toSpaceId: target, itemIds });
      setResult({ data, href });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  const skipped = result ? totalSkipped(result.data) : 0;
  return (
    <SpaceDialog
      title={t("spaces.copy.title")}
      onClose={onClose}
      busy={busy}
      overLayers
      formTestId="copy-items-dialog"
      onSubmit={(event) => {
        event.preventDefault();
        if (!result) void run();
      }}
      footer={
        result ? (
          <>
            <Link href={result.href} className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-small font-semibold text-primary-foreground" data-copy-open>
              {t("spaces.copy.open")}
            </Link>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.close")}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!ready || busy} data-copy-run>
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {t("spaces.copy.run")}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3" data-copy-result>
          <p className="text-body font-semibold text-text">{t("spaces.copy.done", { count: result.data.done })}</p>
          {skipped > 0 && (
            <Banner tone="warning" data-copy-skipped>
              <p className="font-semibold">{t("spaces.copy.skipped", { count: skipped })}</p>
              <ul className="mt-1 list-disc pl-5 text-small">
                {result.data.skipped.privateNote > 0 && <li>{t("spaces.copy.skip.privateNote", { count: result.data.skipped.privateNote })}</li>}
                {result.data.skipped.media > 0 && <li>{t("spaces.copy.skip.media", { count: result.data.skipped.media })}</li>}
                {result.data.skipped.unavailable > 0 && <li>{t("spaces.copy.skip.unavailable", { count: result.data.skipped.unavailable })}</li>}
                {result.data.skipped.drawingInFile > 0 && <li>{t("spaces.copy.skip.drawingInFile", { count: result.data.skipped.drawingInFile })}</li>}
                {result.data.skipped.duplicate > 0 && <li>{t("spaces.copy.skip.duplicate", { count: result.data.skipped.duplicate })}</li>}
              </ul>
            </Banner>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-small text-text-secondary">
            {itemIds && itemIds.length > 0 ? t("spaces.copy.fromSelection", { count: itemIds.length, title: sourceTitle }) : t("spaces.copy.fromSpace", { title: sourceTitle })}
          </p>
          <ChoiceGroup<Destination>
            ariaLabel={t("spaces.copy.destination")}
            variant="segmented"
            value={destination}
            onChange={setDestination}
            options={[
              { key: "new", label: t("spaces.copy.dest.new") },
              { key: "space", label: t("spaces.copy.dest.space") },
              { key: "file", label: t("spaces.copy.dest.file") },
            ]}
          />
          {destination === "new" && (
            <div>
              <label className={fieldLabelClassName} htmlFor="copy-title">
                {t("spaces.copy.newTitle")}
              </label>
              <Input id="copy-title" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
            </div>
          )}
          {destination === "space" && (
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
          {destination === "file" && (
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
                    setFileAreaId("");
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
                      setFileAreaId("");
                    }}
                  >
                    <option value="">{projects === null ? t("common.loading") : projects.length === 0 ? t("spaces.copy.noProjects") : t("spaces.copy.choose")}</option>
                    {(projects ?? []).map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.title}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {projectId && (
                <div>
                  <label className={fieldLabelClassName} htmlFor="copy-file">
                    {t("spaces.copy.pickFile")}
                  </label>
                  <Select id="copy-file" value={fileAreaId} onChange={(event) => setFileAreaId(event.target.value)}>
                    <option value="">{files.length === 0 ? t("spaces.copy.noFiles") : t("spaces.copy.choose")}</option>
                    {files.map((file) => (
                      <option key={file.id} value={file.mainAreaId ?? ""}>
                        {file.title}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          )}
          <Banner tone="info" data-copy-loss>
            <p className="font-semibold">{t("spaces.copy.lossTitle")}</p>
            <p className="mt-1 text-small">{t(destination === "file" ? "spaces.copy.lossToFile" : "spaces.copy.lossToSpace")}</p>
          </Banner>
          {error && (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </SpaceDialog>
  );
}
