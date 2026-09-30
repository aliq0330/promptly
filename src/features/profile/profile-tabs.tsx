"use client";

import { Tabs } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n/language-provider";

export type ProfileTabKey = "prompts" | "requests" | "generators" | "saved" | "liked" | "about";

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
