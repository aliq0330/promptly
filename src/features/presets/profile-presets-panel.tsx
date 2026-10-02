"use client";

import { useEffect, useState } from "react";
import { Bookmark, SlidersHorizontal } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { fetchSavedPresets } from "@/lib/supabase/presets";
import { useTranslation } from "@/lib/i18n/language-provider";
import { PresetCard } from "./preset-card";
import type { Preset } from "@/types";

type Scope = "created" | "saved";

function PresetGrid({ presets }: { presets: Preset[] }) {
  return (
    <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 xl:columns-3">
      {presets.map((preset) => (
        <div key={preset.id} className="mb-3 break-inside-avoid sm:mb-4">
          <PresetCard preset={preset} />
        </div>
      ))}
    </div>
  );
}

/**
 * Profil → Hazır Ayarlar. Two clearly separated lists (Hazır Ayar spec §5):
 * "Oluşturduklarım" (presets this person made — a visitor only ever sees the
 * public published ones, RLS) and, on one's OWN profile only, "Kaydettiklerim"
 * (other people's presets in any of one's collections — the same save system
 * as the bookmark / "Listeme Ekle", never shown on someone else's profile).
 */
export function ProfilePresetsPanel({ ownerId, isOwn, created }: { ownerId: string; isOwn: boolean; created: Preset[] }) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<Scope>("created");
  const [saved, setSaved] = useState<Preset[] | null>(null);

  useEffect(() => {
    if (!isOwn || scope !== "saved" || saved !== null) return;
    let cancelled = false;
    fetchSavedPresets(ownerId).then((list) => !cancelled && setSaved(list));
    return () => {
      cancelled = true;
    };
  }, [isOwn, scope, saved, ownerId]);

  return (
    <div className="space-y-4">
      {isOwn && (
        <Tabs
          items={[
            { key: "created" as const, label: t("preset.scopeCreated"), count: created.length },
            { key: "saved" as const, label: t("preset.scopeSaved"), icon: Bookmark },
          ]}
          active={scope}
          onChange={setScope}
          ariaLabel={t("preset.scopeAria")}
          variant="segmented"
        />
      )}
      {scope === "created" || !isOwn ? (
        created.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title={t("preset.noneYetTitle")}
            description={isOwn ? t("preset.noneYetBody") : t("preset.noneYetOtherBody")}
            action={isOwn ? { label: t("preset.create"), href: "/presets/create" } : undefined}
          />
        ) : (
          <PresetGrid presets={created} />
        )
      ) : saved === null ? (
        <p className="py-10 text-center text-small text-text-muted">{t("common.loading")}</p>
      ) : saved.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title={t("preset.noSavedTitle")}
          description={t("preset.noSavedBody")}
          action={{ label: t("preset.discover"), href: "/presets" }}
        />
      ) : (
        <PresetGrid presets={saved} />
      )}
    </div>
  );
}
