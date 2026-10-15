import { Suspense } from "react";
import { RequireAuth } from "@/features/auth/require-auth";
import { GroupsPage } from "@/features/groups/groups-page";

export default function GroupsRoute() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <GroupsPage />
      </Suspense>
    </RequireAuth>
  );
}
