import { Suspense } from "react";
import { StoryPage } from "@/features/stories/story-page";

export default function StoryLocalPage() {
  return (
    <Suspense fallback={null}>
      <StoryPage />
    </Suspense>
  );
}
