import { Suspense } from "react";
import { WorkflowCreateGate } from "@/features/workflows/workflow-gate";

export default function WorkflowCreatePage() {
  return (
    <Suspense fallback={null}>
      <WorkflowCreateGate />
    </Suspense>
  );
}
