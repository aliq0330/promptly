"use client";

import { useEffect, useState } from "react";
import { Download } from "@/components/icons/download";
import { FileText } from "@/components/icons/file-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { CompactContentCard, type AttachmentState } from "@/features/content/compact-content-card";
import { DetailSection } from "@/features/content/detail-parts";
import { useTranslation } from "@/lib/i18n/language-provider";
import { formatBytes } from "@/lib/skills/paths";
import { attachmentKey, fetchAttachmentCards, type AttachmentCard } from "@/lib/supabase/comment-attachments";
import { fetchMySkillPin, fetchSkillRelations, getSkillPackageUrl, pinSkillVersion, recordSkillUse, setSkillVersionDeprecated, skillErrorMessage, unpinSkill, type SkillRelation, type SkillVersion } from "@/lib/supabase/skill-package";
import { Pin } from "@/components/icons/pin";
import { useAuth } from "@/features/auth/auth-provider";
import { formatRelativeTime } from "@/lib/utils";

/** Yayınlanmış sürümlerin en yenisi (kullanımdan kaldırılmamış olan tercih edilir). */
export function pickLatestVersion(versions: readonly SkillVersion[]): SkillVersion | null {
  return versions.find((version) => !version.deprecatedAt) ?? versions[0] ?? null;
}

/** Paketi imzalı adresle indirtir ve kullanımı sayar (yazar/ziyaretçi sayılmaz; hata indirmeyi engellemez). */
export async function downloadSkillPackage(skillId: string, slug: string, version: SkillVersion): Promise<void> {
  const url = await getSkillPackageUrl(version.packagePath, `${slug}-${version.version}.zip`);
  void recordSkillUse(skillId);
  window.location.assign(url);
}

