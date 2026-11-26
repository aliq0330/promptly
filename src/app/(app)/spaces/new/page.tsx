import { RequireAuth } from "@/features/auth/require-auth";
import { NewSpacePage } from "@/features/spaces/new-space-page";

export default function NewSpaceRoute() {
  return (
    <RequireAuth>
      <NewSpacePage />
    </RequireAuth>
  );
}
