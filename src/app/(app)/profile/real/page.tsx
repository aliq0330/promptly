import { Suspense } from "react";
import { RealProfileView } from "@/features/profile/real-profile-view";

export default function RealProfilePage() {
  return (
    <Suspense fallback={null}>
      <RealProfileView />
    </Suspense>
  );
}
