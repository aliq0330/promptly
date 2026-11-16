"use client";

import type { ReactNode } from "react";
import { AlertCircle } from "@/components/icons/alert-circle";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { TeamRole } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Ekip imi/bandı rengi (docs/history/406-*): DB `teams.tone` altı değeri kabul eder (CHECK; değişmedi), ama arayüz YALNIZ üç sakin görünüm sunar —
 * mavi (`primary`), pus (`sky`), nötr (`plum`). Eski kayıtlardaki `secondary` (turuncu = "senin olan"), `success` ve `warning` (durum renkleri)
 * artık ekip rengi olarak çizilmez: en yakın sakin görünüme eşlenir.
 */
export const TEAM_TONES = ["primary", "sky", "plum"] as const;
type TeamLook = (typeof TEAM_TONES)[number];
const TONE_ALIAS: Record<string, TeamLook> = { primary: "primary", sky: "sky", plum: "plum", secondary: "primary", success: "sky", warning: "plum" };
export const resolveTeamTone = (tone: string | null | undefined): TeamLook => TONE_ALIAS[tone ?? "primary"] ?? "primary";

const TONE_CLASS: Record<TeamLook, string> = {
  primary: "bg-primary-soft text-primary",
  sky: "bg-[color-mix(in_srgb,var(--color-primary)_6%,var(--color-surface-soft))] text-text-secondary",
  plum: "bg-surface-soft text-text-secondary",
};

const SOLID_TONE_CLASS: Record<TeamLook, string> = {
  primary: "bg-primary text-primary-foreground",
  sky: "bg-text-secondary text-background",
  plum: "bg-text text-background",
};

export const toneClass = (tone: string | null | undefined) => TONE_CLASS[resolveTeamTone(tone)];

/** Ekibin kare "logosu": renk tonu + adın baş harfleri. Kullanıcı içeriği olan ad çevrilmez. */
export function TeamMark({ name, tone, size = 40, className, solid = false }: { name: string; tone?: string | null; size?: number; className?: string; /** Dolu zemin + beyaz harf (ekip sayfası başlığı, Ekipler kartları — mockup). */ solid?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toLocaleUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-xl font-display font-bold", solid ? SOLID_TONE_CLASS[resolveTeamTone(tone)] : toneClass(tone), className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}

const ROLE_KEY: Record<TeamRole, TranslationKey> = {
  owner: "tm.role.owner",
  admin: "tm.role.admin",
  editor: "tm.role.editor",
  member: "tm.role.member",
  guest: "tm.role.guest",
};

export const roleLabelKey = (role: TeamRole): TranslationKey => ROLE_KEY[role];

export function RoleChip({ role }: { role: TeamRole }) {
  const { t } = useTranslation();
  const variant = role === "owner" ? "default" : role === "admin" ? "secondary" : role === "guest" ? "warning" : "neutral";
  return (
    <Badge variant={variant} size="sm">
      {t(ROLE_KEY[role])}
    </Badge>
  );
}

export { PersonRow } from "@/components/ui/person-row";

/** Bölüm kutusu: başlık + açıklama + içerik; Yönetim sayfalarının ortak iskeleti. */
export function Panel({ title, hint, action, children, className }: { title: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg card-flat p-4 shadow-xs sm:p-5", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-h3">{title}</h3>
          {hint && <p className="mt-0.5 text-small text-text-secondary">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatTile({ label, value, delta }: { label: string; value: ReactNode; delta?: ReactNode }) {
  return (
    <div className="rounded-lg card-flat p-4">
      <p className="text-caption text-text-muted">{label}</p>
      <p className="mt-1 font-display text-h2 font-bold tabular-nums">{value}</p>
      {delta && <p className="mt-0.5 text-caption text-text-secondary">{delta}</p>}
    </div>
  );
}

export function SectionError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return <EmptyState icon={AlertCircle} title={message} compact action={onRetry ? { label: t("common.retry"), onClick: onRetry } : undefined} />;
}


export function formatShortDate(iso: string | null | undefined, language: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

/** "4 gündür bekliyor" (süre cümlesi; `formatRelativeTime` "4 gün önce" verir, "beri" ile birleşmez). */
export function waitingText(t: (key: TranslationKey, params?: Record<string, string | number>) => string, iso: string | null | undefined): string | null {
  if (!iso) return null;
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes >= 24 * 60) return t("tm.lib.waitDays", { count: Math.max(1, Math.floor(minutes / (24 * 60))) });
  if (minutes >= 60) return t("tm.lib.waitHours", { count: Math.floor(minutes / 60) });
  return t("tm.lib.waitMinutes", { count: Math.max(1, minutes) });
}

/** Aç/kapa anahtarı: sitenin tek `Switch`'i (docs/history/406-*); ekip ekranları eski adresten almaya devam eder. */
export { Switch } from "@/components/ui/switch";
