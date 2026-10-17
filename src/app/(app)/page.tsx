import { FeedTabs } from "@/features/feed/feed-tabs";
import { HomeIntro } from "@/features/feed/home-intro";
import { CommunityRings } from "@/features/feed/community-rings";
import { HomeRail } from "@/features/feed/home-rail";
import { WeeklyChallengeBanner } from "@/features/challenges/weekly-challenge-banner";

/**
 * Meydan home (docs/history/190-*): one social column (composer, community
 * rings, feed) and, on wide screens, a right rail with the weekly theme,
 * trending tags and creators to follow. Below `xl` the rail is hidden and
 * the weekly theme moves into the column.
 */
export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-[1080px] gap-8 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto w-full min-w-0 max-w-[640px] space-y-5 xl:mx-0">
        <HomeIntro />
        <CommunityRings />
        <div className="xl:hidden">
          <WeeklyChallengeBanner />
        </div>
        <FeedTabs layout="stream" />
      </div>
      <aside className="hidden w-[320px] shrink-0 xl:block">
        <div className="sticky top-24">
          <HomeRail />
        </div>
      </aside>
    </div>
  );
}
