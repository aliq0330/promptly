import { Layers, Sparkle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface BadgeDefinition {
  key: string;
  icon: LucideIcon;
  label: string;
  isEarned: (stats: { publishedPromptCount: number }) => boolean;
}

/**
 * Modular, extensible badge system (CLAUDE.md section 17) — deliberately
 * small right now: every badge here is evaluated against real counts
 * derived from the mock prompt list, never hardcoded as "earned". No badge
 * is shown until its condition is actually met, and none of the more
 * elaborate ideas from the spec (community-event participation, etc.) were
 * added since there's no real data to back them yet — this array is the
 * intended extension point for those once that data exists.
 */
const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    key: "first-prompt",
    icon: Sparkle,
    label: "İlk promptunu yayımladı",
    isEarned: ({ publishedPromptCount }) => publishedPromptCount >= 1,
  },
  {
    key: "prolific",
    icon: Layers,
    label: "Üretken yaratıcı (10+ prompt)",
    isEarned: ({ publishedPromptCount }) => publishedPromptCount >= 10,
  },
];

export function ProfileBadges({
  publishedPromptCount,
}: {
  publishedPromptCount: number;
}) {
  const earned = BADGE_DEFINITIONS.filter((badge) =>
    badge.isEarned({ publishedPromptCount }),
  );

  if (earned.length === 0) return null;

  return (
    <>
      {earned.map((badge) => {
        const Icon = badge.icon;
        return (
          <span
            key={badge.key}
            title={badge.label}
            className="flex items-center gap-1 rounded-xs bg-primary-soft px-2 py-0.5 text-caption font-medium text-primary"
          >
            <Icon size={12} />
            {badge.label}
          </span>
        );
      })}
    </>
  );
}
