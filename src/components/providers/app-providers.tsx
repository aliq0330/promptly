import type { ReactNode } from "react";
import { OwnProfileProvider } from "@/features/auth/own-profile-provider";
import { RealPromptsProvider } from "@/features/prompts/real-prompts-provider";
import { RealRequestsProvider } from "@/features/requests/real-requests-provider";
import { RealMessagesProvider } from "@/features/messages/real-messages-provider";

/**
 * All of the app's client state providers composed in one place — every one
 * backed by the real Supabase `profiles`/`prompts`/`prompt_requests`/
 * `conversations` tables (CLAUDE.md's mock-data removal). Order between
 * them doesn't matter, none depend on another.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <OwnProfileProvider>
      <RealPromptsProvider>
        <RealRequestsProvider>
          <RealMessagesProvider>{children}</RealMessagesProvider>
        </RealRequestsProvider>
      </RealPromptsProvider>
    </OwnProfileProvider>
  );
}
