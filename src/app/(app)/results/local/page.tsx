import { Suspense } from "react";
import { ResultDetailView } from "@/features/prompts/result-detail-view";

export default function ResultLocalPage() {
  return (
    <Suspense fallback={null}>
      <ResultDetailView />
    </Suspense>
  );
}
