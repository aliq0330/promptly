import { Suspense } from "react";
import { RelationMapView } from "@/features/relations/relation-map-view";

export default function RelationMapPage() {
  return (
    <Suspense fallback={null}>
      <RelationMapView />
    </Suspense>
  );
}
