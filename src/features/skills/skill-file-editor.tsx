"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { FileText } from "@/components/icons/file-text";
import { Folder } from "@/components/icons/folder";
import { Loader2 } from "@/components/icons/loader-2";
import { X } from "@/components/icons/x";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILL_LIMITS } from "@/lib/skills/limits";
import { folderOfPath, isEditablePath, SKILL_FOLDERS } from "@/lib/skills/paths";
import { decodeUtf8, validateFileContent, type SkillIssue } from "@/lib/skills/package-validate";
import { readSkillFileBytes, saveSkillFile, skillErrorMessage, SkillValidationError, type SkillFile } from "@/lib/supabase/skill-package";
import { MarkdownView } from "./markdown-view";
import { SkillIssueList } from "./skill-issues";

interface Buffer {
  text: string;
  original: string;
  state: "loading" | "ready" | "error";
}

/** Düzenleyicide gösterilecek yollar: kayıtlı düzenlenebilir dosyalar + (varsa) henüz kaydedilmemiş yeni dosya. */
function editablePaths(files: SkillFile[], newPath: string | null): string[] {
  const paths = files.filter((file) => isEditablePath(file.path, file.size)).map((file) => file.path);
  if (newPath && !paths.includes(newPath)) paths.push(newPath);
  return paths.sort();
}

/**
 * Tam ekran dosya düzenleyici (docs/history/389-*): masaüstünde üç bölme (dosya ağacı · düzenleyici · canlı önizleme), telefonda tek sütun
 * (dosya seçici + Düzenle / Önizle sekmeleri). Her dosyanın tamponu ayrı tutulur: dosya değiştirmek yazdıklarını kaybettirmez. Kaydetmek içeriği
 * `skill-files` bucket'ına yükler (`saveSkillFile`); kapatırken kaydedilmemiş değişiklik varsa sorulur. Hiçbir dosya çalıştırılmaz.
 */