/** Sürümler listesi: numara, tarih, not, boyut, SHA-256, kullanımdan kaldırıldı rozeti; her sürümün ZIP'i indirilebilir, sahibi işaretleyebilir. */
export function SkillVersionsSection({
  skillId,
  slug,
  versions,
  isOwn,
  onChanged,
}: {
  skillId: string;
  slug: string;
  versions: SkillVersion[];
  isOwn: boolean;
  onChanged: () => void;
}) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = pickLatestVersion(versions);
  // Kişisel sürüm sabitleme (docs/history/393-*): yazar kendi Skill'ini sabitlemez; yeni sürüm çıkınca sabitleyene bildirim gider.
  const [pinned, setPinned] = useState<string | null>(null);
  const canPin = Boolean(user) && !isOwn;
  useEffect(() => {
    if (!user || isOwn) return;
    let cancelled = false;
    fetchMySkillPin(skillId, user.id)
      .then((version) => !cancelled && setPinned(version))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [skillId, user, isOwn]);

  async function togglePin(version: SkillVersion) {
    if (!user) return;
    setBusy(`pin:${version.id}`);
    setError(null);
    try {
      if (pinned === version.version) {
        await unpinSkill(skillId, user.id);
        setPinned(null);
      } else {
        await pinSkillVersion(skillId, user.id, version.version);
        setPinned(version.version);
      }
    } catch (err) {
      setError(skillErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function download(version: SkillVersion) {
    setError(null);
    try {
      await downloadSkillPackage(skillId, slug, version);
    } catch {
      setError(t("skill.detail.downloadFailed"));
    }
  }

  async function toggleDeprecated(version: SkillVersion) {
    setBusy(version.id);
    setError(null);
    try {
      await setSkillVersionDeprecated(skillId, version.version, !version.deprecatedAt);
      onChanged();
    } catch (err) {
      setError(skillErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <DetailSection title={t("skill.detail.versionsTitle")} id="skill-versions">
      {versions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-small text-text-muted">{t("skill.detail.noVersions")}</p>
      ) : (
        <ul className="divide-y divide-border-soft rounded-xl border border-border-soft" data-skill-versions="">
          {versions.map((version) => (
            <li key={version.id} className="space-y-1.5 px-4 py-3" data-skill-version={version.version}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-body font-bold text-text">{version.version}</span>
                {latest?.id === version.id && <Badge variant="success">{t("skill.detail.latest")}</Badge>}
                {version.deprecatedAt && <Badge variant="warning">{t("skill.detail.deprecated")}</Badge>}
                {pinned === version.version && <Badge variant="neutral" data-skill-pinned="">{t("skill.detail.pinned")}</Badge>}
                <span className="text-caption text-text-muted">{formatRelativeTime(version.createdAt, language)}</span>
                <span className="ml-auto flex items-center gap-1">
                  {canPin && (
                    <Button type="button" variant="ghost" size="sm" disabled={busy === `pin:${version.id}`} aria-pressed={pinned === version.version} onClick={() => void togglePin(version)} data-skill-pin="">
                      <Pin size={14} aria-hidden /> {pinned === version.version ? t("skill.detail.unpin") : t("skill.detail.pin")}
                    </Button>
                  )}
                  {isOwn && (
                    <Button type="button" variant="ghost" size="sm" disabled={busy === version.id} onClick={() => void toggleDeprecated(version)} data-skill-deprecate="">
                      {version.deprecatedAt ? t("skill.detail.undeprecate") : t("skill.detail.deprecate")}
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => void download(version)} data-skill-version-download="">
                    <Download size={14} aria-hidden /> ZIP
                  </Button>
                </span>
              </div>
              {version.changelog && <p className="whitespace-pre-wrap break-words text-small text-text-secondary">{version.changelog}</p>}
              <p className="text-caption text-text-muted">
                {t("skill.detail.packageMeta", { files: String(version.fileCount), size: formatBytes(version.packageSize) })}
                <span className="ml-2 hidden font-mono sm:inline" title={version.packageSha256}>
                  {t("skill.detail.sha", { sha: `${version.packageSha256.slice(0, 12)}…` })}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-small text-danger">
          {error}
        </p>
      )}
    </DetailSection>
  );
}

/** Son sürümün dosya listesi (manifest'ten) + betik uyarısı. Paket dosyalarının içeriği ZIP'tedir; sayfada yalnız liste görünür. */
export function SkillFilesSection({ version }: { version: SkillVersion }) {
  const { t } = useTranslation();
  const files = version.manifest?.files ?? [];
  if (files.length === 0) return null;
  const hasScript = files.some((file) => file.script);
  return (
    <DetailSection title={t("skill.detail.filesTitle")} id="skill-files">
      <p className="mb-3 text-small text-text-muted">{t("skill.detail.filesHint", { version: version.version })}</p>
      {hasScript && (
        <div className="mb-3">
          <InlineAlert tone="warning">{t("skill.detail.scriptWarning")}</InlineAlert>
        </div>
      )}
      <ul className="divide-y divide-border-soft rounded-xl border border-border-soft" data-skill-manifest="">
        {files.map((file) => (
          <li key={file.path} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <FileText size={16} className="shrink-0 text-text-muted" aria-hidden />
            <code className="min-w-0 flex-1 break-all font-mono text-caption text-text">{file.path}</code>
            {file.script && <Badge variant="warning">{t("skill.pkg.scriptBadge")}</Badge>}
            <span className="shrink-0 text-caption text-text-muted">{formatBytes(file.size)}</span>
          </li>
        ))}
      </ul>
    </DetailSection>
  );
}

/** Bağlı içerik (Prompt / Workflow / Ayar paketi) kartları; okuyucunun göremediği içerik "gizli veya kaldırılmış" olur (RLS). Liste boşsa bölüm çizilmez. */
export function SkillRelatedSection({ skillId }: { skillId: string }) {
  const { t } = useTranslation();
  const [relations, setRelations] = useState<SkillRelation[]>([]);
  const [cards, setCards] = useState<Map<string, AttachmentCard>>(new Map());
  const [failed, setFailed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchSkillRelations(skillId)
      .then(async (list) => {
        if (cancelled || list.length === 0) return;
        const result = await fetchAttachmentCards(list.map((relation) => ({ type: relation.type, id: relation.targetId })));
        if (cancelled) return;
        setRelations(list);
        setCards(result.cards);
        setFailed(new Set([...result.failed]));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [skillId]);

  if (relations.length === 0) return null;
  return (
    <DetailSection title={t("skill.detail.relatedTitle")} id="skill-related">
      <ul className="space-y-2" data-skill-related="">
        {relations.map((relation) => {
          const card = cards.get(attachmentKey({ type: relation.type, id: relation.targetId }));
          const state: AttachmentState = card ? { status: "ready", card } : failed.has(relation.type) ? { status: "error" } : { status: "hidden" };
          return (
            <li key={relation.id}>
              <CompactContentCard attachment={{ type: relation.type, id: relation.targetId }} state={state} className="max-w-full" />
            </li>
          );
        })}
      </ul>
    </DetailSection>
  );
}
