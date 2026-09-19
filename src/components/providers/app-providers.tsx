import type { ReactNode } from "react";
import { OwnProfileProvider } from "@/features/auth/own-profile-provider";
import { FollowProvider } from "@/features/profile/follow-provider";
import { ProfileOverridesProvider } from "@/features/profile/profile-overrides-provider";
import { LikeProvider, SaveProvider } from "@/features/prompts/like-save-provider";
import { CommentProvider } from "@/features/prompts/comment-provider";
import { HiddenPromptsProvider } from "@/features/prompts/hidden-prompts-provider";
import { LocalPromptsProvider } from "@/features/prompts/local-prompts-provider";
import { RealPromptsProvider } from "@/features/prompts/real-prompts-provider";
import { RequestsProvider } from "@/features/requests/requests-provider";
import { RealRequestsProvider } from "@/features/requests/real-requests-provider";
import { RealMessagesProvider } from "@/features/messages/real-messages-provider";

/**
 * All of the app's client state providers composed in one place — most are
 * localStorage-backed (follow/like/save/comment/hide/profile-edits/
 * local-prompts/local-requests, see each provider's own file for its
 * honesty boundaries); `OwnProfileProvider`/`RealPromptsProvider`/
 * `RealRequestsProvider`/`RealMessagesProvider` are the exceptions, backed
 * by the actual Supabase `profiles`/`prompts`/`prompt_requests`/
 * `conversations` tables (CLAUDE.md Bölüm 21). Split out once nesting
 * these individually in the layout got hard to read; order between them
 * doesn't matter, none depend on another.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <OwnProfileProvider>
      <FollowProvider>
        <ProfileOverridesProvider>
          <LikeProvider>
            <SaveProvider>
              <CommentProvider>
                <HiddenPromptsProvider>
                  <LocalPromptsProvider>
                    <RealPromptsProvider>
                      <RequestsProvider>
                        <RealRequestsProvider>
                          <RealMessagesProvider>{children}</RealMessagesProvider>
                        </RealRequestsProvider>
                      </RequestsProvider>
                    </RealPromptsProvider>
                  </LocalPromptsProvider>
                </HiddenPromptsProvider>
              </CommentProvider>
            </SaveProvider>
          </LikeProvider>
        </ProfileOverridesProvider>
      </FollowProvider>
    </OwnProfileProvider>
  );
}
