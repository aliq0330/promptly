"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DescriptionField, FormError, SubmitButton, TitleField } from "@/features/spaces/space-forms";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import {
  archiveProject,
  createBoard,
  createBoardInGroup,
  createFile,
  deleteFile,
  deleteProject,
  fetchProjectAccess,
  renameFile,
  setProjectAccess,
  setVariable,
  updateProject,
  type ProjectAccessEntry,
  type ProjectAccessMode,
  type ProjectDetail,
  type ProjectVariable,
} from "@/lib/supabase/team-projects";
import { addProjectChannel, type TeamActionError } from "@/lib/supabase/teams";
import { ProjectAccessEditor } from "./project-access-editor";
import { PillChoice, Switch } from "./team-ui";

/** Proje/dosya/pano/değişken pencereleri (docs/history/362-*). Hepsi `SpaceDialog` iskeletidir (başlık + kayan gövde + sabit alt satır). */

const errorText = (e: unknown) => (e as TeamActionError).message;

export function NewFileDialog({ project, onClose, onDone }: { project: ProjectDetail; onClose: () => void; onDone: (fileId: string) => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [review, setReview] = useState(project.project.reviewDefault);
  // Dosya sohbeti KENDİLİĞİNDEN açılmaz (docs/history/369-*): bilerek sorulur, varsayılan kapalı; sonradan dosya bilgisinden ya da proje sohbet sayfasından da açılabilir.
  const [withChat, setWithChat] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    // Dosya oluştu ama sohbet açılamadıysa ikinci basış yeniden dosya açmaz, dosyaya götürür.
    if (created) return onDone(created);
    if (!title.trim()) return setError(t("tp.error.titleRequired"));
    setBusy(true);
    setError(null);
    let fileId: string;
    try {
      fileId = await createFile(project.project.id, title.trim(), review);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
      return;
    }
    if (withChat) {
      try {
        await addProjectChannel(project.project.id, { file: fileId });
      } catch {
        setCreated(fileId);
        setError(t("th.newFile.chatFailed"));
        setBusy(false);
        return;
      }
    }
    onDone(fileId);
  };
  return (
    <SpaceDialog
      title={t("tp.file.new")}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void submit(event)}
      formTestId="team-new-file-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{created ? t("th.newFile.goToFile") : t("tp.file.create")}</SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <TitleField value={title} onChange={setTitle} label={t("tp.name.file")} placeholder={t("tp.name.filePlaceholder")} autoFocus />
        <ReviewSwitchRow value={review} onChange={setReview} />
        <div data-new-file-chat className="flex items-start gap-3 rounded-lg border border-border-soft bg-surface p-4">
          <div className="min-w-0 flex-1">
            <p className="text-small font-bold text-text">{t("th.newFile.chatTitle")}</p>
            <p className="text-caption text-text-secondary">{t("th.newFile.chatHint")}</p>
          </div>
          <span className={cn(created && "pointer-events-none opacity-60")}>
            <Switch checked={withChat} onChange={setWithChat} label={t("th.newFile.chatSwitch")} />
          </span>
        </div>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}

/** "Bu dosyada onay: açık/kapalı" satırı (yeni dosya + dosya sayfası aynı sözleşmeyi gösterir). */
export function ReviewSwitchRow({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border-soft px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-small font-bold text-text">{t(value ? "tp.review.switchOn" : "tp.review.switchOff")}</span>
        <span className="block text-caption text-text-secondary">{t("tp.review.switchHint")}</span>
      </span>
      <Switch checked={value} onChange={onChange} label={t("tp.review.switchLabel")} />
    </div>
  );
}

