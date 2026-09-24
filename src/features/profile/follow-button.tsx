"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFollowState } from "./use-follow-state";
import type { UserProfile } from "@/types";

const SIZE_CLASSES: Record<"sm" | "md", string> = {
  sm: "h-8 px-3 text-label gap-1.5",
  md: "h-10 px-4 text-small gap-2",
};

interface FollowButtonViewProps {
  isFollowing: boolean;
  toggle: () => void;
  canFollow: boolean;
  loading: boolean;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Presentational half of the follow button, taking already-computed state
 * as props instead of calling `useFollowState` itself. `ProfileHeader`
 * uses this directly (via `OtherProfileActions`) so the header's follower
 * count and the button's own label share the exact same `useFollowState`
 * call — two independent hook instances would each hold their own local
 * optimistic state for a real target, so clicking the button wouldn't
 * move the count next to it until the whole profile reloaded.
 */
export function FollowButtonView({ isFollowing, toggle, canFollow, loading, size = "sm", className }: FollowButtonViewProps) {
  if (!canFollow) {
    return (
      <Link
        href="/login"
        title="Takip etmek için giriş yapmalısın"
        className={cn(
          "inline-flex items-center justify-center rounded-md bg-primary font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary-hover",
          SIZE_CLASSES[size],
          className,
        )}
      >
        Takip Et
      </Link>
    );
  }

  return (
    <Button
      type="button"
      variant={isFollowing ? "outline" : "primary"}
      size={size}
      onClick={toggle}
      disabled={loading}
      className={className}
    >
      {isFollowing ? "Takip Ediliyor" : "Takip Et"}
    </Button>
  );
}

/** Standalone version — owns its own `useFollowState` call. Used wherever there's no ancestor already tracking the same target's follow state (creator rows, Keşfet's creator cards). */
export function FollowButton({
  user,
  size = "sm",
  className,
}: {
  user: UserProfile;
  size?: "sm" | "md";
  className?: string;
}) {
  const state = useFollowState(user);
  return <FollowButtonView {...state} size={size} className={className} />;
}
