"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { lookupTranslation } from "@/lib/i18n/dictionary";
import type { TeamAuditEntry } from "@/lib/supabase/teams";
import { teamLink, type TeamRole } from "@/lib/teams";
import { TeamAdminPhone } from "./admin-sx";
import type { TeamCtx } from "./team-page";
import { roleLabelKey } from "./team-ui";

/**
 * Yönetim sekmesi (docs/history/482-*): her boyutta AYNI yapı — kök bir bölüm LİSTESİdir (`TeamAdminPhone` → `ManageList`), satır
 * `?section=` alt sayfasını açar (Profil · Politikalar · Davetler · Gruplar · Konuklar · Denetim günlüğü · Dışa aktar · Sahiplik ve silme).
 * Telefonda tam ekran sayfa, tablet/masaüstünde aynı gövde okuma sütunu (alt formlar pencere). Bölümler yeteneğe göre görünür; gizlemek
 * yalnız görünümdür, her işlem sunucuda yeniden denetlenir.
 */
export function TeamAdminSection({ ctx }: { ctx: TeamCtx }) {
  const { can, team } = ctx;
  const router = useRouter();
  const params = useSearchParams();
  const rawParam = params.get("section");
  const need: Record<string, boolean> = {
    profile: can("manage_team"),
    policies: can("manage_team"),
    invites: can("manage_members"),
    groups: can("manage_groups"),
    guests: can("manage_members"),
    audit: can("view_audit"),
    export: can("export"),
    danger: team.myRole === "owner",
  };
  const goTo = (section: string | null, sub?: string | null, key?: string | null) => router.replace(teamLink(team.id, "admin", { section, sub, key }));
  const open = rawParam !== null && rawParam in need && need[rawParam];
  return (
    <section data-testid="team-admin">
      <TeamAdminPhone ctx={ctx} route={open ? { section: rawParam, sub: params.get("sub"), key: params.get("key") } : { section: null, sub: null, key: null }} go={goTo} />
    </section>
  );
}

/** Eylem cümlesi: bilinen eylem çevrilir, bilinmeyen eylem ham anahtar yerine okunur bir metne düşer (yeni SQL eylemi çeviri beklemeden bozuk görünmez). */
export function auditSentence(t: ReturnType<typeof useTranslation>["t"], entry: TeamAuditEntry): string {
  const key = `tm.audit.action.${entry.action}` as TranslationKey;
  let text = auditKeyKnown(key) ? t(key) : entry.action.replace(/_/g, " ");
  const details = entry.details ?? {};
  if (entry.action === "role_changed" && typeof details.from === "string" && typeof details.to === "string") {
    const label = (role: string) => (["owner", "admin", "editor", "member", "guest"].includes(role) ? t(roleLabelKey(role as TeamRole)) : role);
    text += ` ${label(details.from)} → ${label(details.to)}`;
  }
  return entry.targetLabel ? `${text} · ${entry.targetLabel}` : text;
}

const auditKeyKnown = (key: string) => lookupTranslation(key, "tr") !== undefined;

export function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

