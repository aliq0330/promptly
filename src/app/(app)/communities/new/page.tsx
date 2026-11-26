import { RequireAuth } from "@/features/auth/require-auth";
import { NewCommunityPage } from "@/features/communities/new-community-page";

export default function NewCommunityRoute() {
  return (
    <RequireAuth>
      <NewCommunityPage />
    </RequireAuth>
  );
}
