import { Suspense } from "react";
import { GeneratorDetailView } from "@/features/generators/generator-detail-view";

export default function GeneratorLocalPage() {
  return (
    <Suspense fallback={null}>
      <GeneratorDetailView />
    </Suspense>
  );
}
