"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2 } from "@/components/icons/file-plus-2";
import { Loader2 } from "@/components/icons/loader-2";
import { RefreshCw } from "@/components/icons/refresh-cw";
import { Trash2 } from "@/components/icons/trash-2";
import { Upload } from "@/components/icons/upload";
import { X } from "@/components/icons/x";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { FormField, formTextInputClassName } from "@/features/content/compose-form";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILL_ALLOWED_EXTENSIONS, SKILL_LIMITS } from "@/lib/skills/limits";
import { folderOfPath, formatBytes, isEditablePath, joinSkillPath, SKILL_FOLDERS, type SkillFolder } from "@/lib/skills/paths";
import { decodeUtf8, validateFileContent, validateSkillPath, type SkillIssue } from "@/lib/skills/package-validate";
import { renderSkillMd } from "@/lib/skills/skill-md";
import { readSkillFileBytes, removeSkillFile, saveSkillFile, skillErrorMessage, SkillValidationError, type SkillFile } from "@/lib/supabase/skill-package";
import type { SkillLicense } from "@/types";
import { MarkdownView } from "./markdown-view";
import { SkillFileFrame } from "./skill-file-frame";
import { SkillFileTree, type SkillTreeFile } from "./skill-file-tree";
import { SkillIssueList, issueText } from "./skill-issues";
import type { SkillUploads } from "./use-skill-uploads";

const SKILL_MD = "SKILL.md";
const ACCEPT = SKILL_ALLOWED_EXTENSIONS.map((extension) => `.${extension}`).join(",");
const INSTRUCTIONS_MAX = 60000;
type Folder = SkillFolder | "";
const FOLDERS: readonly Folder[] = [...SKILL_FOLDERS, ""];

interface Buffer {
  text: string;
  original: string;
  state: "loading" | "ready" | "error";
}

/**
 * Editör "Dosyalar" bölümü (docs/history/407-*): Skill'in TÜM içeriği tek dosya gezgininde. SKILL.md (talimatın gövdesi) ağaçta ilk dosyadır;
 * kurallar, referanslar, örnekler, betikler ve araç tanımı klasörlerinin altındadır. Masaüstünde ağaç · düzenleyici · önizleme yan yana (sekme, yan panel
 * ya da pencere yok); telefonda ☰ ile ağaç aynı kartta açılır. Her dosyanın tamponu ayrı tutulur (dosya değiştirmek yazılanı kaybettirmez); kaydetmek içeriği
 * `skill-files` bucket'ına yükler. SKILL.md'nin üst bilgisi (ad, açıklama, lisans, sürüm) formdaki alanlardan ÜRETİLİR, elle yazılmaz. Hiçbir dosya çalıştırılmaz.
 */
