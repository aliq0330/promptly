import { FeedTabs } from "@/features/feed/feed-tabs";
import { HomeIntro } from "@/features/feed/home-intro";
import { StoryTray } from "@/features/stories/story-tray";
import { HomeRail } from "@/features/feed/home-rail";
import { WeeklyChallengeBanner } from "@/features/challenges/weekly-challenge-banner";

/**
 * Meydan home (docs/history/190-*): the main column (composer, story tray —
 * docs/history/198-*, it replaced the community rings —, feed — the posts in the same boxed two-column grid as Keşfet from
 * `sm`, edge-to-edge rows on a phone) and, on wide screens, a right rail with
 * the weekly theme, trending tags and creators to follow. Below `xl` the rail
 * is hidden and the weekly theme moves into the column.
 */
export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] gap-8 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div className="w-full min-w-0 flex-1 space-y-5">
        <HomeIntro />
        <StoryTray />
        <div className="xl:hidden">
          <WeeklyChallengeBanner />
        </div>
        <FeedTabs layout="home" />
      </div>
      <aside className="hidden w-[320px] shrink-0 xl:block">
        <div className="sticky top-24">
          <HomeRail />
        </div>
      </aside>
    </div>
  );
}
