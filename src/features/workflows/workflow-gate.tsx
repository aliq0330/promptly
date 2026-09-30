"use client";

import { useSearchParams } from "next/navigation";
import { WorkflowEditor } from "./workflow-editor";

/** Reads `?edit=<workflowId>` (same convention as the generator builder). */
export function WorkflowCreateGate() {
  const editId = useSearchParams().get("edit");
  return <WorkflowEditor key={editId ?? "new"} editId={editId} />;
}
