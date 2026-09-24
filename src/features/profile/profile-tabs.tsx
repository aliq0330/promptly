"use client";

import { Tabs } from "@/components/ui/tabs";

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
  return <Tabs items={tabs} active={active} onChange={onChange} ariaLabel="Profil bölümleri" />;
}
