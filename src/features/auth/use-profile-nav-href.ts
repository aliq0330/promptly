"use client";

import { useAuth } from "./auth-provider";
import { useOwnProfile } from "./own-profile-provider";
import { profileHref } from "@/lib/utils";

/**
 * Where the "Profil" nav entry (sidebar/mobile nav/header avatar) should
 * point: a real signed-in user's own profile once it's loaded, otherwise
 * the mock "me" persona — the demo browsing experience CLAUDE.md Bölüm 17
 * deliberately kept unchanged for anyone not actually logged in.
 */
export function useProfileNavHref(): string {
  const { user } = useAuth();
  const { profile } = useOwnProfile();
  return user && profile ? profileHref(profile) : "/profile/me";
}
