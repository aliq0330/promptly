import { Suspense } from "react";
import { PresetCreateGate } from "@/features/presets/preset-gate";

export default function PresetCreatePage() {
  return (
    <Suspense fallback={null}>
      <PresetCreateGate />
    </Suspense>
  );
}
