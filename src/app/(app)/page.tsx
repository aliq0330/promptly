import { FeedTabs } from "@/features/feed/feed-tabs";
import { feedItemCreatedAt, type FeedItem } from "@/features/feed/types";
import { mockPrompts } from "@/mocks/prompts";
import { mockRequests } from "@/mocks/requests";

export default function HomePage() {
  const items: FeedItem[] = [
    ...mockPrompts.map((prompt): FeedItem => ({ kind: "prompt", data: prompt })),
    ...mockRequests.map((request): FeedItem => ({ kind: "request", data: request })),
  ].sort((a, b) => feedItemCreatedAt(b) - feedItemCreatedAt(a));

  return <FeedTabs items={items} />;
}
