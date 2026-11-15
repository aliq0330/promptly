"use client";

import { AlertCircle } from "@/components/icons/alert-circle";
import { TriangleAlert } from "@/components/icons/triangle-alert";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { SkillIssue, SkillIssueCode } from "@/lib/skills/package-validate";

/** Doğrulama sorun kodu → çevrilmiş ad (`skill.pkg.issue.<kod>`). Ham gizli değer asla gösterilmez; yalnız tür adı (`detail`). */
export const SKILL_ISSUE_KEYS: Record<SkillIssueCode, TranslationKey> = {
  path_empty: "skill.pkg.issue.path_empty",
  path_nul: "skill.pkg.issue.path_nul",
  path_backslash: "skill.pkg.issue.path_backslash",
  path_absolute: "skill.pkg.issue.path_absolute",
  path_traversal: "skill.pkg.issue.path_traversal",
  path_hidden: "skill.pkg.issue.path_hidden",
  path_too_long: "skill.pkg.issue.path_too_long",
  path_too_deep: "skill.pkg.issue.path_too_deep",
  path_chars: "skill.pkg.issue.path_chars",
  path_duplicate: "skill.pkg.issue.path_duplicate",
  path_reserved: "skill.pkg.issue.path_reserved",
  ext_not_allowed: "skill.pkg.issue.ext_not_allowed",
  binary_executable: "skill.pkg.issue.binary_executable",
  nested_archive: "skill.pkg.issue.nested_archive",
  content_mismatch: "skill.pkg.issue.content_mismatch",
  not_utf8: "skill.pkg.issue.not_utf8",
  invalid_json: "skill.pkg.issue.invalid_json",
  file_too_large: "skill.pkg.issue.file_too_large",
  too_many_files: "skill.pkg.issue.too_many_files",
  total_too_large: "skill.pkg.issue.total_too_large",
  zip_too_large: "skill.pkg.issue.zip_too_large",
  zip_bomb: "skill.pkg.issue.zip_bomb",
  zip_unreadable: "skill.pkg.issue.zip_unreadable",
  secret_private_key: "skill.pkg.issue.secret_private_key",
  secret_jwt: "skill.pkg.issue.secret_jwt",
  secret_warning: "skill.pkg.issue.secret_warning",
};

export function issueText(issue: SkillIssue, t: (key: TranslationKey, params?: Record<string, string>) => string): string {
  const base = t(SKILL_ISSUE_KEYS[issue.code]);
  return issue.code === "secret_warning" && issue.detail ? `${base} (${issue.detail})` : base;
}

/** Sorun listesi: hata/uyarı simgesi + dosya yolu + çevrilmiş açıklama. Durum yalnız renkle verilmez (simge + metin). */
export function SkillIssueList({ issues, max = 8 }: { issues: readonly SkillIssue[]; max?: number }) {
  const { t } = useTranslation();
  if (issues.length === 0) return null;
  const shown = issues.slice(0, max);
  return (
    <ul className="space-y-1.5" data-skill-issues="">
      {shown.map((issue, index) => {
        const Icon = issue.severity === "error" ? AlertCircle : TriangleAlert;
        return (
          <li key={`${issue.path}:${issue.code}:${index}`} className="flex items-start gap-2 text-small" data-issue-code={issue.code} data-issue-severity={issue.severity}>
            <Icon size={16} className={`mt-0.5 shrink-0 ${issue.severity === "error" ? "text-danger" : "text-warning"}`} aria-hidden />
            <span className="min-w-0 break-words text-text">
              <span className="sr-only">{issue.severity === "error" ? t("skill.pkg.severity.error") : t("skill.pkg.severity.warning")}: </span>
              {issue.path && <code className="mr-1 rounded bg-surface-soft px-1 font-mono text-caption text-text-secondary">{issue.path}</code>}
              {issueText(issue, t)}
            </span>
          </li>
        );
      })}
      {issues.length > max && <li className="text-caption text-text-muted">{t("skill.pkg.moreIssues", { count: String(issues.length - max) })}</li>}
    </ul>
  );
}
