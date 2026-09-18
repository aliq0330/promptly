import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { FollowProvider } from "@/features/profile/follow-provider";
import { LikeProvider, SaveProvider } from "@/features/prompts/like-save-provider";
import { CommentProvider } from "@/features/prompts/comment-provider";

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <FollowProvider>
      <LikeProvider>
        <SaveProvider>
          <CommentProvider>
            <AppShell>{children}</AppShell>
          </CommentProvider>
        </SaveProvider>
      </LikeProvider>
    </FollowProvider>
  );
}
