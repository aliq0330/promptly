import { CreatorRow } from "./creator-row";
import type { UserProfile } from "@/types";

export function CreatorList({ users }: { users: UserProfile[] }) {
  if (users.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">Henüz kimseyi takip etmiyorsun.</p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {users.map((user) => (
        <CreatorRow key={user.id} user={user} />
      ))}
    </div>
  );
}
