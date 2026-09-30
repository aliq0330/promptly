import { Suspense } from "react";
import { WorkflowDetailView } from "@/features/workflows/workflow-view";

export default function WorkflowLocalPage() {
  return (
    <Suspense fallback={null}>
      <WorkflowDetailView />
    </Suspense>
  );
}
