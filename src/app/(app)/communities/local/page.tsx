import { Suspense } from "react";
import { RequireAuth } from "@/features/auth/require-auth";
import { CommunityPage } from "@/features/communities/community-page";

export default function CommunityDetailRoute() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <CommunityPage />
      </Suspense>
    </RequireAuth>
  );
}
