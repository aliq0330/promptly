"use client";

import { useState } from "react";
import Link from "next/link";
import { EyeOff } from "@/components/icons/eye-off";
import { Lock } from "@/components/icons/lock";
import { cn } from "@/lib/utils";
import { isSelfHidden } from "@/lib/presence";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useMyPresence } from "./presence-provider";
import { PresenceDot } from "./presence-ui";

/** Hesap menüsündeki tetikleyici avatarın noktası: başkalarına çevrimiçi görünüyorsam yeşil, gizliysem yok. */
export function OwnPresenceDot({ avatarSize }: { avatarSize: number }) {
  const { me, available } = useMyPresence();
  return <PresenceDot online={Boolean(available && me && !isSelfHidden(me.mode, me.audience))} avatarSize={avatarSize} />;
}

/**
 * Hesap menüsünden hızlı durum değiştirme (docs/history/329-*): tek dokunuşla Görünmez ↔ Otomatik; kitle ayarı Ayarlar → Gizlilik'te.
 * Sunucu reddederse anahtar eski hâline döner (sağlayıcı geri alır).
 */
export function PresenceMenuToggle({ itemClassName, onNavigate }: { itemClassName: string; onNavigate: () => void }) {
  const { t } = useTranslation();
  const { me, available, update } = useMyPresence();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!available || !me) return null;
  const invisible = me.mode === "invisible";
  const state = invisible ? t("presence.menuStateInvisible") : me.audience === "nobody" ? t("presence.menuStateHidden") : t("presence.menuStateOnline");

  async function toggle() {
    if (busy || !me) return;
    setBusy(true);
    setFailed(false);
    try {
      await update({ mode: invisible ? "auto" : "invisible" });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={invisible}
        disabled={busy}
        onClick={() => void toggle()}
        className={cn(itemClassName, "disabled:opacity-60")}
        data-presence-toggle
      >
        <EyeOff size={17} className="shrink-0 text-text-secondary" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{t("presence.menuAppearOffline")}</span>
          <span className={cn("block truncate text-caption font-normal", failed ? "text-danger" : "text-text-muted")}>
            {failed ? t("presence.saveFailed") : state}
          </span>
        </span>
        <span aria-hidden className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200", invisible ? "bg-primary" : "bg-border-strong")}>
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-xs transition-[left] duration-200",
              invisible ? "left-[1.125rem]" : "left-0.5",
            )}
          />
        </span>
      </button>
      <Link href="/settings/privacy#presence" role="menuitem" onClick={onNavigate} className={itemClassName}>
        <Lock size={16} className="shrink-0 text-text-secondary" />
        <span className="truncate">{t("presence.menuSettings")}</span>
      </Link>
    </>
  );
}
