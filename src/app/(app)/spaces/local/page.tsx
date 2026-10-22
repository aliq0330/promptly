import { Suspense } from "react";
import { SpacePage } from "@/features/spaces/space-page";

export default function SpaceRoute() {
  return (
    <Suspense fallback={null}>
      <SpacePage />
    </Suspense>
  );
}
