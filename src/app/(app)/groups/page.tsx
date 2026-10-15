import { Suspense } from "react";
import { LegacyGroupsRedirect } from "@/features/communities/legacy-groups-redirect";

/** Bağımsız grup kavramı kalktı: `/groups` artık Topluluklar'dır. Eski adres ve bildirim bağlantıları (`?tab=invites`) yönlenir. */
export default function GroupsRoute() {
  return (
    <Suspense fallback={null}>
      <LegacyGroupsRedirect />
    </Suspense>
  );
}
