import { Suspense } from "react";
import { SpacesHome } from "@/features/spaces/spaces-home";

export default function SpacesRoute() {
  return (
    <Suspense fallback={null}>
      <SpacesHome />
    </Suspense>
  );
}
