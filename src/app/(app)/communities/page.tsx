import { Suspense } from "react";
import { CommunitiesPage } from "@/features/communities/communities-page";

export default function CommunitiesRoute() {
  return (
    <Suspense fallback={null}>
      <CommunitiesPage />
    </Suspense>
  );
}
