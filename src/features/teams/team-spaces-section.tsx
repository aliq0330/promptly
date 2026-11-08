"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Lock } from "@/components/icons/lock";
import { Plus } from "@/components/icons/plus";
import { Shapes } from "@/components/icons/shapes";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldLabelClassName } from "@/components/ui/field";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListState } from "@/features/feed/paged-list-state";
import { DescriptionField, FormError, KindField, SubmitButton, TemplateField, TitleField } from "@/features/spaces/space-forms";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { SpaceCoverArt } from "@/features/spaces/space-visuals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SPACE_KIND_LABEL, SPACE_KINDS, SPACE_TEMPLATE_GROUPS, spaceHref, type SpaceKind } from "@/lib/spaces";
import { createTeamSpace, fetchSpaceAccess, listTeamSpaces, setSpaceAccess, type AccessEntry, type TeamActionError, type TeamSpaceRow } from "@/lib/supabase/teams";
import { AccessEditor } from "./access-editor";
import type { TeamCtx } from "./team-page";
import { PillChoice } from "./team-ui";

const CREATE_KINDS: readonly SpaceKind[] = SPACE_KINDS.filter((kind) => kind !== "team_library");

type AccessMode = "all" | "selected" | "admins";

/** Space'ler sekmesi: ekibin ortak Space'leri, "Yeni Space" (create_spaces yetkisi) ve her Space'in erişim penceresi. */
export function TeamSpacesSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team, can } = ctx;
  const [createOpen, setCreateOpen] = useState(false);
  const [accessFor, setAccessFor] = useState<TeamSpaceRow | null>(null);
  const [version, setVersion] = useState(0);
  const list = usePagedList<TeamSpaceRow>(`team-spaces|${team.id}|${version}`, true, (offset) => listTeamSpaces(team.id, offset));

  return (
    <section className="space-y-4" data-testid="team-spaces">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small text-text-secondary">{t("tm.spaces.intro")}</p>
        {can("create_spaces") && (
          <Button type="button" onClick={() => setCreateOpen(true)} data-team-new-space>
            <Plus size={16} aria-hidden />
            {t("tm.spaces.new")}
          </Button>
        )}
      </div>

      <PagedListState list={list}>
        {list.items.length === 0 && !list.failed ? (
          <EmptyState icon={Shapes} title={t("tm.spaces.empty.title")} description={t("tm.spaces.empty.body")} action={can("create_spaces") ? { label: t("tm.spaces.new"), onClick: () => setCreateOpen(true) } : undefined} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.items.map((space) => (
              <li key={space.id} data-space-card={space.id} className="flex flex-col overflow-hidden rounded-xl border border-border-soft bg-surface shadow-card">
                <Link href={spaceHref(space.id)} className="block">
                  <SpaceCoverArt urls={space.previewUrls ?? []} className="aspect-[16/9] w-full" />
                </Link>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <Link href={spaceHref(space.id)} className="min-w-0">
                    <span className="block truncate text-body font-semibold">{space.isLibrary ? t("tm.spaces.library") : space.title}</span>
                    <span className="block truncate text-caption text-text-muted">
                      {t(SPACE_KIND_LABEL[space.kind as SpaceKind] ?? "spaces.kind.free")} · {t("tm.spaces.counts", { images: space.imageCount, prompts: space.promptCount })}
                    </span>
                  </Link>
                  <div className="mt-auto flex flex-wrap items-center gap-2 text-caption text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      {space.accessMode !== "all" && <Lock size={12} aria-hidden />}
                      {t(space.accessMode === "all" ? "tm.access.mode.all" : space.accessMode === "admins" ? "tm.access.mode.admins" : "tm.access.mode.selected")}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{t("tm.spaces.people", { count: space.memberCount })}</span>
                    {space.guestCount > 0 && <span>· {t("tm.spaces.guests", { count: space.guestCount })}</span>}
                    {!space.isLibrary && (can("manage_members") || space.myRole === "owner") && (
                      <button type="button" onClick={() => setAccessFor(space)} className="ml-auto text-primary hover:underline" data-space-access>
                        {t("tm.spaces.access")}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PagedListState>

      {createOpen && (
        <CreateSpaceDialog
          teamId={team.id}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            setVersion((v) => v + 1);
            ctx.reload();
          }}
        />
      )}
      {accessFor && (
        <SpaceAccessDialog
          teamId={team.id}
          space={accessFor}
          onClose={() => setAccessFor(null)}
          onSaved={() => {
            setAccessFor(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </section>
  );
}

function CreateSpaceDialog({ teamId, onClose, onCreated }: { teamId: string; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<SpaceKind>("moodboard");
  const [template, setTemplate] = useState<"empty" | "template">("template");
  const [mode, setMode] = useState<AccessMode>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError(t("tm.error.space_title_required"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createTeamSpace(teamId, title.trim(), description.trim(), kind, template === "template" ? SPACE_TEMPLATE_GROUPS[kind].map((key) => t(key)) : [], mode);
      onCreated();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };

  return (
    <SpaceDialog
      title={t("tm.spaces.new")}
      onClose={onClose}
      busy={busy}
      wide
      onSubmit={(event) => void submit(event)}
      formTestId="team-create-space-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{t("tm.spaces.create")}</SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <TitleField value={title} onChange={setTitle} autoFocus />
        <DescriptionField value={description} onChange={setDescription} />
        <KindField value={kind} onChange={setKind} kinds={CREATE_KINDS} />
        <TemplateField kind={kind} value={template} onChange={setTemplate} />
        <div>
          <span className={fieldLabelClassName}>{t("tm.spaces.whoSees")}</span>
          <PillChoice
            ariaLabel={t("tm.spaces.whoSees")}
            value={mode}
            onChange={setMode}
            options={[
              { key: "all", label: t("tm.access.mode.all") },
              { key: "admins", label: t("tm.access.mode.admins") },
            ]}
          />
          <p className="mt-1.5 text-caption text-text-muted">{t("tm.spaces.whoSeesHint")}</p>
        </div>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}

/** Space erişimi: herkes / seçilenler / yalnız yönetim; seçilenlerde kişi ve grup listesi. */
export function SpaceAccessDialog({ teamId, space, onClose, onSaved }: { teamId: string; space: Pick<TeamSpaceRow, "id" | "title" | "accessMode">; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AccessMode>(space.accessMode as AccessMode);
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSpaceAccess(space.id).then(
      (data) => {
        if (cancelled) return;
        setEntries(data.entries);
        setLoaded(true);
      },
      (e: TeamActionError) => {
        if (!cancelled) setError(e.message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [space.id]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await setSpaceAccess(space.id, mode, mode === "selected" ? entries : []);
      onSaved();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };

  return (
    <SpaceDialog
      title={t("tm.spaces.accessTitle", { name: space.title })}
      onClose={onClose}
      busy={busy}
      wide
      onSubmit={(event) => void save(event)}
      formTestId="team-space-access-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy} disabled={!loaded}>
            {t("common.save")}
          </SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <PillChoice
          ariaLabel={t("tm.spaces.whoSees")}
          value={mode}
          onChange={setMode}
          options={[
            { key: "all", label: t("tm.access.mode.all"), hint: t("tm.access.mode.allHint") },
            { key: "selected", label: t("tm.access.mode.selected"), hint: t("tm.access.mode.selectedHint") },
            { key: "admins", label: t("tm.access.mode.admins"), hint: t("tm.access.mode.adminsHint") },
          ]}
        />
        {mode === "selected" && loaded && <AccessEditor teamId={teamId} entries={entries} onChange={setEntries} />}
        <p className="text-caption text-text-muted">{t("tm.spaces.accessNote")}</p>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}
