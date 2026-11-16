"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Copy } from "@/components/icons/copy";
import { Download } from "@/components/icons/download";
import { Loader2 } from "@/components/icons/loader-2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { DetailSection } from "@/features/content/detail-parts";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { decodeUtf8, type ScriptRiskCode } from "@/lib/skills/package-validate";
import { formatBytes } from "@/lib/skills/paths";
import { getSkillPackageUrl, type SkillVersion } from "@/lib/supabase/skill-package";
import { copyTextToClipboard } from "@/lib/utils";
import { SkillCodeView } from "./skill-code-view";
import { SkillFileFrame } from "./skill-file-frame";
import { SkillFileTree, type SkillTreeFile } from "./skill-file-tree";

const SKILL_MD = "SKILL.md";

const RISK_LABEL: Record<ScriptRiskCode, TranslationKey> = {
  pipe_to_shell: "skill.scan.pipe_to_shell",
  network: "skill.scan.network",
  destructive_delete: "skill.scan.destructive_delete",
  dynamic_eval: "skill.scan.dynamic_eval",
  privilege: "skill.scan.privilege",
  credential_paths: "skill.scan.credential_paths",
  obfuscation: "skill.scan.obfuscation",
};

type PackageState = { status: "idle" | "loading" | "ready" | "error"; files: Map<string, Uint8Array>; skillMd: string | null };

/** Paketin ZIP'ini (imzalı adres) bir kez, ilk dosya açılınca indirir ve bellekte okur. Hiçbir dosya çalıştırılmaz. SKILL.md ZIP'siz de görünür. */
function usePackageContents(version: SkillVersion) {
  const [state, setState] = useState<PackageState>({ status: "idle", files: new Map(), skillMd: null });
  const started = useRef(false);
  const load = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setState((prev) => ({ ...prev, status: "loading" }));
    void (async () => {
      try {
        const url = await getSkillPackageUrl(version.packagePath);
        const response = await fetch(url);
        if (!response.ok) throw new Error("fetch_failed");
        const { readSkillZip } = await import("@/lib/skills/zip");
        const result = readSkillZip(new Uint8Array(await response.arrayBuffer()));
        setState({ status: "ready", files: new Map(result.files.map((file) => [file.path, file.bytes])), skillMd: result.skillMd });
      } catch {
        started.current = false;
        setState({ status: "error", files: new Map(), skillMd: null });
      }
    })();
  }, [version.packagePath]);
  return { ...state, load };
}

function saveTextFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name.split("/").pop() || "file.txt";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Son sürümün "Paket dosyaları" bölümü (docs/history/407-*): solda dosya ağacı, sağda seçili dosyanın içeriği; telefonda ☰ ile ağaç.
 * Dosya listesi sürümün manifest'inden gelir; SKILL.md hemen, diğer dosyalar paketin ZIP'i ilk kez istenince okunur. Betik dosyasında uyarı
 * gösterilir (Promptly hiçbir dosyayı çalıştırmaz); otomatik risk işaretleri bilgilendiricidir.
 */
