"use client";

import { useAuth } from "./auth-provider";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/**
 * The single, three-way answer to "who is looking at this?" — straight from
 * the Supabase session in `AuthProvider` (no localStorage flag). `loading`
 * must render NEITHER guest nor member UI, otherwise the wrong one flashes.
 */
export function useAuthStatus(): AuthStatus {
  const { user, loading } = useAuth();
  if (loading) return "loading";
  return user ? "authenticated" : "unauthenticated";
}
