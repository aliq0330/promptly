"use client";

import { useMemo, useState } from "react";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { FormField, formTextInputClassName, formTextareaClassName } from "@/features/content/compose-form";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { SKILL_LIMITS } from "@/lib/skills/limits";
import type { SkillIssue } from "@/lib/skills/package-validate";
import { bumpSemver, compareSemver, isValidSemver, latestSemver, type SemverBump } from "@/lib/skills/semver";
import { publishSkillVersion, SkillPublishError, skillErrorMessage, type SkillVersion } from "@/lib/supabase/skill-package";
import { SkillIssueList } from "./skill-issues";

const BUMPS: { id: SemverBump; label: TranslationKey; hint: TranslationKey }[] = [
  { id: "patch", label: "skill.publish.bumpPatch", hint: "skill.publish.bumpPatchHint" },
  { id: "minor", label: "skill.publish.bumpMinor", hint: "skill.publish.bumpMinorHint" },
  { id: "major", label: "skill.publish.bumpMajor", hint: "skill.publish.bumpMajorHint" },
];

/** Yayın hatası kodu → çevrilmiş cümle (sunucu kısa kod verir). */
const PUBLISH_ERRORS: Record<string, TranslationKey> = {
  package_invalid: "skill.publish.error.package_invalid",
  warnings_unacknowledged: "skill.publish.error.warnings_unacknowledged",
  file_integrity: "skill.publish.error.file_integrity",
  file_missing: "skill.publish.error.file_missing",
  skill_incomplete: "skill.publish.error.skill_incomplete",
  package_too_large: "skill.publish.error.package_too_large",
  service_unavailable: "skill.publish.error.service_unavailable",
  unauthorized: "skill.publish.error.unauthorized",
  skill_version_exists: "skill.publish.error.skill_version_exists",
  skill_version_not_newer: "skill.publish.error.skill_version_not_newer",
  skill_changelog_required: "skill.publish.error.skill_changelog_required",
  skill_publish_rate_limit: "skill.publish.error.skill_publish_rate_limit",
  skill_not_found: "skill.publish.error.skill_not_found",
};

/**
 * Sürüm yayını (docs/history/389-*): ilk yayında `1.0.0`; sonrakilerde sürüm önerisi (düzeltme / yeni özellik / kalıp değişikliği) + ZORUNLU değişiklik
 * notu. Paketi sunucu (Edge Function `skill-package`) yeniden doğrular ve DEĞİŞMEZ bir ZIP olarak yazar; gizli anahtar UYARILARI açık onay ister.
 * Aynı pencere açıkken yapılan her deneme aynı `client_token`'ı kullanır: ağ kesilip yeniden denenirse ikinci sürüm oluşmaz.
 */
export function SkillPublishDialog({
  skillId,
  versions,
  onClose,
  onPublished,
}: {
  skillId: string;
  versions: SkillVersion[];
  onClose: () => void;
  onPublished: (version: SkillVersion) => void;
}) {
  const { t } = useTranslation();
  const latest = useMemo(() => latestSemver(versions.map((item) => item.version)), [versions]);
  const [bump, setBump] = useState<SemverBump>("patch");
  const [version, setVersion] = useState(latest ? bumpSemver(latest, "patch") : "1.0.0");
  const [changelog, setChangelog] = useState("");
  const [issues, setIssues] = useState<SkillIssue[]>([]);
  const [needsAck, setNeedsAck] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [token] = useState(() => crypto.randomUUID());

  const versionError = !isValidSemver(version) ? t("skill.errorVersion") : latest && compareSemver(version, latest) <= 0 ? t("skill.publish.versionNotNewer", { latest }) : null;
  const changelogError = latest && changelog.trim().length < 3 ? t("skill.publish.changelogRequired") : null;

  function chooseBump(next: SemverBump) {
    setBump(next);
    if (latest) setVersion(bumpSemver(latest, next));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (versionError || changelogError || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await publishSkillVersion({ skillId, version, changelog: changelog.trim(), clientToken: token, acknowledgeWarnings: acknowledged });
      onPublished(result.version);
    } catch (err) {
      if (err instanceof SkillPublishError) {
        setIssues(err.issues);
        setNeedsAck(err.code === "warnings_unacknowledged");
        const key = PUBLISH_ERRORS[err.code];
        setError(key ? t(key) : skillErrorMessage(err.code, "skill.error.publish"));
      } else {
        setError(skillErrorMessage(err, "skill.error.publish"));
      }
      setBusy(false);
    }
  }

  return (
    <SpaceDialog
      title={t("skill.publish.title")}
      onClose={onClose}
      onSubmit={(event) => void submit(event)}
      busy={busy}
      wide
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy || (needsAck && !acknowledged)} data-skill-publish-confirm="">
            {busy ? t("skill.publish.publishing") : t("skill.publish.confirm", { version })}
          </Button>
        </>
      }
    >
      <div className="space-y-5" data-skill-publish-dialog="">
        <p className="text-small text-text-secondary">{latest ? t("skill.publish.introNext", { latest }) : t("skill.publish.introFirst")}</p>
        {latest && (
          <FormField label={t("skill.publish.bumpLabel")} hint={t(BUMPS.find((item) => item.id === bump)?.hint ?? "skill.publish.bumpPatchHint")}>
            <ChipRow aria-label={t("skill.publish.bumpLabel")}>
              {BUMPS.map((item) => (
                <Chip key={item.id} selected={bump === item.id} onClick={() => chooseBump(item.id)} data-skill-bump={item.id}>
                  {t(item.label)}
                </Chip>
              ))}
            </ChipRow>
          </FormField>
        )}
        <FormField label={t("skill.versionLabel")} htmlFor="skill-publish-version" required error={attempted ? versionError : null}>
          <input id="skill-publish-version" value={version} onChange={(event) => setVersion(event.target.value)} maxLength={32} inputMode="decimal" aria-invalid={attempted && Boolean(versionError)} className={formTextInputClassName} />
        </FormField>
        <FormField
          label={t("skill.publish.changelogLabel")}
          htmlFor="skill-publish-changelog"
          required={Boolean(latest)}
          optional={!latest}
          hint={`${t("skill.publish.changelogHint")} · ${changelog.length} / ${SKILL_LIMITS.maxChangelog}`}
          error={attempted ? changelogError : null}
        >
          <textarea id="skill-publish-changelog" value={changelog} onChange={(event) => setChangelog(event.target.value)} maxLength={SKILL_LIMITS.maxChangelog} rows={4} className={formTextareaClassName} />
        </FormField>
        <InlineAlert tone="info">{t("skill.publish.immutableNotice")}</InlineAlert>
        {issues.length > 0 && (
          <div className="space-y-2" role="alert">
            <SkillIssueList issues={issues} />
            {needsAck && (
              <label className="flex items-start gap-2 text-small text-text">
                <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" data-skill-ack="" />
                <span>{t("skill.publish.ackWarnings")}</span>
              </label>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-small text-danger" data-skill-publish-error="">
            {error}
          </p>
        )}
      </div>
    </SpaceDialog>
  );
}
