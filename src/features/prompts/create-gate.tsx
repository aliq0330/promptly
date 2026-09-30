"use client";

import { useSearchParams } from "next/navigation";
import { CreateChoice } from "./create-choice";
import { CreatePromptForm } from "./create-prompt-form";

/**
 * Decides between the create-choice picker and the actual prompt form.
 * A bare `/create` visit shows the picker; any deep link that already
 * carries intent (duplicate/answerRequest/an explicit `?mode=`) goes
 * straight to the form, so existing internal links ("Kopyasını oluştur",
 * etc.) keep working exactly as before.
 */
export function CreateGate() {
  const searchParams = useSearchParams();
  const hasIntent =
    searchParams.get("duplicate") ||
    searchParams.get("answerRequest") ||
    searchParams.get("edit") ||
    searchParams.get("generatorRun") ||
    searchParams.get("mode") === "prompt";

  // The form seeds its fields once, on mount. Keying it by the deep-link
  // params remounts it (fresh prefill) when a client-side navigation moves
  // from one intent to another (e.g. duplicate=A → duplicate=B) without a
  // full page reload.
  const formKey = ["duplicate", "answerRequest", "edit", "generatorRun", "mode"]
    .map((name) => searchParams.get(name) ?? "")
    .join("|");

  return hasIntent ? <CreatePromptForm key={formKey} /> : <CreateChoice />;
}
