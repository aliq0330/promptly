"use client";

import { useAuth } from "./auth-provider";
import { useOwnProfile } from "./own-profile-provider";
import { profileHref } from "@/lib/utils";

/** Where the "Profil" nav entry (sidebar/mobile nav/header avatar) should point: the signed-in user's own real profile, or `/login` while signed out. */
export function useProfileNavHref(): string {
  const { user } = useAuth();
  const { profile } = useOwnProfile();
  return user && profile ? profileHref(profile) : "/login";
}
