"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "@/components/icons/bell";
import { Code2 } from "@/components/icons/code-2";
import { Phone } from "@/components/icons/phone";
import { FileText } from "@/components/icons/file-text";
import { LogOut } from "@/components/icons/log-out";
import { Palette } from "@/components/icons/palette";
import { ShieldCheck } from "@/components/icons/shield-check";
import { TriangleAlert } from "@/components/icons/triangle-alert";
import { UserRound } from "@/components/icons/user-round";
import { Lock } from "@/components/icons/lock";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/components/layout/page-title";
import { useAuth } from "@/features/auth/auth-provider";
import { useIsModerator } from "@/features/moderation/use-is-moderator";
import { SettingsLinkCard, SettingsLinkRow } from "@/features/settings/settings-ui";
import { supabase } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n/language-provider";
import { usePhoneDuplicateClass } from "@/components/layout/phone-title";
import { cn } from "@/lib/utils";


/**
 * Ayarlar ana listesi (docs/history/318-*): her kategori kendi alt sayfasına gider (`/settings/account` · `privacy` · `preferences` · `developer` · `legal` · `danger`).
 * Telefonda da masaüstünde de aynı kısa liste; ayrıntı alt sayfalardadır. Profil alanları (ad, biyografi, avatar) `/profile/edit`'te kalır.
 */
export default function SettingsPage() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const duplicate = usePhoneDuplicateClass(t("nav.settings"));
  usePageTitle(t("nav.settings"));
  const isModerator = useIsModerator();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await supabase.auth.signOut();
  }

  // Rota `RequireAuth` içinde; misafir buraya gelmez.
  if (loading || !user) return null;

  const iconClass = "text-text-secondary";
  return (
    <div className="mx-auto w-full max-w-[37.5rem] animate-rise-in px-3 pb-10 pt-2 sm:px-6 lg:px-8 lg:pt-6">
      <header className="sx-set-bar" style={{ marginLeft: 0 }}>
        <div className="min-w-0">
          <h1 className={cn("sx-set-title", duplicate)}>{t("nav.settings")}</h1>
        </div>
      </header>
      <p className="sx-set-lead">
        {t("settings.profileHintBefore")}{" "}
        <Link href="/profile/edit" className="font-medium text-primary-text hover:underline">
          {t("settings.profileHintLink")}
        </Link>{" "}
        {t("settings.profileHintAfter")}
      </p>

      <nav aria-label={t("settings.sectionsNav")} data-settings-hub="">
        <SettingsLinkCard label={t("ay.set.account")}>
          {isModerator && <SettingsLinkRow href="/moderation" icon={<ShieldCheck size={20} className="text-primary-text" />} title={t("nav.moderation")} hint={t("settings.hub.moderationDesc")} />}
          <SettingsLinkRow href="/settings/account" icon={<UserRound size={20} className={iconClass} />} title={t("settings.groupAccount")} hint={t("settings.hub.accountDesc")} />
          <SettingsLinkRow href="/settings/privacy" icon={<Lock size={20} className={iconClass} />} title={t("settings.privacyTitle")} hint={t("settings.hub.privacyDesc")} />
          <SettingsLinkRow href="/settings/notifications" icon={<Bell size={20} className={iconClass} />} title={t("nc.settings.title")} hint={t("nc.settings.hubDesc")} />
          <SettingsLinkRow href="/settings/calls" icon={<Phone size={20} className={iconClass} />} title={t("calls.settings.title")} hint={t("calls.settings.entry")} />
        </SettingsLinkCard>
        <SettingsLinkCard label={t("ay.set.app")}>
          <SettingsLinkRow href="/settings/preferences" icon={<Palette size={20} className={iconClass} />} title={t("settings.groupPreferences")} hint={t("settings.hub.preferencesDesc")} />
          <SettingsLinkRow href="/settings/developer" icon={<Code2 size={20} className={iconClass} />} title={t("settings.groupDeveloper")} hint={t("settings.hub.developerDesc")} />
          <SettingsLinkRow href="/settings/legal" icon={<FileText size={20} className={iconClass} />} title={t("legal.groupTitle")} hint={t("settings.hub.legalDesc")} />
        </SettingsLinkCard>
        <SettingsLinkCard label={t("ay.danger.label")}>
          <SettingsLinkRow href="/settings/danger" icon={<TriangleAlert size={20} className="text-danger" />} title={t("settings.groupDanger")} hint={t("settings.hub.dangerDesc")} />
        </SettingsLinkCard>
      </nav>

      <div className="pt-8">
        <Button type="button" variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
          <LogOut size={16} />
          {isSigningOut ? t("settings.signingOut") : t("settings.signOut")}
        </Button>
      </div>
    </div>
  );
}
