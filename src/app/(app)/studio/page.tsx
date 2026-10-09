import { Suspense } from "react";
import { StudioView } from "@/features/studio/studio-view";

export default function StudioPage() {
  return (
    <Suspense fallback={null}>
      <StudioView />
    </Suspense>
  );
}
