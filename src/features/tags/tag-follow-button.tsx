"use client";

import { useState } from "react";
import { FollowButtonView } from "@/features/profile/follow-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useFollowedTags } from "./followed-tags-store";

/**
 * Follow / unfollow a tag — the same button look as following a person
 * (`FollowButtonView`, so guests get the shared login prompt). Tells the
 * viewer when the 100-tag limit or a failed request kept the change from
 * sticking, instead of silently snapping back.
 */
export function TagFollowButton({ slug, label, className }: { slug: string; label: string; className?: string }) {
  const { t } = useTranslation();
  const followed = useFollowedTags();
  const [problem, setProblem] = useState<"limit" | "failed" | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <FollowButtonView
        isFollowing={followed.isFollowing(slug)}
        canFollow={followed.canFollow}
        loading={followed.canFollow && !followed.loaded}
        size="md"
        className={className}
        toggle={() => {
          setProblem(null);
          void followed.toggle({ slug, label }).then((result) => {
            if (result === "limit" || result === "failed") setProblem(result);
          });
        }}
      />
      {problem && (
        <p className="text-caption text-danger" role="alert">
          {problem === "limit" ? t("tag.followLimit") : t("tag.followFailed")}
        </p>
      )}
    </div>
  );
}
