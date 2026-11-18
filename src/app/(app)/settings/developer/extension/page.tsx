"use client";

import { useAuth } from "@/features/auth/auth-provider";
import { DeveloperExtensionPage } from "@/features/settings/developer-settings";

export default function DeveloperExtensionSettingsPage() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return <DeveloperExtensionPage />;
}
