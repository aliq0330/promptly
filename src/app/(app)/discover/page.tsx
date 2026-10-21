"use client";

import { PageContainer } from "@/components/ui/page-header";
import { DiscoverFeed } from "@/features/feed/discover-feed";

export default function DiscoverPage() {
  // docs/history/210-*: the title shares the search box's row (DiscoverFeed → SearchView `heading`), no description block.
  return (
    <PageContainer>
      <DiscoverFeed />
    </PageContainer>
  );
}
