"use client";

import Link from "next/link";
import { Download } from "@/components/icons/download";
import { buttonClassName } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { SettingsCard } from "@/features/settings/settings-ui";
import { useTranslation } from "@/lib/i18n/language-provider";
import { publicAssetUrl } from "@/lib/utils";
import extensionManifest from "../../../promptly-extension/manifest.json";

/** `scripts/build-extension.mjs` her derlemede üretir (`prebuild`); sürüm uzantının kendi manifestinden gelir, ikinci bir sayı tutulmaz. */
export const EXTENSION_ZIP_PATH = "/downloads/promptly-extension.zip";

const USE_KEYS = ["devSettings.extUseSave", "devSettings.extUseImage", "devSettings.extUsePalette", "devSettings.extUseSlash", "devSettings.extUseLibrary", "devSettings.extUseRun", "devSettings.extUseContext", "devSettings.extUseVote"] as const;
const SAFE_KEYS = ["devSettings.extSafe1", "devSettings.extSafe2", "devSettings.extSafe3", "devSettings.extSafe4", "devSettings.extSafe5"] as const;

/**
 * Ayarlar → Geliştirici → "Chrome uzantısı" (docs/history/429-*): indirme + yükleme adımları + kullanım + izin/gizlilik özeti.
 * Metinler uzantının gerçek davranışıyla birlikte güncellenir (`promptly-extension/README.md`).
 */
export function ExtensionSection() {
  const { t } = useTranslation();
  return (
    <SettingsCard title={t("devSettings.extStepsTitle")}>
      <div className="space-y-5" data-extension-card="">
        <div className="flex flex-wrap items-center gap-3">
          <a href={publicAssetUrl(EXTENSION_ZIP_PATH)} download className={buttonClassName({ variant: "primary" })} data-extension-download="">
            <Download size={16} className="mr-2" />
            {t("devSettings.extDownload")}
          </a>
          <span className="text-caption text-text-muted">{t("devSettings.extVersion", { version: extensionManifest.version })}</span>
        </div>

        <ol className="grid gap-3 sm:grid-cols-3" aria-label={t("devSettings.extInstallTitle")}>
          <li className="space-y-1.5 rounded-lg card-flat p-3">
            <p className="flex items-center gap-2 text-small font-semibold text-text">
              <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-caption font-semibold text-primary-text">1</span>
              {t("devSettings.extStepDownload")}
            </p>
            <p className="text-caption leading-relaxed text-text-secondary">{t("devSettings.extStep1")}</p>
          </li>
          <li className="space-y-1.5 rounded-lg card-flat p-3">
            <p className="flex items-center gap-2 text-small font-semibold text-text">
              <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-caption font-semibold text-primary-text">2</span>
              {t("devSettings.extStepLoad")}
            </p>
            <p className="text-caption leading-relaxed text-text-secondary">{t("devSettings.extStep2")}</p>
            <CodeBlock text="chrome://extensions" label="chrome://extensions" />
            <p className="text-caption leading-relaxed text-text-secondary">{t("devSettings.extStep3")}</p>
            <p className="text-caption leading-relaxed text-text-secondary">{t("devSettings.extStep4")}</p>
          </li>
          <li className="space-y-1.5 rounded-lg card-flat p-3">
            <p className="flex items-center gap-2 text-small font-semibold text-text">
              <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-caption font-semibold text-primary-text">3</span>
              {t("devSettings.extStepConnect")}
            </p>
            <p className="text-caption leading-relaxed text-text-secondary">{t("devSettings.extStep5")}</p>
          </li>
        </ol>
        <p className="text-caption leading-relaxed text-text-muted">{t("devSettings.extUpdate")}</p>

        <div className="space-y-2">
          <details className="rounded-lg card-flat px-4" data-extension-use="">
            <summary className="cursor-pointer py-3 text-small font-semibold text-text focus-visible:outline-2 focus-visible:outline-focus">{t("devSettings.extUseTitle")}</summary>
            <ul className="space-y-2 pb-4 text-small leading-relaxed text-text-secondary">
              {USE_KEYS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </details>
          <details className="rounded-lg card-flat px-4" data-extension-safety="">
            <summary className="cursor-pointer py-3 text-small font-semibold text-text focus-visible:outline-2 focus-visible:outline-focus">{t("devSettings.extSafetyTitle")}</summary>
            <div className="space-y-2 pb-4">
              <ul className="space-y-2 text-small leading-relaxed text-text-secondary">
                {SAFE_KEYS.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
              <p className="text-caption text-text-muted">
                {t("devSettings.extRevoke")}{" "}
                <Link href="/settings/developer/" className="font-medium text-primary-text hover:underline">
                  {t("devSettings.extRevokeLink")}
                </Link>
              </p>
            </div>
          </details>
        </div>
      </div>
    </SettingsCard>
  );
}
