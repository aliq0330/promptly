"use client";

import { useSearchParams } from "next/navigation";
import { CreateChoice } from "./create-choice";
import { CreatePromptForm } from "./create-prompt-form";

/**
 * Decides between the create-choice picker and the actual prompt form.
 * A bare `/create` visit shows the picker; any deep link that already
 * carries intent (remix/duplicate/answerRequest/an explicit `?mode=`)
 * goes straight to the form, so existing internal links (remix buttons,
 * "Kopyasını oluştur", etc.) keep working exactly as before.
 */
export function CreateGate() {
  const searchParams = useSearchParams();
  const hasIntent =
    searchParams.get("remix") ||
    searchParams.get("remixResponse") ||
    searchParams.get("duplicate") ||
    searchParams.get("answerRequest") ||
    searchParams.get("mode") === "prompt";

  return hasIntent ? <CreatePromptForm /> : <CreateChoice />;
}
