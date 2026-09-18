import { FeedTabs } from "@/features/feed/feed-tabs";
import { mockPrompts } from "@/mocks/prompts";

export default function HomePage() {
  const feed = [...mockPrompts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return <FeedTabs prompts={feed} />;
}
