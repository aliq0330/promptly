import { Suspense } from "react";
import { TagView } from "@/features/prompts/tag-view";

export default function TagLocalPage() {
  return (
    <Suspense fallback={null}>
      <TagView />
    </Suspense>
  );
}
