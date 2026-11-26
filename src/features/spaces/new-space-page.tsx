"use client";

import { useRouter } from "next/navigation";
import { useCreatePageRoute } from "@/features/content/create-page-shell";
import { SPACE_KINDS, type SpaceKind } from "@/lib/spaces";
import { CreateSpaceModal } from "./space-modals";

/** `/spaces/new`: telefonda tam ekran Space oluştur sayfası (docs/history/473-*); `?kind=` başlangıç türünü seçer. */
export function NewSpacePage() {
  const router = useRouter();
  const phone = useCreatePageRoute("/spaces");
  if (!phone) return null;
  const kind = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("kind");
  const initialKind = SPACE_KINDS.includes(kind as SpaceKind) ? (kind as SpaceKind) : undefined;
  return <CreateSpaceModal initialKind={initialKind} onClose={() => router.back()} />;
}
