import { Suspense } from "react";
import { CommunityPostPage } from "@/features/communities/post-page";

export default function CommunityPostRoute() {
  return (
    <Suspense fallback={null}>
      <CommunityPostPage />
    </Suspense>
  );
}
