import { PageContainer } from "@/components/ui/page-header";
import { FeedTabs } from "@/features/feed/feed-tabs";
import { HomeIntro } from "@/features/feed/home-intro";
import { WeeklyChallengeBanner } from "@/features/challenges/weekly-challenge-banner";

export default function HomePage() {
  return (
    <PageContainer className="space-y-6 sm:space-y-8">
      <HomeIntro />
      <WeeklyChallengeBanner />
      <FeedTabs />
    </PageContainer>
  );
}
