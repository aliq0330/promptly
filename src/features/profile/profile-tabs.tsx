"use client";

import { Tabs } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n/language-provider";

/** One flat row since Meydan (docs/history/190-*): the four kinds are top-level tabs, no nested "Gönderiler" row. */
export type ProfileTabKey = "prompts" | "requests" | "workflows" | "presets" | "drafts" | "saved" | "collections" | "spaces" | "quotes" | "liked" | "about";

export function ProfileTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: ProfileTabKey; label: string; count?: number }[];
  active: ProfileTabKey;
  onChange: (tab: ProfileTabKey) => void;
}) {
  const { t } = useTranslation();
  return <Tabs items={tabs} active={active} onChange={onChange} ariaLabel={t("profile.sectionsAriaLabel")} />;
}
