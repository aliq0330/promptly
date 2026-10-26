"use client";

import { ScrollRow } from "@/components/ui/scroll-row";
import { StoryHighlightsRow } from "@/features/stories/story-highlights";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Collection } from "@/types";
import { CollectionRings } from "./collection-rings";

/**
 * The profile's ONE strip under the header (docs/history/243-*): story highlights first, then — behind a thin line — the public
 * collections. Each group draws itself only when it has something (`data-rail-group`), so a strip with neither takes no room at all.
 */
export function ProfileRail({ ownerId, isOwnProfile, collections }: { ownerId: string; isOwnProfile: boolean; collections: Collection[] }) {
  const { t } = useTranslation();
  return (
    <ScrollRow
      as="nav"
      aria-label={t("profile.railAriaLabel")}
      data-profile-rail
      wrapperClassName="mt-5 hidden has-[[data-rail-group]]:block"
      className="-mx-4 gap-4 px-4 sm:mx-0 sm:px-0"
    >
      {/* Öne çıkan hikâyeler (docs/history/198-*) */}
      <StoryHighlightsRow ownerId={ownerId} isOwnProfile={isOwnProfile} />
      <CollectionRings collections={collections} />
    </ScrollRow>
  );
}
