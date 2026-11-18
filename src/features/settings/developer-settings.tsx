"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Code2 } from "@/components/icons/code-2";
import { KeyRound } from "@/components/icons/key-round";
import { Blocks } from "@/components/icons/blocks";
import { Send } from "@/components/icons/send";
import { Sparkles } from "@/components/icons/sparkles";
import { ConnectWizard } from "@/features/developers/connect-wizard";
import { AccessList, useDeveloperAccess } from "@/features/settings/access-list";
import { ApiKeysSection } from "@/features/settings/api-keys-section";
import { ExtensionSection } from "@/features/settings/extension-section";
import { SettingsCard, SettingsLinkRow, SettingsSubpage } from "@/features/settings/settings-ui";
import { TelegramSection } from "@/features/settings/telegram-section";
import { developerEndpoints } from "@/lib/developers";
import { useTranslation } from "@/lib/i18n/language-provider";
import { telegramBotHandle } from "@/lib/telegram-link";
import extensionManifest from "../../../promptly-extension/manifest.json";

/**
 * Ayarlar → Geliştirici (docs/history/433-*; 318-*, 319-* sihirbazı, 429-* uzantı, 323-* Telegram bunun alt sayfalarına taşındı): MERKEZ sayfa kısadır — dört bağlanma yolu
 * (kart başına tek durum + tek eylem) ve tek "Erişimlerim" listesi. Her yol kendi alt sayfasında açılır: `/settings/developer/{ai,extension,telegram,api}`.
 * Alt sayfalar mevcut bileşenleri aynen kullanır (`ConnectWizard`, `ExtensionSection`, `TelegramSection`, `ApiKeysSection`); yeni bir bağlanma yolu bir kart + bir alt sayfa ekler.
 */

const DEVELOPER_HREF = "/settings/developer";

interface TileProps {
  href: string;
  icon: ReactNode;
  title: string;
  lead: string;
  status: string;
  statusTone: "ok" | "neutral";
  action: string;
  primary?: boolean;
  tile: string;
}

function Tile({ href, icon, title, lead, status, statusTone, action, primary, tile }: TileProps) {
  return (
    <Link
      href={href}
      data-developer-tile={tile}
      className="group flex min-h-36 flex-col gap-3 rounded-lg card-flat p-4 shadow-card transition-colors duration-200 ease-soft hover:border-border-strong"
    >
      <span className="flex items-center gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">{icon}</span>
        <span className="font-display text-body font-semibold text-text">{title}</span>
      </span>
      <span className="text-small leading-relaxed text-text-secondary">{lead}</span>
      <span className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <span className={statusTone === "ok" ? "rounded-full bg-success-soft px-2.5 py-0.5 text-caption font-semibold text-success" : "rounded-full bg-surface-soft px-2.5 py-0.5 text-caption font-semibold text-text-secondary"}>{status}</span>
        <span className={primary ? "rounded-full bg-primary px-4 py-1.5 text-small font-semibold text-primary-foreground" : "rounded-full border border-border-strong px-4 py-1.5 text-small font-semibold text-text"}>{action}</span>
      </span>
    </Link>
  );
}

