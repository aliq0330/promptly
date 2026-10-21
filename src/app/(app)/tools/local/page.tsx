import { Suspense } from "react";
import { ToolView } from "@/features/tools/tool-view";

export default function ToolLocalPage() {
  return (
    <Suspense fallback={null}>
      <ToolView />
    </Suspense>
  );
}
