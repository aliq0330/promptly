import { Suspense } from "react";
import { CommunityPage } from "@/features/communities/community-page";

export default function CommunityDetailRoute() {
  return (
    <Suspense fallback={null}>
      <CommunityPage />
    </Suspense>
  );
}
