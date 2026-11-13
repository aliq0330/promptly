"use client";

import { Bell } from "@/components/icons/bell";
import { BellOff } from "@/components/icons/bell-off";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { Switch } from "./team-ui";

/**
 * Ekip / proje sessize alma kartı (docs/history/369-*): ekip ve proje sayfalarında AYNI görünüm. Sessizlik ekip → proje → kanal birleşimidir; bu kart
 * yalnız KENDİ düzeyini değiştirir ve neyi kapattığını açıkça yazar. Proje kartı, ekip de sessizse bunu ayrıca söyler (proje ayarı saklanır ama etkisizdir).
 */
export function MuteCard({
  scope,
  muted,
  teamMuted = false,
  busy,
  error,
  onToggle,
  compact = false,
}: {
  scope: "team" | "project" | "community";
  muted: boolean;
  /** Proje kartı için: ekibin tamamı sessiz mi (proje ayrıca sessiz değilse bile bildirim gelmez). */
  teamMuted?: boolean;
  busy: boolean;
  error: string | null;
  onToggle: (muted: boolean) => void;
  /** Kanal listesi sütununda tek satır (docs/history/381-*): yalnız başlık ve anahtar; açıklama cümlesi kalkar, uyarılar (proje için "ekip de sessiz", hata) altında kalır. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const prefix = scope === "team" ? "th.mute.team" : scope === "community" ? "th.mute.community" : "th.mute.project";
  const effective = muted || (scope === "project" && teamMuted);
  if (compact) {
    return (
      <div data-mute-card={scope} data-muted={muted ? "true" : "false"} data-mute-compact="" className={cn("rounded-full border px-3.5 py-1.5", effective ? "border-warning/40 bg-warning/5" : "border-border-soft bg-surface")}>
        <div className="flex items-center gap-2.5">
          <span aria-hidden className={cn("shrink-0", effective ? "text-warning" : "text-text-secondary")}>
            {effective ? <BellOff size={16} /> : <Bell size={16} />}
          </span>
          <p className="min-w-0 flex-1 truncate text-small font-semibold text-text">{t(`${prefix}.title` as "th.mute.team.title")}</p>
          <span className={cn(busy && "pointer-events-none opacity-60")}>
            <Switch checked={muted} onChange={onToggle} label={t(`${prefix}.title` as "th.mute.team.title")} />
          </span>
        </div>
        {scope === "project" && teamMuted && <p className="pb-1 pt-0.5 text-caption font-medium text-warning">{t("th.mute.project.teamMuted")}</p>}
        {error && (
          <p role="alert" className="pb-1 pt-0.5 text-caption text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }
  return (
    <div data-mute-card={scope} data-muted={muted ? "true" : "false"} className={cn("rounded-lg border px-4 py-3", effective ? "border-warning/40 bg-warning/5" : "border-border-soft bg-surface")}>
      <div className="flex items-center gap-3">
        <span aria-hidden className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", effective ? "bg-warning/15 text-warning" : "bg-surface-soft text-text-secondary")}>
          {effective ? <BellOff size={18} /> : <Bell size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold text-text">{t(`${prefix}.title` as "th.mute.team.title")}</p>
          <p className="text-caption text-text-secondary">{t(`${prefix}.${muted ? "on" : "off"}` as "th.mute.team.on")}</p>
        </div>
        <span className={cn(busy && "pointer-events-none opacity-60")}>
          <Switch checked={muted} onChange={onToggle} label={t(`${prefix}.title` as "th.mute.team.title")} />
        </span>
      </div>
      {scope === "project" && teamMuted && <p className="mt-2 text-caption font-medium text-warning">{t("th.mute.project.teamMuted")}</p>}
      {error && (
        <p role="alert" className="mt-2 text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Satırlarda sessizliğin KAYNAĞINI söyleyen küçük etiket ("Sessiz", "Sessiz · proje", "Sessiz · ekip"). */
export function MuteChip({ scope }: { scope: "team" | "project" | "channel" | null | undefined }) {
  const { t } = useTranslation();
  if (!scope) return null;
  return (
    <span data-mute-chip={scope} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-soft px-2 py-0.5 text-micro font-bold uppercase tracking-[0.04em] text-text-muted">
      <BellOff size={10} aria-hidden />
      {t(`th.chip.${scope}` as "th.chip.team")}
    </span>
  );
}
