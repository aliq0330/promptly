"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n/language-provider";

/** "By continuing you agree to the Terms of Use and Privacy Policy" with both links, under the sign-in / sign-up buttons. */
export function LegalNotice() {
  const { t } = useTranslation();
  const linkClass = "underline underline-offset-2 hover:text-text";
  return (
    <p className="text-caption text-text-muted">
      {t("auth.legalPrefix")}
      <Link href="/terms" className={linkClass}>
        {t("legal.termsTitle")}
      </Link>
      {t("auth.legalAnd")}
      <Link href="/privacy" className={linkClass}>
        {t("legal.privacyTitle")}
      </Link>
      {t("auth.legalSuffix")}
    </p>
  );
}
