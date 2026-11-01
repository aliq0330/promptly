"use client";

import { useAuth } from "@/features/auth/auth-provider";
import { DeveloperSettings } from "@/features/settings/developer-settings";

export default function DeveloperSettingsPage() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return <DeveloperSettings />;
}
