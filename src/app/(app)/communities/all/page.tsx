import { Suspense } from "react";
import { AllCommunitiesPage } from "@/features/communities/all-communities-page";

export default function AllCommunitiesRoute() {
  return (
    <Suspense fallback={null}>
      <AllCommunitiesPage />
    </Suspense>
  );
}