export function SkillFilesSection({ version, skillMd, onDownload }: { version: SkillVersion; skillMd: string; onDownload: () => void }) {
  const { t } = useTranslation();
  const files = useMemo(() => version.manifest?.files ?? [], [version.manifest]);
  const [selected, setSelected] = useState(SKILL_MD);
  const [treeOpen, setTreeOpen] = useState(false);
  const [showPublished, setShowPublished] = useState(false);
  const pkg = usePackageContents(version);
  // SKILL.md ZIP'siz, çalışma kopyasından hemen gösterilir; paket okununca yayınlanan sürümdekinden farklıysa kullanıcıya söylenir (indirilen ZIP yayınlanan halini içerir).
  const differs = pkg.status === "ready" && pkg.skillMd !== null && pkg.skillMd !== skillMd;

  const treeFiles: SkillTreeFile[] = useMemo(
    () => [
      { path: SKILL_MD, meta: formatBytes(new TextEncoder().encode(skillMd).length) },
      ...files.map((file) => ({ path: file.path, meta: formatBytes(file.size), badge: file.script ? <Badge variant="warning">{t("skill.pkg.scriptBadge")}</Badge> : undefined })),
    ],
    [files, skillMd, t],
  );

  if (files.length === 0) return null;
  const hasScript = files.some((file) => file.script);
  const withRisks = files.filter((file) => (file.risks?.length ?? 0) > 0);
  const current = files.find((file) => file.path === selected) ?? null;

  function select(path: string) {
    setSelected(path);
    setTreeOpen(false);
    if (path !== SKILL_MD) pkg.load();
  }

  let text: string | null = null;
  let body: React.ReactNode;
  if (selected === SKILL_MD) {
    text = showPublished && differs ? pkg.skillMd : skillMd;
  } else if (pkg.status === "ready") {
    const bytes = pkg.files.get(selected);
    text = bytes ? decodeUtf8(bytes) : null;
    if (text === null) body = <p className="px-4 py-6 text-center text-small text-text-muted">{t("skill.pkg.noPreview", { size: formatBytes(current?.size ?? 0) })}</p>;
  } else if (pkg.status === "error") {
    body = (
      <div className="flex flex-col items-center gap-3 px-4 py-8 text-center" role="alert">
        <p className="text-small text-danger">{t("skill.pkg.loadFailed")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => pkg.load()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="flex items-center justify-center gap-2 px-4 py-8 text-small text-text-muted" role="status">
        <Loader2 size={20} className="animate-spin motion-reduce:animate-none" aria-hidden /> {t("common.loading")}
      </div>
    );
  }
  if (text !== null) {
    const shownText = text;
    body = (
      <>
        {selected === SKILL_MD && differs && (
          <div className="space-y-2 px-3 pt-3" data-skill-md-differs="">
            <InlineAlert tone="info">{t(showPublished ? "skill.pkg.showingPublished" : "skill.pkg.showingDraft", { version: version.version })}</InlineAlert>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowPublished((value) => !value)}>
              {t(showPublished ? "skill.pkg.showDraft" : "skill.pkg.showPublished", { version: version.version })}
            </Button>
          </div>
        )}
        {current?.script && (
          <div className="px-3 pt-3">
            <InlineAlert tone="warning">{t("skill.detail.scriptWarning")}</InlineAlert>
          </div>
        )}
        <SkillCodeView text={shownText} />
      </>
    );
  }

  return (
    <DetailSection title={t("skill.detail.filesTitle")} id="skill-files">
      <div className="space-y-3">
        {hasScript && <InlineAlert tone="warning">{t("skill.detail.scriptWarning")}</InlineAlert>}
        {withRisks.length > 0 && (
          <div data-skill-scan="">
            <InlineAlert tone="warning">{t("skill.scan.note")}</InlineAlert>
          </div>
        )}
        <SkillFileFrame
          treeTitle={t("skill.pkg.treeTitle")}
          tree={
            <div data-skill-manifest="">
              <SkillFileTree files={treeFiles} selected={selected} onSelect={select} label={t("skill.pkg.treeLabel")} defaultOpen={files.length <= 6 ? files.flatMap((file) => file.path.split("/").slice(0, -1)) : []} />
            </div>
          }
          path={selected}
          viewerActions={
            text !== null ? (
              <>
                <IconButton label={t("skill.pkg.copyFile")} className="h-9 w-9" onClick={() => void copyTextToClipboard(text ?? "")}>
                  <Copy size={16} />
                </IconButton>
                <IconButton label={t("skill.pkg.downloadFile")} className="h-9 w-9" onClick={() => saveTextFile(selected, text ?? "")}>
                  <Download size={16} />
                </IconButton>
              </>
            ) : undefined
          }
          viewer={body}
          treeOpen={treeOpen}
          onTreeOpenChange={setTreeOpen}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption text-text-muted">{t("skill.detail.packageMeta", { files: String(version.fileCount), size: formatBytes(version.packageSize) })}</p>
          <Button type="button" variant="outline" size="sm" onClick={onDownload}>
            <Download size={16} aria-hidden /> {t("skill.detail.downloadZip", { version: version.version })}
          </Button>
        </div>
        {withRisks.length > 0 && (
          <ul className="space-y-1.5" data-skill-risk-list="">
            {withRisks.map((file) => (
              <li key={file.path} className="flex flex-wrap items-center gap-1.5" data-skill-risks={file.path}>
                <code className="font-mono text-caption text-text-secondary">{file.path}</code>
                {file.risks?.map((risk) => (
                  <Badge key={risk} variant="warning" data-skill-risk={risk}>
                    {t(RISK_LABEL[risk])}
                  </Badge>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </DetailSection>
  );
}