export function DeveloperSettings() {
  const { t } = useTranslation();
  const access = useDeveloperAccess();
  const telegramAvailable = Boolean(telegramBotHandle(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME)) || access.telegramCount > 0;

  return (
    <SettingsSubpage title={t("settings.groupDeveloper")} description={t("settings.hub.developerDesc")}>
      <section className="space-y-3" aria-labelledby="dev-connect">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 id="dev-connect" className="font-display text-h3 font-bold tracking-[-0.02em] text-text">{t("devSettings.hub.connectTitle")}</h2>
          <span className="text-caption text-text-muted">{t("devSettings.hub.connectHint")}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Tile
            tile="ai"
            href={`${DEVELOPER_HREF}/ai/`}
            icon={<Sparkles size={20} />}
            title={t("devSettings.hub.aiTitle")}
            lead={t("devSettings.hub.aiLead")}
            status={access.aiCount > 0 ? t("devSettings.hub.statusCount", { count: access.aiCount }) : t("devSettings.hub.statusNone")}
            statusTone={access.aiCount > 0 ? "ok" : "neutral"}
            action={t(access.aiCount > 0 ? "devSettings.hub.actionManage" : "devSettings.hub.actionConnect")}
            primary={access.aiCount === 0}
          />
          <Tile
            tile="extension"
            href={`${DEVELOPER_HREF}/extension/`}
            icon={<Blocks size={20} />}
            title={t("devSettings.extTitle")}
            lead={t("devSettings.hub.extLead")}
            status={access.extensionConnected ? t("devSettings.hub.statusConnected") : t("devSettings.extVersion", { version: extensionManifest.version })}
            statusTone={access.extensionConnected ? "ok" : "neutral"}
            action={t(access.extensionConnected ? "devSettings.hub.actionManage" : "devSettings.hub.actionInstall")}
            primary={!access.extensionConnected}
          />
          {telegramAvailable && (
            <Tile
              tile="telegram"
              href={`${DEVELOPER_HREF}/telegram/`}
              icon={<Send size={20} />}
              title={t("devSettings.hub.tgTitle")}
              lead={t("devSettings.hub.tgLead")}
              status={access.telegramCount > 0 ? t("devSettings.hub.statusCount", { count: access.telegramCount }) : t("devSettings.hub.statusNone")}
              statusTone={access.telegramCount > 0 ? "ok" : "neutral"}
              action={t(access.telegramCount > 0 ? "devSettings.hub.actionManage" : "devSettings.hub.actionConnect")}
              primary={access.telegramCount === 0}
            />
          )}
          <Tile
            tile="api"
            href={`${DEVELOPER_HREF}/api/`}
            icon={<KeyRound size={20} />}
            title={t("devSettings.hub.apiTitle")}
            lead={t("devSettings.hub.apiLead")}
            status={access.keyCount > 0 ? t("devSettings.hub.statusKeys", { count: access.keyCount }) : t("devSettings.hub.statusNoKeys")}
            statusTone={access.keyCount > 0 ? "ok" : "neutral"}
            action={t("devSettings.hub.actionCreateKey")}
          />
        </div>
      </section>

      <AccessList access={access} />

      <SettingsLinkRow href="/developers" icon={<Code2 size={20} className="text-text-secondary" />} title={t("devSettings.docsTitle")} hint={t("devSettings.docsHint")} />
    </SettingsSubpage>
  );
}

const subpage = { backHref: DEVELOPER_HREF + "/" };

/** Alt sayfa: yapay zekâ aracına bağlama sihirbazı (eski "Yapay zekâ aracına bağla" kartı). */
export function DeveloperAiPage() {
  const { t } = useTranslation();
  const endpoints = developerEndpoints(process.env.NEXT_PUBLIC_SUPABASE_URL);
  return (
    <SettingsSubpage title={t("devSettings.aiPageTitle")} description={t("devSettings.connectLead")} backLabel={t("devSettings.back")} {...subpage}>
      <SettingsCard title={t("devSettings.connectTitle")}>
        <div className="space-y-4">
          {endpoints ? <ConnectWizard mcpMeUrl={endpoints.mcpMeUrl} keysHref={`${DEVELOPER_HREF}/api/`} /> : null}
          <p className="border-t border-border-soft pt-4 text-caption leading-relaxed text-text-muted">
            {t("devSettings.moreTools")}{" "}
            <Link href="/developers" className="font-medium text-primary hover:underline">{t("devSettings.docsTitle")}</Link>
          </p>
        </div>
      </SettingsCard>
    </SettingsSubpage>
  );
}

export function DeveloperExtensionPage() {
  const { t } = useTranslation();
  return (
    <SettingsSubpage title={t("devSettings.extTitle")} description={t("devSettings.extLead")} backLabel={t("devSettings.back")} {...subpage}>
      <ExtensionSection />
    </SettingsSubpage>
  );
}

export function DeveloperTelegramPage() {
  const { t } = useTranslation();
  return (
    <SettingsSubpage title={t("devSettings.tgPageTitle")} backLabel={t("devSettings.back")} {...subpage}>
      <TelegramSection />
    </SettingsSubpage>
  );
}

export function DeveloperApiPage() {
  const { t } = useTranslation();
  return (
    <SettingsSubpage title={t("devSettings.apiPageTitle")} description={t("devSettings.apiPageLead")} backLabel={t("devSettings.back")} {...subpage}>
      <SettingsCard title={t("devSettings.keysTitle")} hint={t("apiKeys.hint")}>
        <ApiKeysSection />
      </SettingsCard>
    </SettingsSubpage>
  );
}