export function RenameFileDialog({ file, onClose, onDone }: { file: { id: string; title: string }; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(file.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError(t("tp.error.titleRequired"));
    setBusy(true);
    try {
      await renameFile(file.id, title.trim());
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <SpaceDialog
      title={t("tp.file.rename")}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void submit(event)}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{t("common.save")}</SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <TitleField value={title} onChange={setTitle} label={t("tp.name.file")} placeholder={t("tp.name.filePlaceholder")} autoFocus />
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}

/**
 * Yeni pano. `fromBoard` verilirse (açık panodan "Yeni pano") yeni pano o panonun yanına eklenir ve ikisi bir PANO GRUBU olur;
 * verilmezse dosyada BAĞIMSIZ bir pano açılır (docs/history/368-*).
 */
export function NewBoardDialog({ projectId, fileId, fromBoard, onClose, onDone }: { projectId: string; fileId: string | null; fromBoard?: string | null; onClose: () => void; onDone: (boardId: string) => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError(t("tp.error.titleRequired"));
    setBusy(true);
    setError(null);
    try {
      onDone(fromBoard ? await createBoardInGroup(fromBoard, title.trim()) : await createBoard(projectId, title.trim(), fileId ?? ""));
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <SpaceDialog
      title={t("tp.board.new")}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void submit(event)}
      formTestId="team-new-board-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{t("tp.board.create")}</SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <TitleField value={title} onChange={setTitle} label={t("tp.name.board")} placeholder={t("tp.name.boardPlaceholder")} autoFocus />
        <p className="text-caption text-text-muted">{t(fileId ? "tp.board.hintFile" : "tp.board.hintProject")}</p>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}

/** Erişim: seçilenler / tüm ekip + kişi-grup rolleri. Kendini kilitleme (lider girişi olmadan kaydetme) sunucuda reddedilir. */
export function ProjectAccessDialog({ project, onClose, onDone }: { project: ProjectDetail; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [mode, setMode] = useState<ProjectAccessMode>(project.project.accessMode);
  const [baseRole, setBaseRole] = useState<"view" | "edit">(project.project.baseRole);
  const [entries, setEntries] = useState<ProjectAccessEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetchProjectAccess(project.project.id).then(
      (data) => setEntries(data.entries),
      (e) => setError(errorText(e)),
    );
  }, [project.project.id]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!entries) return;
    setBusy(true);
    setError(null);
    try {
      await setProjectAccess(project.project.id, mode, baseRole, entries);
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <SpaceDialog
      title={t("tp.access.title")}
      eyebrow={project.project.title}
      onClose={onClose}
      busy={busy}
      wide
      onSubmit={(event) => void submit(event)}
      formTestId="team-project-access-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy} disabled={!entries}>
            {t("common.save")}
          </SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <PillChoice
            ariaLabel={t("tp.create.whoSees")}
            value={mode}
            onChange={setMode}
            options={[
              { key: "selected", label: t("tp.access.mode.selected") },
              { key: "all", label: t("tp.access.mode.all") },
            ]}
          />
          <p className="mt-1.5 text-caption text-text-muted">{t(mode === "selected" ? "tp.access.mode.selectedHint" : "tp.access.mode.allHint")}</p>
          {mode === "all" && (
            <div className="mt-3">
              <span className="mb-1.5 block text-caption font-semibold text-text-secondary">{t("tp.access.baseRole")}</span>
              <PillChoice
                ariaLabel={t("tp.access.baseRole")}
                value={baseRole}
                onChange={setBaseRole}
                options={[
                  { key: "view", label: t("tp.role.view") },
                  { key: "edit", label: t("tp.role.edit") },
                ]}
              />
            </div>
          )}
        </div>
        {entries ? <ProjectAccessEditor teamId={project.project.teamId} entries={entries} onChange={setEntries} lockedUserId={user?.id ?? null} /> : <p className="text-small text-text-muted">{t("common.loading")}</p>}
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}

/** Ayarlar: ad, açıklama, yeni dosyalarda onay varsayılanı; arşivle; sil (adı yazarak onayla). */
export function ProjectSettingsDialog({ project, canManage, onClose, onDone, onDeleted }: { project: ProjectDetail; canManage: boolean; onClose: () => void; onDone: () => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(project.project.title);
  const [description, setDescription] = useState(project.project.description);
  const [review, setReview] = useState(project.project.reviewDefault);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archived = Boolean(project.project.archivedAt);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError(t("tp.error.titleRequired"));
    setBusy(true);
    setError(null);
    try {
      await updateProject(project.project.id, { title: title.trim(), description: description.trim(), reviewDefault: review });
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const toggleArchive = async () => {
    setBusy(true);
    setError(null);
    try {
      await archiveProject(project.project.id, !archived);
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteProject(project.project.id, confirm.trim());
      onDeleted();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <SpaceDialog
      title={t("tp.settings.title")}
      eyebrow={project.project.title}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void save(event)}
      formTestId="team-project-settings-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{t("common.save")}</SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <TitleField value={title} onChange={setTitle} label={t("tp.name.project")} placeholder={t("tp.name.projectPlaceholder")} />
        <DescriptionField value={description} onChange={setDescription} />
        <ReviewSwitchRow value={review} onChange={setReview} />
        {canManage && (
          <div className="space-y-3 rounded-xl border border-border-soft p-4">
            <Button type="button" variant="outline" onClick={() => void toggleArchive()} disabled={busy}>
              {t(archived ? "tp.settings.restore" : "tp.settings.archive")}
            </Button>
            <p className="text-caption text-text-muted">{t(archived ? "tp.settings.restoreHint" : "tp.settings.archiveHint")}</p>
            {!deleting ? (
              <Button type="button" variant="outline" className="text-danger" onClick={() => setDeleting(true)} disabled={busy}>
                {t("tp.settings.delete")}
              </Button>
            ) : (
              <div className="space-y-2" data-project-delete-confirm>
                <p className="text-small text-danger">{t("tp.settings.deleteBody", { title: project.project.title })}</p>
                <input
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  aria-label={t("tp.settings.deleteConfirm")}
                  placeholder={project.project.title}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-small"
                />
                <Button type="button" variant="outline" className="text-danger" disabled={busy || confirm.trim().toLowerCase() !== project.project.title.toLowerCase()} onClick={() => void remove()}>
                  {t("tp.settings.deleteConfirmButton")}
                </Button>
              </div>
            )}
          </div>
        )}
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}

export function DeleteFileDialog({ file, onClose, onDone }: { file: { id: string; title: string }; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      await deleteFile(file.id);
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <SpaceDialog
      title={t("tp.file.deleteTitle")}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant="outline" className="text-danger" onClick={() => void run()} disabled={busy}>
            {t("tp.file.deleteConfirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-small text-text-secondary">{t("tp.file.deleteBody", { title: file.title })}</p>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}

/** Değişken ekle/düzenle: ad (düzenlemede sabit) + değer; kapsam çağıranın verdiği dosya (null = proje). */
export function VariableDialog({ projectId, fileId, variable, onClose, onDone }: { projectId: string; fileId: string | null; variable: ProjectVariable | null; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(variable?.name ?? "");
  const [value, setValue] = useState(variable?.value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(name.trim());
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return setError(t("tp.variable.invalidName"));
    setBusy(true);
    setError(null);
    try {
      await setVariable(projectId, name.trim(), value, fileId);
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <SpaceDialog
      title={t(variable ? "tp.variable.edit" : "tp.variable.new")}
      eyebrow={t(fileId ? "tp.variable.scopeFile" : "tp.variable.scopeProject")}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void submit(event)}
      formTestId="team-variable-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{t("common.save")}</SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-label font-semibold text-text">{t("tp.variable.name")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={Boolean(variable)}
            maxLength={40}
            placeholder="musteri"
            autoCapitalize="none"
            autoCorrect="off"
            className="h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-small disabled:opacity-50"
          />
          <span className="mt-1 block text-caption text-text-muted">{t("tp.variable.nameHint")}</span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-label font-semibold text-text">{t("tp.variable.value")}</span>
          <input value={value} onChange={(event) => setValue(event.target.value)} maxLength={500} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-small" />
        </label>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}
