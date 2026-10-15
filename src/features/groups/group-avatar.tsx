import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Grup görseli; görsel yoksa ya da yüklenemezse adın baş harfleri. `badge`: köşede küçük "grup" işareti (listelerde birebir sohbetten ayırt etmek için). */
export function GroupAvatar({
  name,
  avatarUrl,
  size = 40,
  badge = false,
  className,
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
  badge?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar src={avatarUrl} alt={name} size={size} />
      {badge && (
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-surface bg-primary text-primary-foreground"
          style={{ width: Math.max(16, size * 0.4), height: Math.max(16, size * 0.4) }}
        >
          <Users size={Math.max(9, size * 0.22)} strokeWidth={2.25} />
        </span>
      )}
    </span>
  );
}
