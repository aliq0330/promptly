import { Suspense } from "react";
import { RequireAuth } from "@/features/auth/require-auth";
import { CommunitiesPage } from "@/features/communities/communities-page";

export default function CommunitiesRoute() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <CommunitiesPage />
      </Suspense>
    </RequireAuth>
  );
}