export function SkillFileEditor({
  skillId,
  files,
  initialPath,
  isNew,
  onClose,
  onSaved,
}: {
  skillId: string;
  files: SkillFile[];
  initialPath: string;
  isNew: boolean;
  onClose: () => void;
  onSaved: (file: SkillFile) => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const [newPath, setNewPath] = useState<string | null>(isNew ? initialPath : null);
  const [active, setActive] = useState(initialPath);
  const [buffers, setBuffers] = useState<Record<string, Buffer>>(isNew ? { [initialPath]: { text: "", original: "", state: "ready" } } : {});
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [saveIssues, setSaveIssues] = useState<SkillIssue[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const treeRef = useRef<HTMLDivElement>(null);
  const requested = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const fileList = useMemo(() => files, [files]);
  const paths = editablePaths(fileList, newPath);

  // Etkin dosyanın içeriğini (dosya başına bir kez) yükle. Arabellek henüz yokken "yükleniyor" görünür; sonuç yola göre saklandığından
  // yükleme sürerken başka dosyaya geçmek sonucu kaybettirmez.
  useEffect(() => {
    if (requested.current.has(active) || buffers[active]) return;
    const file = fileList.find((item) => item.path === active);
    if (!file) return;
    requested.current.add(active);
    const put = (next: Buffer) => mounted.current && setBuffers((prev) => ({ ...prev, [active]: next }));
    readSkillFileBytes(file)
      .then((bytes) => {
        const text = decodeUtf8(bytes);
        put(text === null ? { text: "", original: "", state: "error" } : { text, original: text, state: "ready" });
      })
      .catch(() => put({ text: "", original: "", state: "error" }));
  }, [active, buffers, fileList]);

  const buffer = buffers[active];
  const text = buffer?.text ?? "";
  const deferred = useDeferredValue(text);
  const liveIssues = useMemo(() => (buffer?.state === "ready" ? validateFileContent(active, new TextEncoder().encode(deferred)) : []), [active, deferred, buffer?.state]);
  const hasError = liveIssues.some((issue) => issue.severity === "error");
  const dirtyPaths = paths.filter((path) => buffers[path] && buffers[path].text !== buffers[path].original);
  const dirty = buffer ? buffer.text !== buffer.original : false;
  const tooLarge = new TextEncoder().encode(text).length > SKILL_LIMITS.maxFileBytes;

  function edit(next: string) {
    setSaveIssues([]);
    setSaveError(null);
    setBuffers((prev) => ({ ...prev, [active]: { ...(prev[active] ?? { original: "", state: "ready" as const }), text: next } }));
  }

  function select(path: string) {
    setSaveIssues([]);
    setSaveError(null);
    setActive(path);
  }

  async function save() {
    if (!buffer || buffer.state !== "ready" || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveIssues([]);
    try {
      const existing = fileList.find((file) => file.path === active) ?? null;
      const saved = await saveSkillFile({ skillId, path: active, bytes: new TextEncoder().encode(buffer.text), existing });
      onSaved(saved);
      if (newPath === active) setNewPath(null);
      setBuffers((prev) => ({ ...prev, [active]: { text: buffer.text, original: buffer.text, state: "ready" } }));
    } catch (error) {
      if (error instanceof SkillValidationError) setSaveIssues(error.issues);
      else setSaveError(skillErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function requestClose() {
    if (dirtyPaths.length > 0) setConfirmClose(true);
    else onClose();
  }

  // Ağaçta ↑/↓: yapraklar arasında gez (tarayıcı odak sırası zaten sıralı; ok tuşları ağaç düğümü beklentisini karşılar).
  function onTreeKey(event: React.KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const leaves = Array.from(treeRef.current?.querySelectorAll<HTMLElement>("[data-tree-leaf]") ?? []);
    const index = leaves.findIndex((leaf) => leaf === document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    leaves[Math.min(Math.max(index + (event.key === "ArrowDown" ? 1 : -1), 0), leaves.length - 1)]?.focus();
  }

  const groups: { folder: string; label: string; items: string[] }[] = [
    ...SKILL_FOLDERS.map((folder) => ({ folder, label: t(`skill.pkg.folder.${folder}` as const), items: paths.filter((path) => folderOfPath(path) === folder) })),
    { folder: "", label: t("skill.pkg.folder.root"), items: paths.filter((path) => folderOfPath(path) === "") },
  ].filter((group) => group.items.length > 0);

  const isMarkdown = /\.md$/i.test(active);
  const isJson = /\.json$/i.test(active);
  let preview: React.ReactNode = <pre className="prompt-text whitespace-pre-wrap break-words text-small text-text">{deferred}</pre>;
  if (isMarkdown) preview = <MarkdownView source={deferred} />;
  else if (isJson) {
    let pretty = deferred;
    try {
      pretty = JSON.stringify(JSON.parse(deferred), null, 2);
    } catch {
      /* geçersiz JSON: ham metin + altta hata */
    }
    preview = <pre className="prompt-text whitespace-pre-wrap break-words text-small text-text">{pretty}</pre>;
  }

  return (
    <Modal onClose={requestClose} labelledBy={titleId}>
      <div className="flex h-[min(92dvh,52rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg" data-skill-file-editor="" onClick={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 items-center gap-2 border-b border-border-soft px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-h3 font-bold text-text">
              {t("skill.pkg.editorTitle")}
            </h2>
            <p className="truncate font-mono text-caption text-text-muted" data-skill-editor-path="">
              {active}
              {dirty && <span className="ml-1 text-warning">· {t("skill.pkg.unsaved")}</span>}
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => void save()} disabled={saving || !dirty || hasError || tooLarge || buffer?.state !== "ready"} data-skill-editor-save="">
            {saving ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden /> : null} {saving ? t("common.saving") : t("common.save")}
          </Button>
          <button type="button" onClick={requestClose} aria-label={t("common.close")} className="rounded-full p-1.5 text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={18} />
          </button>
        </div>

        {/* Telefon: dosya seçici + Düzenle/Önizle sekmeleri */}
        <div className="flex shrink-0 flex-col gap-2 border-b border-border-soft px-4 py-2 lg:hidden">
          <select value={active} onChange={(event) => select(event.target.value)} aria-label={t("skill.pkg.chooseFile")} className="h-10 w-full rounded-xl border border-border-strong bg-surface px-3 font-mono text-small text-text">
            {paths.map((path) => (
              <option key={path} value={path}>
                {path}
                {buffers[path] && buffers[path].text !== buffers[path].original ? " •" : ""}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-soft p-1" role="group" aria-label={t("skill.pkg.view")}>
            {(["edit", "preview"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={pane === value} onClick={() => setPane(value)} className={`h-8 rounded-full text-small font-semibold ${pane === value ? "bg-surface text-text shadow-xs" : "text-text-muted"}`}>
                {value === "edit" ? t("skill.pkg.tabEdit") : t("skill.pkg.tabPreview")}
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[14rem_minmax(0,1fr)_minmax(0,1fr)]">
          {/* Masaüstü: dosya ağacı */}
          <div ref={treeRef} role="tree" aria-label={t("skill.pkg.treeLabel")} onKeyDown={onTreeKey} className="hidden min-h-0 overflow-y-auto border-r border-border-soft p-2 lg:block" data-skill-tree="">
            {groups.map((group) => (
              <div key={group.folder || "root"} role="treeitem" aria-expanded="true" aria-selected="false" className="mb-1">
                <div className="flex items-center gap-1.5 px-2 py-1 text-caption font-bold uppercase tracking-[0.06em] text-text-muted">
                  <Folder size={14} aria-hidden /> {group.label}
                </div>
                <div role="group">
                  {group.items.map((path) => {
                    const isDirty = buffers[path] && buffers[path].text !== buffers[path].original;
                    return (
                      <button
                        key={path}
                        type="button"
                        role="treeitem"
                        aria-selected={path === active}
                        data-tree-leaf=""
                        onClick={() => select(path)}
                        className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-small ${path === active ? "bg-primary-soft font-semibold text-primary" : "text-text hover:bg-surface-soft"}`}
                      >
                        <FileText size={14} className="shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate font-mono text-caption">{path.slice(path.indexOf("/") + 1)}</span>
                        {isDirty && <Badge variant="warning">{t("skill.pkg.unsavedShort")}</Badge>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className={`min-h-0 flex-col ${pane === "edit" ? "flex" : "hidden"} lg:flex lg:border-r lg:border-border-soft`}>
            {buffer?.state === "loading" || !buffer ? (
              <div className="flex flex-1 items-center justify-center text-small text-text-muted" role="status">
                <Loader2 size={18} className="mr-2 animate-spin motion-reduce:animate-none" aria-hidden /> {t("common.loading")}
              </div>
            ) : buffer.state === "error" ? (
              <p role="alert" className="m-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-small text-danger">
                {t("skill.pkg.loadFailed")}
              </p>
            ) : (
              <>
                <textarea
                  value={buffer.text}
                  onChange={(event) => edit(event.target.value)}
                  aria-label={active}
                  spellCheck={false}
                  data-skill-editor-textarea=""
                  className="prompt-text min-h-0 flex-1 resize-none bg-surface px-4 py-3 text-small text-text focus:outline-none"
                />
                {(liveIssues.length > 0 || saveIssues.length > 0 || saveError || tooLarge) && (
                  <div className="max-h-40 shrink-0 space-y-2 overflow-y-auto border-t border-border-soft px-4 py-2">
                    {tooLarge && <p role="alert" className="text-small text-danger">{t("skill.pkg.issue.file_too_large")}</p>}
                    <SkillIssueList issues={saveIssues.length > 0 ? saveIssues : liveIssues} />
                    {saveError && <p role="alert" className="text-small text-danger">{saveError}</p>}
                  </div>
                )}
              </>
            )}
          </div>

          <div className={`min-h-0 overflow-y-auto px-4 py-3 ${pane === "preview" ? "block" : "hidden"} lg:block`} aria-label={t("skill.pkg.tabPreview")} data-skill-editor-preview="">
            {buffer?.state === "ready" ? preview : null}
          </div>
        </div>
      </div>

      {confirmClose && (
        <ConfirmDialog
          id="skill-editor-discard"
          title={t("skill.pkg.discardTitle")}
          body={t("skill.pkg.discardBody", { count: String(dirtyPaths.length) })}
          confirmLabel={t("skill.pkg.discard")}
          danger
          busy={false}
          error={null}
          overLayers
          onConfirm={onClose}
          onCancel={() => setConfirmClose(false)}
        />
      )}
    </Modal>
  );
}
