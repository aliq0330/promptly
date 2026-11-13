import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * The one person row (audit §6): 40 px avatar, name, a quiet second line (`@username` or `sub`) and an action slot on the right.
 * Teams, Spaces and the follower lists all drew their own; they share this. `href` makes the avatar + name one link; `avatar` swaps
 * the avatar node (e.g. a `PresenceAvatar`); `nameSuffix` sits after the name (the "· you" marker).
 */
export function PersonRow({
  name,
  username,
  avatarUrl,
  sub,
  right,
  className,
  href,
  avatar,
  nameSuffix,
  ...rest
}: {
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  sub?: ReactNode;
  right?: ReactNode;
  className?: string;
  href?: string;
  avatar?: ReactNode;
  nameSuffix?: ReactNode;
  [data: `data-${string}`]: string | undefined;
}) {
  const identity = (
    <>
      {avatar ?? <Avatar src={avatarUrl} alt={href ? "" : name} size={40} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-semibold text-text">
          {name}
          {nameSuffix}
        </p>
        {(sub || username) && <p className="truncate text-caption text-text-muted">{sub ?? `@${username}`}</p>}
      </div>
    </>
  );
  return (
    <div className={cn("flex items-center gap-3 py-2.5", className)} {...rest}>
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {identity}
        </Link>
      ) : (
        identity
      )}
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}
