import { Suspense } from "react";
import { CommunityPage } from "@/features/communities/community-page";

/** Ekip sayfası (docs/history/351-*): topluluk sayfasının AYNI bileşeni, ekip rotasında; topluluk olan bir kimlik `/communities/local`a yönlenir. */
export default function TeamDetailRoute() {
  return (
    <Suspense fallback={null}>
      <CommunityPage expect="team" />
    </Suspense>
  );
}
