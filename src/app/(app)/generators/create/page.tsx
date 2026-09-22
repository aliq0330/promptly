import { Suspense } from "react";
import { GeneratorCreateGate } from "@/features/generators/generator-create-gate";

export default function GeneratorCreatePage() {
  return (
    <Suspense fallback={null}>
      <GeneratorCreateGate />
    </Suspense>
  );
}
