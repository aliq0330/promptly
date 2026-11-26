"use client";

import { useRouter } from "next/navigation";
import { useCreatePageRoute } from "@/features/content/create-page-shell";
import { communityHref } from "@/lib/communities";
import { CreateCommunityModal } from "./create-community-modal";

/** `/communities/new`: telefonda tam ekran Topluluk oluştur sayfası (docs/history/473-*). */
export function NewCommunityPage() {
  const router = useRouter();
  const phone = useCreatePageRoute("/communities");
  if (!phone) return null;
  return <CreateCommunityModal onClose={() => router.back()} onCreated={(id) => router.replace(communityHref(id))} />;
}
