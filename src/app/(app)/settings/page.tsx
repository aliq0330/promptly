"use client";

import { useState } from "react";
import Link from "next/link";
import { Code2, FileText, LogOut, Palette, ShieldCheck, TriangleAlert, UserRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/components/layout/page-title";
import { useAuth } from "@/features/auth/auth-provider";
import { useIsModerator } from "@/features/moderation/use-is-moderator";
import { SettingsLinkRow } from "@/features/settings/settings-ui";
import { supabase } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n/language-provider";


/**
 * Ayarlar ana listesi (docs/history/318-*): her kategori kendi alt sayfasına gider (`/settings/account` · `privacy` · `preferences` · `developer` · `legal` · `danger`).
 * Telefonda da masaüstünde de aynı kısa liste; ayrıntı alt sayfalardadır. Profil alanları (ad, biyografi, avatar) `/profile/edit`'te kalır.
 */
export default function SettingsPage() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
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
    <div className="mx-auto w-full max-w-2xl animate-rise-in space-y-6 px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-10">
      <header className="space-y-2">
        <h1 className="text-h1 text-text">{t("nav.settings")}</h1>
        <p className="text-small text-text-secondary">
          {t("settings.profileHintBefore")}{" "}
          <Link href="/profile/edit" className="font-medium text-primary hover:underline">
            {t("settings.profileHintLink")}
          </Link>{" "}
          {t("settings.profileHintAfter")}
        </p>
      </header>

      <nav aria-label={t("settings.sectionsNav")} className="space-y-3" data-settings-hub="">
        {isModerator && <SettingsLinkRow href="/moderation" icon={<ShieldCheck size={18} className="text-primary" />} title={t("nav.moderation")} hint={t("settings.hub.moderationDesc")} />}
        <SettingsLinkRow href="/settings/account" icon={<UserRound size={18} className={iconClass} />} title={t("settings.groupAccount")} hint={t("settings.hub.accountDesc")} />
        <SettingsLinkRow href="/settings/privacy" icon={<Lock size={18} className={iconClass} />} title={t("settings.privacyTitle")} hint={t("settings.hub.privacyDesc")} />
        <SettingsLinkRow href="/settings/preferences" icon={<Palette size={18} className={iconClass} />} title={t("settings.groupPreferences")} hint={t("settings.hub.preferencesDesc")} />
        <SettingsLinkRow href="/settings/developer" icon={<Code2 size={18} className={iconClass} />} title={t("settings.groupDeveloper")} hint={t("settings.hub.developerDesc")} />
        <SettingsLinkRow href="/settings/legal" icon={<FileText size={18} className={iconClass} />} title={t("legal.groupTitle")} hint={t("settings.hub.legalDesc")} />
        <SettingsLinkRow href="/settings/danger" icon={<TriangleAlert size={18} className="text-danger" />} title={t("settings.groupDanger")} hint={t("settings.hub.dangerDesc")} />
      </nav>

      <div className="border-t border-border-soft pt-6">
        <Button type="button" variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
          <LogOut size={14} />
          {isSigningOut ? t("settings.signingOut") : t("settings.signOut")}
        </Button>
      </div>
    </div>
  );
}
