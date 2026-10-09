import { Suspense } from "react";
import { GenerateView } from "@/features/generate/generate-view";

export default function GeneratePage() {
  return (
    <Suspense fallback={null}>
      <GenerateView />
    </Suspense>
  );
}
