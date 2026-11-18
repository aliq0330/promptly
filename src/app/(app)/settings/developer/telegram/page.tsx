"use client";

import { useAuth } from "@/features/auth/auth-provider";
import { DeveloperTelegramPage } from "@/features/settings/developer-settings";

export default function DeveloperTelegramSettingsPage() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return <DeveloperTelegramPage />;
}
