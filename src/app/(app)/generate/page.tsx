import { Suspense } from "react";
import { LegacyGenerateRedirect } from "@/features/studio/legacy-generate-redirect";

/** `/generate` was renamed `/studio`; old links keep working. */
export default function GeneratePage() {
  return (
    <Suspense fallback={null}>
      <LegacyGenerateRedirect />
    </Suspense>
  );
}