export function SkillFilesWorkspace({
  files,
  uploads,
  slug,
  summary,
  license,
  version,
  instructions,
  onInstructionsChange,
  instructionsError,
  ensureDraft,
  importing,
  importIssues,
  onImportZip,
  onImportFolder,
  onFileSaved,
  onFileRemoved,
  onDirtyCountChange,
  disabled,
}: {
  files: SkillFile[];
  uploads: SkillUploads;
  slug: string;
  summary: string;
  license: SkillLicense;
  version: string;
  instructions: string;
  onInstructionsChange: (value: string) => void;
  instructionsError: string | null;
  ensureDraft: () => Promise<string | null>;
  importing: boolean;
  importIssues: SkillIssue[];
  onImportZip: (file: File) => void;
  onImportFolder: (files: File[]) => void;
  onFileSaved: (file: SkillFile) => void;
  onFileRemoved: (file: SkillFile) => void;
  onDirtyCountChange?: (count: number) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(SKILL_MD);
  const [treeOpen, setTreeOpen] = useState(false);
  const [newPaths, setNewPaths] = useState<string[]>([]);
  const [buffers, setBuffers] = useState<Record<string, Buffer>>({});
  const [saving, setSaving] = useState(false);
  const [saveIssues, setSaveIssues] = useState<SkillIssue[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"new" | "upload" | null>(null);
  const [removing, setRemoving] = useState<SkillFile | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const requested = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const savedFile = files.find((file) => file.path === selected) ?? null;
  const isSkillMd = selected === SKILL_MD;
  const buffer = buffers[selected];

  // Seçili kayıtlı dosyanın içeriğini (dosya başına bir kez) yükler; sonuç yola göre saklanır, yükleme sürerken başka dosyaya geçmek onu kaybettirmez.
  useEffect(() => {
    if (isSkillMd || !savedFile || requested.current.has(selected) || !isEditablePath(savedFile.path, savedFile.size)) return;
    requested.current.add(selected);
    const path = selected;
    const put = (next: Buffer) => mounted.current && setBuffers((prev) => ({ ...prev, [path]: next }));
    readSkillFileBytes(savedFile)
      .then((bytes) => {
        const text = decodeUtf8(bytes);
        put(text === null ? { text: "", original: "", state: "error" } : { text, original: text, state: "ready" });
      })
      .catch(() => put({ text: "", original: "", state: "error" }));
  }, [isSkillMd, savedFile, selected]);

  const dirtyPaths = Object.keys(buffers).filter((path) => buffers[path].text !== buffers[path].original);
  useEffect(() => {
    onDirtyCountChange?.(dirtyPaths.length);
  }, [dirtyPaths.length, onDirtyCountChange]);

  const text = buffer?.text ?? "";
  const liveIssues = useMemo(() => (!isSkillMd && buffer?.state === "ready" ? validateFileContent(selected, new TextEncoder().encode(text)) : []), [isSkillMd, buffer?.state, selected, text]);
  const hasError = liveIssues.some((issue) => issue.severity === "error");
  const tooLarge = new TextEncoder().encode(text).length > SKILL_LIMITS.maxFileBytes;
  const dirty = buffer ? buffer.text !== buffer.original : false;

  function select(path: string) {
    setSaveIssues([]);
    setSaveError(null);
    setSelected(path);
    setTreeOpen(false);
  }

  function edit(next: string) {
    setSaveIssues([]);
    setSaveError(null);
    setBuffers((prev) => ({ ...prev, [selected]: { ...(prev[selected] ?? { original: "", state: "ready" as const }), text: next } }));
  }

  function createFile(path: string) {
    setDialog(null);
    setNewPaths((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setBuffers((prev) => ({ ...prev, [path]: { text: "", original: "", state: "ready" } }));
    select(path);
  }

  async function save() {
    if (!buffer || buffer.state !== "ready" || saving || isSkillMd) return;
    setSaving(true);
    setSaveError(null);
    setSaveIssues([]);
    try {
      const skillId = await ensureDraft();
      if (!skillId) {
        setSaveError(t("skill.pkg.needTitleFirst"));
        return;
      }
      const saved = await saveSkillFile({ skillId, path: selected, bytes: new TextEncoder().encode(buffer.text), existing: savedFile });
      onFileSaved(saved);
      setNewPaths((prev) => prev.filter((path) => path !== selected));
      setBuffers((prev) => ({ ...prev, [selected]: { text: buffer.text, original: buffer.text, state: "ready" } }));
    } catch (error) {
      if (error instanceof SkillValidationError) setSaveIssues(error.issues);
      else setSaveError(skillErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await removeSkillFile(removing);
      onFileRemoved(removing);
      setBuffers((prev) => {
        const next = { ...prev };
        delete next[removing.path];
        return next;
      });
      requested.current.delete(removing.path);
      setRemoving(null);
      select(SKILL_MD);
    } catch (error) {
      setRemoveError(skillErrorMessage(error));
    } finally {
      setRemoveBusy(false);
    }
  }

  function discardNew(path: string) {
    setNewPaths((prev) => prev.filter((item) => item !== path));
    setBuffers((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    select(SKILL_MD);
  }

  const treeFiles: SkillTreeFile[] = useMemo(
    () => [
      { path: SKILL_MD, meta: t("skill.pkg.requiredMeta") },
      ...files.map((file) => ({
        path: file.path,
        meta: formatBytes(file.size),
        badge: (
          <>
            {file.isScript && <Badge variant="warning">{t("skill.pkg.scriptBadge")}</Badge>}
            {buffers[file.path] && buffers[file.path].text !== buffers[file.path].original && <Badge variant="warning">{t("skill.pkg.unsavedShort")}</Badge>}
          </>
        ),
      })),
      ...newPaths.filter((path) => !files.some((file) => file.path === path)).map((path) => ({ path, badge: <Badge variant="warning">{t("skill.pkg.unsavedShort")}</Badge> })),
    ],
    [files, newPaths, buffers, t],
  );

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const hasScript = files.some((file) => file.isScript);
  const frontmatter = useMemo(() => renderSkillMd({ slug: slug || "skill-adi", summary, instructions: "", license, version: version || "1.0.0" }).trimEnd().split("\n"), [slug, summary, license, version]);
  const unsavedNew = newPaths.includes(selected);

  let viewer: React.ReactNode;
  let preview: React.ReactNode = null;
  let viewerActions: React.ReactNode = null;

  if (isSkillMd) {
    viewer = (
      <div className="flex min-h-full flex-col">
        <div className="p-3">
          <InlineAlert tone="info">{t("skill.pkg.frontmatterNotice")}</InlineAlert>
        </div>
        <div className="prompt-text bg-surface-soft py-1 text-small text-text-secondary" data-skill-frontmatter="">
          {frontmatter.map((line, index) => (
            <div key={index} className="flex gap-3 px-3 leading-6">
              <span className="w-6 shrink-0 select-none text-right text-text-muted" aria-hidden>
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line || " "}</span>
            </div>
          ))}
        </div>
        <textarea
          id="skill-instructions"
          value={instructions}
          onChange={(event) => onInstructionsChange(event.target.value)}
          maxLength={INSTRUCTIONS_MAX}
          aria-label={t("skill.instructionsLabel")}
          aria-invalid={Boolean(instructionsError)}
          placeholder={t("skill.instructionsPlaceholder")}
          spellCheck={false}
          className="prompt-text min-h-64 w-full flex-1 resize-none bg-surface px-4 py-3 text-small text-text focus-ring-inset"
        />
        <div className="flex items-center justify-between gap-2 border-t border-border-soft px-4 py-1.5 text-caption">
          <span className={instructionsError ? "text-danger" : "text-text-muted"}>{instructionsError ?? t("skill.instructionsHint")}</span>
          <span className="shrink-0 text-text-muted">
            {instructions.length} / {INSTRUCTIONS_MAX}
          </span>
        </div>
      </div>
    );
    preview = <MarkdownView source={instructions} />;
  } else if (!buffer && savedFile && !isEditablePath(savedFile.path, savedFile.size)) {
    viewer = <p className="px-4 py-8 text-center text-small text-text-muted">{t("skill.pkg.noPreview", { size: formatBytes(savedFile.size) })}</p>;
  } else if (!buffer || buffer.state === "loading") {
    viewer = (
      <div className="flex items-center justify-center gap-2 px-4 py-8 text-small text-text-muted" role="status">
        <Loader2 size={20} className="animate-spin motion-reduce:animate-none" aria-hidden /> {t("common.loading")}
      </div>
    );
  } else if (buffer.state === "error") {
    viewer = (
      <p role="alert" className="m-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-small text-danger">
        {t("skill.pkg.loadFailed")}
      </p>
    );
  } else {
    viewer = (
      <div className="flex min-h-full flex-col">
        <textarea value={buffer.text} onChange={(event) => edit(event.target.value)} aria-label={selected} spellCheck={false} data-skill-editor-textarea="" className="prompt-text min-h-64 w-full flex-1 resize-none bg-surface px-4 py-3 text-small text-text focus-ring-inset" />
        {(liveIssues.length > 0 || saveIssues.length > 0 || saveError || tooLarge) && (
          <div className="max-h-40 shrink-0 space-y-2 overflow-y-auto border-t border-border-soft px-4 py-2">
            {tooLarge && (
              <p role="alert" className="text-small text-danger">
                {t("skill.pkg.issue.file_too_large")}
              </p>
            )}
            <SkillIssueList issues={saveIssues.length > 0 ? saveIssues : liveIssues} />
            {saveError && (
              <p role="alert" className="text-small text-danger">
                {saveError}
              </p>
            )}
          </div>
        )}
      </div>
    );
    const isMarkdown = /\.md$/i.test(selected);
    let shown = buffer.text;
    if (/\.json$/i.test(selected)) {
      try {
        shown = JSON.stringify(JSON.parse(buffer.text), null, 2);
      } catch {
        /* geçersiz JSON: ham metin + altta hata */
      }
    }
    preview = isMarkdown ? <MarkdownView source={buffer.text} /> : <pre className="prompt-text whitespace-pre-wrap break-words text-small text-text">{shown}</pre>;
  }

  if (!isSkillMd) {
    viewerActions = (
      <>
        {buffer?.state === "ready" && (
          <Button type="button" size="sm" onClick={() => void save()} disabled={saving || !dirty || hasError || tooLarge} data-skill-editor-save="">
            {saving ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden /> : null} {saving ? t("common.saving") : t("common.save")}
          </Button>
        )}
        <IconButton
          label={t("skill.pkg.removeFile", { path: selected })}
          className="h-9 w-9 hover:text-danger"
          data-skill-file-remove=""
          disabled={disabled}
          onClick={() => {
            if (unsavedNew) return discardNew(selected);
            if (savedFile) {
              setRemoveError(null);
              setRemoving(savedFile);
            }
          }}
        >
          <Trash2 size={16} />
        </IconButton>
      </>
    );
  }

  return (
    <div className="space-y-3" data-skill-package="">
      <InlineAlert tone="info">{t("skill.pkg.noRunNotice")}</InlineAlert>
      <SkillFileFrame
        treeTitle={t("skill.pkg.treeTitle")}
        treeActions={
          <>
            <IconButton label={t("skill.pkg.newFile")} className="h-9 w-9" disabled={disabled} onClick={() => setDialog("new")} data-skill-new-file="">
              <FilePlus2 size={16} />
            </IconButton>
            <IconButton label={t("skill.pkg.upload")} className="h-9 w-9" disabled={disabled} onClick={() => setDialog("upload")} data-skill-upload="">
              <Upload size={16} />
            </IconButton>
          </>
        }
        tree={<SkillFileTree files={treeFiles} selected={selected} onSelect={select} label={t("skill.pkg.treeLabel")} defaultOpen={SKILL_FOLDERS} />}
        path={selected}
        viewerActions={viewerActions}
        viewer={viewer}
        preview={
          preview !== null ? (
            <>
              <div className="flex h-11 shrink-0 items-center border-b border-border-soft px-4 text-caption font-semibold text-text-muted">{t("skill.pkg.tabPreview")}</div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-skill-editor-preview="">
                {preview}
              </div>
            </>
          ) : undefined
        }
        treeOpen={treeOpen}
        onTreeOpenChange={setTreeOpen}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-text-muted">
        <span data-skill-package-total="">{t("skill.pkg.total", { count: String(files.length), size: formatBytes(totalBytes), max: formatBytes(SKILL_LIMITS.maxTotalBytes) })}</span>
        {dirtyPaths.length > 0 && <span className="font-semibold text-warning">{t("skill.pkg.unsavedFiles", { count: String(dirtyPaths.length) })}</span>}
        {hasScript && <span className="font-semibold text-warning">{t("skill.pkg.scriptsNotice")}</span>}
        <span className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled || importing} onClick={() => zipInput.current?.click()} data-skill-import-zip="">
            {importing ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Upload size={16} aria-hidden />} {t("skill.pkg.importZip")}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled || importing} onClick={() => folderInput.current?.click()} data-skill-import-folder="">
            <Upload size={16} aria-hidden /> {t("skill.pkg.importFolder")}
          </Button>
        </span>
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
      </div>

      {importIssues.length > 0 && (
        <div className="space-y-2 rounded-lg card-soft px-3 py-3" role="status" data-skill-import-report="">
          <p className="text-small font-semibold text-text">{t("skill.pkg.importReport")}</p>
          <SkillIssueList issues={importIssues} />
        </div>
      )}

      {uploads.tasks.length > 0 && (
        <ul className="space-y-2" aria-label={t("skill.pkg.uploads")} data-skill-uploads="">
          {uploads.tasks.map((task) => (
            <li key={task.id} className="rounded-lg card-soft px-3 py-2" data-upload-status={task.status}>
              <div className="flex items-center gap-2 text-small">
                <code className="min-w-0 flex-1 truncate font-mono text-caption text-text">{task.path}</code>
                <span className="shrink-0 text-caption text-text-muted">{formatBytes(task.size)}</span>
                {task.status === "uploading" && (
                  <button type="button" onClick={() => uploads.cancel(task.id)} aria-label={t("skill.pkg.cancelUpload")} className="rounded-sm p-1 text-text-muted hover:bg-surface hover:text-text">
                    <X size={16} />
                  </button>
                )}
                {task.status === "error" && (
                  <>
                    {task.issues.length === 0 && (
                      <button type="button" onClick={() => uploads.retry(task.id)} className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-caption font-semibold text-primary-text hover:bg-primary-soft">
                        <RefreshCw size={12} aria-hidden /> {t("common.retry")}
                      </button>
                    )}
                    <button type="button" onClick={() => uploads.dismiss(task.id)} aria-label={t("common.close")} className="rounded-sm p-1 text-text-muted hover:bg-surface hover:text-text">
                      <X size={16} />
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
              {task.status === "error" &&
                (task.issues.length > 0 ? (
                  <div className="mt-1.5">
                    <SkillIssueList issues={task.issues} />
                  </div>
                ) : (
                  <p role="alert" className="mt-1 text-caption text-danger">
                    {task.message}
                  </p>
                ))}
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <AddFileDialog
          mode={dialog}
          existing={[...files.map((file) => file.path), ...newPaths]}
          initialFolder={folderOfPath(selected)}
          onClose={() => setDialog(null)}
          onCreate={createFile}
          onUpload={(items) => {
            setDialog(null);
            uploads.enqueue(items);
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

/** "Dosya ekle" penceresi: klasörü seç, sonra yeni dosya adı yaz ya da dosya(lar) yükle. Küçük ve kısa olduğu için pencere kalır (liste + seçimle açılan form değil). */
function AddFileDialog({
  mode,
  existing,
  initialFolder,
  onClose,
  onCreate,
  onUpload,
}: {
  mode: "new" | "upload";
  existing: string[];
  initialFolder: Folder;
  onClose: () => void;
  onCreate: (path: string) => void;
  onUpload: (items: { path: string; bytes: Uint8Array }[]) => void;
}) {
  const { t } = useTranslation();
  const [folder, setFolder] = useState<Folder>(initialFolder || "rules");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const defaultExtension = folder === "tools" ? "json" : folder === "scripts" ? "sh" : "md";
  const folderLabel = (item: Folder) => t(`skill.pkg.folder.${item || "root"}` as const);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "upload") {
      if (picked.length === 0) return setError(t("skill.pkg.pickFiles"));
      const items = await Promise.all(picked.map(async (file) => ({ path: joinSkillPath(folder, file.name), bytes: new Uint8Array(await file.arrayBuffer()) })));
      return onUpload(items);
    }
    const path = joinSkillPath(folder, name.trim() || "new-file", defaultExtension);
    const issue = validateSkillPath(path);
    if (issue) return setError(issueText(issue, t));
    if (existing.some((item) => item.toLowerCase() === path.toLowerCase())) return setError(t("skill.pkg.alreadyExists"));
    onCreate(path);
  }

  return (
    <SpaceDialog
      title={mode === "new" ? t("skill.pkg.newFileTitle") : t("skill.pkg.upload")}
      onClose={onClose}
      onSubmit={(event) => void submit(event)}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit">{mode === "new" ? t("skill.pkg.create") : t("skill.pkg.uploadConfirm")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label={t("skill.pkg.chooseFolder")} hint={folderLabel(folder)}>
          <ChipRow aria-label={t("skill.pkg.chooseFolder")}>
            {FOLDERS.map((item) => (
              <Chip key={item || "root"} selected={folder === item} onClick={() => setFolder(item)} data-skill-folder-choice={item || "root"}>
                {item ? `${item}/` : t("skill.pkg.folder.root")}
              </Chip>
            ))}
          </ChipRow>
        </FormField>
        {mode === "new" ? (
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
        ) : (
          <FormField label={t("skill.pkg.upload")} htmlFor="skill-upload-files" hint={picked.length > 0 ? picked.map((file) => file.name).join(", ") : t("skill.pkg.uploadHint")} error={error}>
            <input
              id="skill-upload-files"
              type="file"
              multiple
              accept={ACCEPT}
              data-skill-file-input=""
              onChange={(event) => {
                setPicked(Array.from(event.target.files ?? []));
                setError(null);
              }}
              className="block w-full text-small text-text-secondary file:mr-3 file:rounded-sm file:border-0 file:bg-primary-soft file:px-4 file:py-2 file:text-small file:font-semibold file:text-primary-text"
            />
          </FormField>
        )}
      </div>
    </SpaceDialog>
  );
}
