"use client";

import Link from "next/link";
import { Download } from "@/components/icons/download";
import { buttonClassName } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { SectionLabel } from "@/components/ui/section-label";
import { SettingsCard } from "@/features/settings/settings-ui";
import { useTranslation } from "@/lib/i18n/language-provider";
import { publicAssetUrl } from "@/lib/utils";
import extensionManifest from "../../../promptly-extension/manifest.json";

/** `scripts/build-extension.mjs` her derlemede üretir (`prebuild`); sürüm uzantının kendi manifestinden gelir, ikinci bir sayı tutulmaz. */
export const EXTENSION_ZIP_PATH = "/downloads/promptly-extension.zip";

const USE_KEYS = ["devSettings.extUseSave", "devSettings.extUseImage", "devSettings.extUsePalette", "devSettings.extUseSlash", "devSettings.extUseLibrary", "devSettings.extUseVote"] as const;
const SAFE_KEYS = ["devSettings.extSafe1", "devSettings.extSafe2", "devSettings.extSafe3", "devSettings.extSafe4", "devSettings.extSafe5"] as const;

/**
 * Ayarlar → Geliştirici → "Chrome uzantısı" (docs/history/429-*): indirme + yükleme adımları + kullanım + izin/gizlilik özeti.
 * Metinler uzantının gerçek davranışıyla birlikte güncellenir (`promptly-extension/README.md`).
 */
export function ExtensionSection() {
  const { t } = useTranslation();
  return (
    <SettingsCard title={t("devSettings.extTitle")} hint={t("devSettings.extLead")}>
      <div className="space-y-5" data-extension-card="">
        <div className="flex flex-wrap items-center gap-3">
          <a href={publicAssetUrl(EXTENSION_ZIP_PATH)} download className={buttonClassName({ variant: "primary" })} data-extension-download="">
            <Download size={16} className="mr-2" />
            {t("devSettings.extDownload")}
          </a>
          <span className="text-caption text-text-muted">{t("devSettings.extVersion", { version: extensionManifest.version })}</span>
        </div>

        <section className="space-y-2" aria-labelledby="ext-install">
          <SectionLabel as="h3" id="ext-install">{t("devSettings.extInstallTitle")}</SectionLabel>
          <ol className="list-decimal space-y-3 pl-5 text-small leading-relaxed text-text-secondary marker:font-semibold marker:text-primary">
            <li>{t("devSettings.extStep1")}</li>
            <li className="space-y-2">
              <span className="block">{t("devSettings.extStep2")}</span>
              <CodeBlock text="chrome://extensions" label="chrome://extensions" />
            </li>
            <li>{t("devSettings.extStep3")}</li>
            <li>{t("devSettings.extStep4")}</li>
            <li>{t("devSettings.extStep5")}</li>
          </ol>
          <p className="text-caption leading-relaxed text-text-muted">{t("devSettings.extUpdate")}</p>
        </section>

        <section className="space-y-2" aria-labelledby="ext-use">
          <SectionLabel as="h3" id="ext-use">{t("devSettings.extUseTitle")}</SectionLabel>
          <ul className="space-y-2 text-small leading-relaxed text-text-secondary">
            {USE_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-2" aria-labelledby="ext-safety">
          <SectionLabel as="h3" id="ext-safety">{t("devSettings.extSafetyTitle")}</SectionLabel>
          <ul className="space-y-2 text-small leading-relaxed text-text-secondary">
            {SAFE_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
          <p className="text-caption text-text-muted">
            {t("devSettings.extRevoke")}{" "}
            <Link href="#bagli-uygulamalar" className="font-medium text-primary hover:underline">
              {t("devSettings.extRevokeLink")}
            </Link>
          </p>
        </section>
      </div>
    </SettingsCard>
  );
}
