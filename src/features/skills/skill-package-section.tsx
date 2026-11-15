"use client";

import { useRef, useState } from "react";
import { FilePlus2 } from "@/components/icons/file-plus-2";
import { FileText } from "@/components/icons/file-text";
import { Loader2 } from "@/components/icons/loader-2";
import { Pencil } from "@/components/icons/pencil";
import { RefreshCw } from "@/components/icons/refresh-cw";
import { Replace } from "@/components/icons/replace";
import { Trash2 } from "@/components/icons/trash-2";
import { Upload } from "@/components/icons/upload";
import { X } from "@/components/icons/x";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { FormDisclosure, FormField, formTextInputClassName } from "@/features/content/compose-form";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { SKILL_ALLOWED_EXTENSIONS, SKILL_LIMITS } from "@/lib/skills/limits";
import { formatBytes, isEditablePath, joinSkillPath, SKILL_FOLDERS, type SkillFolder } from "@/lib/skills/paths";
import { validateSkillPath, type SkillIssue } from "@/lib/skills/package-validate";
import { removeSkillFile, skillErrorMessage, type SkillFile } from "@/lib/supabase/skill-package";
import { SkillIssueList, issueText } from "./skill-issues";
import type { SkillUploads } from "./use-skill-uploads";

type Folder = SkillFolder | "";

const FOLDERS: readonly Folder[] = [...SKILL_FOLDERS, ""];
const FOLDER_KEYS: Record<Folder, { label: TranslationKey; hint: TranslationKey }> = {
  rules: { label: "skill.pkg.folder.rules", hint: "skill.pkg.folder.rulesHint" },
  references: { label: "skill.pkg.folder.references", hint: "skill.pkg.folder.referencesHint" },
  examples: { label: "skill.pkg.folder.examples", hint: "skill.pkg.folder.examplesHint" },
  scripts: { label: "skill.pkg.folder.scripts", hint: "skill.pkg.folder.scriptsHint" },
  tools: { label: "skill.pkg.folder.tools", hint: "skill.pkg.folder.toolsHint" },
  "": { label: "skill.pkg.folder.root", hint: "skill.pkg.folder.rootHint" },
};

const ACCEPT = SKILL_ALLOWED_EXTENSIONS.map((extension) => `.${extension}`).join(",");

function inFolder(file: SkillFile, folder: Folder): boolean {
  return folder ? file.path.startsWith(`${folder}/`) : !SKILL_FOLDERS.some((name) => file.path.startsWith(`${name}/`));
}

/**
 * Gelişmiş mod: paket dosyaları (docs/history/389-*). Beş sabit klasör (kurallar, referanslar, örnekler, betikler, araç tanımı) + kök dosyalar, her biri bir
 * `FormDisclosure`. Dosya yükleme ilerleme/iptal/yeniden dene ile (`useSkillUploads`); metin dosyaları tam ekran düzenleyicide açılır. Hiçbir dosya çalıştırılmaz.
 */
