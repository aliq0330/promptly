"use client";

import type { ReactNode } from "react";
import { AlertCircle } from "@/components/icons/alert-circle";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollRow } from "@/components/ui/scroll-row";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { TeamRole } from "@/lib/teams";
import { cn } from "@/lib/utils";

export const TEAM_TONES = ["primary", "secondary", "success", "warning", "plum", "sky"] as const;

const TONE_CLASS: Record<string, string> = {
  primary: "bg-primary-soft text-primary",
  secondary: "bg-secondary/10 text-secondary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  plum: "bg-surface-soft text-text-secondary",
  sky: "bg-primary-soft text-primary",
};

const SOLID_TONE_CLASS: Record<string, string> = {
  primary: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-white",
  success: "bg-success text-white",
  warning: "bg-warning text-white",
  plum: "bg-text-secondary text-white",
  sky: "bg-primary text-primary-foreground",
};

export const toneClass = (tone: string | null | undefined) => TONE_CLASS[tone ?? "primary"] ?? TONE_CLASS.primary;

/** Ekibin kare "logosu": renk tonu + adın baş harfleri. Kullanıcı içeriği olan ad çevrilmez. */
export function TeamMark({ name, tone, size = 40, className, solid = false }: { name: string; tone?: string | null; size?: number; className?: string; /** Dolu zemin + beyaz harf (ekip sayfası başlığı, Ekipler kartları — mockup). */ solid?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toLocaleUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-xl font-display font-bold", solid ? (SOLID_TONE_CLASS[tone ?? "primary"] ?? SOLID_TONE_CLASS.primary) : toneClass(tone), className)}
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
  const tone = role === "owner" ? "bg-primary-soft text-primary" : role === "admin" ? "bg-secondary/10 text-secondary" : role === "guest" ? "bg-warning/10 text-warning" : "bg-surface-soft text-text-secondary";
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium", tone)}>{t(ROLE_KEY[role])}</span>;
}

export function PersonRow({
  name,
  username,
  avatarUrl,
  sub,
  right,
  className,
}: {
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  sub?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 py-2.5", className)}>
      <Avatar src={avatarUrl} alt={name} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-medium text-text">{name}</p>
        {(sub || username) && <p className="truncate text-caption text-text-muted">{sub ?? `@${username}`}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/** Bölüm kutusu: başlık + açıklama + içerik; Yönetim sayfalarının ortak iskeleti. */
export function Panel({ title, hint, action, children, className }: { title: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-border-soft bg-surface p-4 shadow-xs sm:p-5", className)}>
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
    <div className="rounded-lg border border-border-soft bg-surface p-4">
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

/** Seçenek hapları (rol, süre, mod): radyo grubu gibi çalışır. */
export function PillChoice<K extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: K;
  options: { key: K; label: string; hint?: string }[];
  onChange: (key: K) => void;
  ariaLabel: string;
}) {
  return (
    <ScrollRow role="radiogroup" aria-label={ariaLabel} className="gap-2 md:flex-wrap">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="radio"
          aria-checked={value === option.key}
          title={option.hint}
          onClick={() => onChange(option.key)}
          className={cn(
            "min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-small transition-colors",
            value === option.key ? "border-primary bg-primary-soft font-medium text-primary" : "border-border-soft bg-surface text-text-secondary hover:bg-surface-soft",
          )}
        >
          {option.label}
        </button>
      ))}
    </ScrollRow>
  );
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
