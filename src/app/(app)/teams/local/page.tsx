import { Suspense } from "react";
import { TeamPage } from "@/features/teams/team-page";

export default function TeamDetailRoute() {
  return (
    <Suspense fallback={null}>
      <TeamPage />
    </Suspense>
  );
}
