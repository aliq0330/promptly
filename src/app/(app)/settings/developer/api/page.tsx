"use client";

import { useAuth } from "@/features/auth/auth-provider";
import { DeveloperApiPage } from "@/features/settings/developer-settings";

export default function DeveloperApiSettingsPage() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return <DeveloperApiPage />;
}
