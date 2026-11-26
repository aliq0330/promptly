"use client";

import { useRouter } from "next/navigation";
import { useCreatePageRoute } from "@/features/content/create-page-shell";
import { teamLink } from "@/lib/teams";
import { CreateTeamModal } from "./teams-page";

/** `/teams/new`: telefonda tam ekran Ekip oluştur sayfası (docs/history/473-*). */
export function NewTeamPage() {
  const router = useRouter();
  const phone = useCreatePageRoute("/teams");
  if (!phone) return null;
  return <CreateTeamModal onClose={() => router.back()} onCreated={(id) => router.replace(teamLink(id))} />;
}
