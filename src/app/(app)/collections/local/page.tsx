import { Suspense } from "react";
import { CollectionDetailView } from "@/features/collections/collection-detail-view";

export default function CollectionLocalPage() {
  return (
    <Suspense fallback={null}>
      <CollectionDetailView />
    </Suspense>
  );
}
