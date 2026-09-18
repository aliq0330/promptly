"use client";

import { Button } from "@/components/ui/button";
import { useFollow } from "./follow-provider";

export function FollowButton({
  userId,
  size = "sm",
  className,
}: {
  userId: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { isFollowing, toggleFollow } = useFollow();
  const following = isFollowing(userId);

  return (
    <Button
      type="button"
      variant={following ? "outline" : "primary"}
      size={size}
      onClick={() => toggleFollow(userId)}
      className={className}
    >
      {following ? "Takip Ediliyor" : "Takip Et"}
    </Button>
  );
}
