import { Suspense } from "react";
import { LocalPromptView } from "@/features/prompts/local-prompt-view";

export default function LocalPromptPage() {
  return (
    <Suspense fallback={null}>
      <LocalPromptView />
    </Suspense>
  );
}
