import type { ReactNode } from "react";
import { OwnProfileProvider } from "@/features/auth/own-profile-provider";
import { RealPromptsProvider } from "@/features/prompts/real-prompts-provider";
import { RealRequestsProvider } from "@/features/requests/real-requests-provider";
import { RealWorkflowsProvider } from "@/features/workflows/real-workflows-provider";
import { RealPresetsProvider } from "@/features/presets/real-presets-provider";
import { RealGeneratorsProvider } from "@/features/generators/real-generators-provider";
import { RealMessagesProvider } from "@/features/messages/real-messages-provider";
import { NotificationsProvider } from "@/features/notifications/notifications-provider";
import { EngagementRealtimeProvider } from "@/features/content/engagement-realtime-provider";

/**
 * All of the app's client state providers composed in one place — every one
 * backed by the real Supabase `profiles`/`prompts`/`prompt_requests`/
 * `generators`/`conversations`/`notifications` tables (CLAUDE.md's
 * mock-data removal). Order between them doesn't matter, none depend on
 * another. `EngagementRealtimeProvider` is a childless, side-effect-only
 * sibling (same shape as `PreferencesSync` in `layout.tsx`) — it has no
 * context value to share, just a subscription to keep alive.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <OwnProfileProvider>
      <RealPromptsProvider>
        <RealRequestsProvider>
          <RealGeneratorsProvider>
            <RealWorkflowsProvider>
              <RealPresetsProvider>
                <RealMessagesProvider>
                  <NotificationsProvider>
                    <EngagementRealtimeProvider />
                    {children}
                  </NotificationsProvider>
                </RealMessagesProvider>
              </RealPresetsProvider>
            </RealWorkflowsProvider>
          </RealGeneratorsProvider>
        </RealRequestsProvider>
      </RealPromptsProvider>
    </OwnProfileProvider>
  );
}