export function SkillPackageSection({
  files,
  onFileRemoved,
  uploads,
  onEdit,
  onImportZip,
  onImportFolder,
  importing,
  importIssues,
  disabled,
}: {
  files: SkillFile[];
  onFileRemoved: (file: SkillFile) => void;
  uploads: SkillUploads;
  onEdit: (path: string, isNew: boolean) => void;
  onImportZip: (file: File) => void;
  /** Klasör seçicisinden gelen dosyalar (`webkitRelativePath` dolu); ZIP ile aynı kurallardan geçer. */
  onImportFolder: (files: File[]) => void;
  importing: boolean;
  importIssues: SkillIssue[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const zipInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [newIn, setNewIn] = useState<Folder | null>(null);
  const [removing, setRemoving] = useState<SkillFile | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await removeSkillFile(removing);
      onFileRemoved(removing);
      setRemoving(null);
    } catch (error) {
      setRemoveError(skillErrorMessage(error));
    } finally {
      setRemoveBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-skill-package="">
      <p className="text-small text-text-secondary">{t("skill.pkg.intro")}</p>
      <InlineAlert tone="info">{t("skill.pkg.noRunNotice")}</InlineAlert>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled || importing} onClick={() => zipInput.current?.click()} data-skill-import-zip="">
          {importing ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Upload size={16} aria-hidden />} {t("skill.pkg.importZip")}
        </Button>
        <input
          ref={zipInput}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          tabIndex={-1}
          aria-label={t("skill.pkg.importZip")}
          data-skill-zip-input=""
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = "";
            if (picked) onImportZip(picked);
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={disabled || importing} onClick={() => folderInput.current?.click()} data-skill-import-folder="">
          <Upload size={16} aria-hidden /> {t("skill.pkg.importFolder")}
        </Button>
        <input
          ref={folderInput}
          type="file"
          // @ts-expect-error `webkitdirectory` standart olmayan ama tüm büyük tarayıcılarda çalışan klasör seçici özniteliğidir
          webkitdirectory=""
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label={t("skill.pkg.importFolder")}
          data-skill-folder-input=""
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (picked.length > 0) onImportFolder(picked);
          }}
        />
        <span className="text-caption text-text-muted" data-skill-package-total="">
          {t("skill.pkg.total", { count: String(files.length), size: formatBytes(totalBytes), max: formatBytes(SKILL_LIMITS.maxTotalBytes) })}
        </span>
      </div>

      {importIssues.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border-soft bg-surface-soft px-3 py-3" role="status" data-skill-import-report="">
          <p className="text-small font-semibold text-text">{t("skill.pkg.importReport")}</p>
          <SkillIssueList issues={importIssues} />
        </div>
      )}

      {uploads.tasks.length > 0 && (
        <ul className="space-y-2" aria-label={t("skill.pkg.uploads")} data-skill-uploads="">
          {uploads.tasks.map((task) => (
            <li key={task.id} className="rounded-xl border border-border-soft bg-surface-soft px-3 py-2" data-upload-status={task.status}>
              <div className="flex items-center gap-2 text-small">
                <code className="min-w-0 flex-1 truncate font-mono text-caption text-text">{task.path}</code>
                <span className="shrink-0 text-caption text-text-muted">{formatBytes(task.size)}</span>
                {task.status === "uploading" && (
                  <button type="button" onClick={() => uploads.cancel(task.id)} aria-label={t("skill.pkg.cancelUpload")} className="rounded-full p-1 text-text-muted hover:bg-surface hover:text-text">
                    <X size={14} />
                  </button>
                )}
                {task.status === "error" && (
                  <>
                    {task.issues.length === 0 && (
                      <button type="button" onClick={() => uploads.retry(task.id)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-caption font-semibold text-primary hover:bg-primary-soft">
                        <RefreshCw size={12} aria-hidden /> {t("common.retry")}
                      </button>
                    )}
                    <button type="button" onClick={() => uploads.dismiss(task.id)} aria-label={t("common.close")} className="rounded-full p-1 text-text-muted hover:bg-surface hover:text-text">
                      <X size={14} />
                    </button>
                  </>
                )}
                {task.status === "done" && <span className="text-caption font-semibold text-success">{t("skill.pkg.uploaded")}</span>}
              </div>
              {task.status === "uploading" && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border-soft" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(task.progress * 100)} aria-label={task.path}>
                  <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.round(task.progress * 100)}%` }} />
                </div>
              )}
              {task.status === "error" && (task.issues.length > 0 ? <div className="mt-1.5"><SkillIssueList issues={task.issues} /></div> : <p role="alert" className="mt-1 text-caption text-danger">{task.message}</p>)}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3">
        {FOLDERS.map((folder) => {
          const group = files.filter((file) => inFolder(file, folder));
          const keys = FOLDER_KEYS[folder];
          return (
            <FormDisclosure key={folder || "root"} id={`skill-folder-${folder || "root"}`} label={t(keys.label)} hint={t(keys.hint)} value={group.length > 0 ? t("skill.pkg.fileCount", { count: String(group.length) }) : t("skill.pkg.empty")}>
              {folder === "scripts" && <InlineAlert tone="warning">{t("skill.pkg.scriptsNotice")}</InlineAlert>}
              <FolderBody
                folder={folder}
                files={group}
                disabled={disabled}
                onUpload={(picked) => {
                  void Promise.all(picked.map(async (file) => ({ path: joinSkillPath(folder, file.name), bytes: new Uint8Array(await file.arrayBuffer()) }))).then((items) => uploads.enqueue(items));
                }}
                // Değiştirme aynı YOLA yazar (alt klasördeki dosya da yerinde değişir; yol dosya adından yeniden kurulmaz).
                onReplace={(target, picked) => {
                  void picked.arrayBuffer().then((buffer) => uploads.enqueue([{ path: target.path, bytes: new Uint8Array(buffer) }]));
                }}
                onEdit={(path) => onEdit(path, false)}
                onNew={() => setNewIn(folder)}
                onRemove={(file) => {
                  setRemoveError(null);
                  setRemoving(file);
                }}
              />
            </FormDisclosure>
          );
        })}
      </div>

      {newIn !== null && (
        <NewFileDialog
          folder={newIn}
          existing={files}
          onClose={() => setNewIn(null)}
          onCreate={(path) => {
            setNewIn(null);
            onEdit(path, true);
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          id="skill-file-remove"
          title={t("skill.pkg.removeTitle")}
          body={t("skill.pkg.removeBody", { path: removing.path })}
          confirmLabel={t("skill.pkg.remove")}
          danger
          busy={removeBusy}
          error={removeError}
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function FolderBody({
  folder,
  files,
  disabled,
  onUpload,
  onReplace,
  onEdit,
  onNew,
  onRemove,
}: {
  folder: Folder;
  files: SkillFile[];
  disabled?: boolean;
  onUpload: (files: File[]) => void;
  onReplace: (target: SkillFile, picked: File) => void;
  onEdit: (path: string) => void;
  onNew: () => void;
  onRemove: (file: SkillFile) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<SkillFile | null>(null);
  return (
    <div className="space-y-3" data-skill-folder={folder || "root"}>
      {files.length > 0 ? (
        <ul className="divide-y divide-border-soft rounded-xl border border-border-soft" aria-label={t("skill.pkg.filesIn")}>
          {files.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-skill-file={file.path}>
              <FileText size={16} className="shrink-0 text-text-muted" aria-hidden />
              <code className="min-w-0 flex-1 break-all font-mono text-caption text-text">{file.path}</code>
              {file.isScript && <Badge variant="warning">{t("skill.pkg.scriptBadge")}</Badge>}
              <span className="shrink-0 text-caption text-text-muted">{formatBytes(file.size)}</span>
              <span className="flex shrink-0 items-center gap-0.5">
                {isEditablePath(file.path, file.size) && (
                  <button type="button" onClick={() => onEdit(file.path)} disabled={disabled} aria-label={t("skill.pkg.editFile", { path: file.path })} data-skill-file-edit="" className="rounded-full p-1.5 text-text-muted hover:bg-surface-soft hover:text-text">
                    <Pencil size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setReplaceTarget(file);
                    replaceInput.current?.click();
                  }}
                  disabled={disabled}
                  aria-label={t("skill.pkg.replaceFile", { path: file.path })}
                  className="rounded-full p-1.5 text-text-muted hover:bg-surface-soft hover:text-text"
                >
                  <Replace size={16} />
                </button>
                <button type="button" onClick={() => onRemove(file)} disabled={disabled} aria-label={t("skill.pkg.removeFile", { path: file.path })} data-skill-file-remove="" className="rounded-full p-1.5 text-text-muted hover:bg-surface-soft hover:text-danger">
                  <Trash2 size={16} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-4 text-center text-small text-text-muted">{t("skill.pkg.folderEmpty")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => input.current?.click()} data-skill-upload="">
          <Upload size={16} aria-hidden /> {t("skill.pkg.upload")}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onNew} data-skill-new-file="">
          <FilePlus2 size={16} aria-hidden /> {t("skill.pkg.newFile")}
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label={t("skill.pkg.upload")}
          data-skill-file-input=""
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (picked.length > 0) onUpload(picked);
          }}
        />
        <input
          ref={replaceInput}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label={t("skill.pkg.replace")}
          onChange={(event) => {
            const picked = event.target.files?.[0];
            const target = replaceTarget;
            event.target.value = "";
            if (picked && target) onReplace(target, picked);
          }}
        />
      </div>
    </div>
  );
}

function NewFileDialog({ folder, existing, onClose, onCreate }: { folder: Folder; existing: SkillFile[]; onClose: () => void; onCreate: (path: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const defaultExtension = folder === "tools" ? "json" : folder === "scripts" ? "sh" : "md";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const path = joinSkillPath(folder, name.trim() || "new-file", defaultExtension);
    const issue = validateSkillPath(path);
    if (issue) return setError(issueText(issue, t));
    if (existing.some((file) => file.path.toLowerCase() === path.toLowerCase())) return setError(t("skill.pkg.alreadyExists"));
    onCreate(path);
  }

  return (
    <SpaceDialog
      title={t("skill.pkg.newFileTitle")}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit">{t("skill.pkg.create")}</Button>
        </>
      }
    >
      <FormField label={t("skill.pkg.fileName")} htmlFor="skill-new-file-name" hint={t("skill.pkg.fileNameHint", { folder: folder ? `${folder}/` : "/", ext: defaultExtension })} error={error}>
        <input
          id="skill-new-file-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          maxLength={80}
          placeholder={`style.${defaultExtension}`}
          className={formTextInputClassName}
        />
      </FormField>
    </SpaceDialog>
  );
}
