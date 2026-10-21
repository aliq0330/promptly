"use client";

import { useState } from "react";
import { FollowButtonView } from "@/features/profile/follow-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useFollowedTools } from "./followed-tools-store";

/** Follow / unfollow an AI tool — the same button as following a tag or a person (guests get the shared login prompt). */
export function ToolFollowButton({ toolId, className }: { toolId: string; className?: string }) {
  const { t } = useTranslation();
  const followed = useFollowedTools();
  const [problem, setProblem] = useState<"limit" | "failed" | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <FollowButtonView
        isFollowing={followed.isFollowing(toolId)}
        canFollow={followed.canFollow}
        loading={followed.canFollow && !followed.loaded}
        size="md"
        className={className}
        toggle={() => {
          setProblem(null);
          void followed.toggle(toolId).then((result) => {
            if (result === "limit" || result === "failed") setProblem(result);
          });
        }}
      />
      {problem && (
        <p className="text-caption text-danger" role="alert">
          {problem === "limit" ? t("tool.followLimit") : t("tool.followFailed")}
        </p>
      )}
    </div>
  );
}
