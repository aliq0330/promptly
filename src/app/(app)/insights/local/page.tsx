import { Suspense } from "react";
import { PromptInsightsView } from "@/features/insights/prompt-insights-view";

export default function PromptInsightsRoute() {
  return (
    <Suspense fallback={null}>
      <PromptInsightsView />
    </Suspense>
  );
}
