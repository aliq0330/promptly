import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { FollowProvider } from "@/features/profile/follow-provider";
import { ProfileOverridesProvider } from "@/features/profile/profile-overrides-provider";
import { LikeProvider, SaveProvider } from "@/features/prompts/like-save-provider";
import { CommentProvider } from "@/features/prompts/comment-provider";
import { HiddenPromptsProvider } from "@/features/prompts/hidden-prompts-provider";

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <FollowProvider>
      <ProfileOverridesProvider>
        <LikeProvider>
          <SaveProvider>
            <CommentProvider>
              <HiddenPromptsProvider>
                <AppShell>{children}</AppShell>
              </HiddenPromptsProvider>
            </CommentProvider>
          </SaveProvider>
        </LikeProvider>
      </ProfileOverridesProvider>
    </FollowProvider>
  );
}
