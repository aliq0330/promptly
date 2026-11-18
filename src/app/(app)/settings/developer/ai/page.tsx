"use client";

import { useAuth } from "@/features/auth/auth-provider";
import { DeveloperAiPage } from "@/features/settings/developer-settings";

export default function DeveloperAiSettingsPage() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return <DeveloperAiPage />;
}
