import { Suspense } from "react";
import { PresetDetailView } from "@/features/presets/preset-detail-view";

export default function PresetLocalPage() {
  return (
    <Suspense fallback={null}>
      <PresetDetailView />
    </Suspense>
  );
}
