import { Suspense } from "react";
import { CreateGate } from "@/features/prompts/create-gate";

export default function CreatePromptPage() {
  return (
    <Suspense fallback={null}>
      <CreateGate />
    </Suspense>
  );
}
