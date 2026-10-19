import { Suspense } from "react";
import { StoryCreator } from "@/features/stories/story-creator";

export default function StoryCreatePage() {
  return (
    <Suspense fallback={null}>
      <StoryCreator />
    </Suspense>
  );
}
