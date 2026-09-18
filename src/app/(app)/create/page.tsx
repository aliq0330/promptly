import { Suspense } from "react";
import { CreatePromptForm } from "@/features/prompts/create-prompt-form";

export default function CreatePromptPage() {
  return (
    <Suspense fallback={null}>
      <CreatePromptForm />
    </Suspense>
  );
}
