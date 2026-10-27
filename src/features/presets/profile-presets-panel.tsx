"use client";

import { useState } from "react";
import { Bookmark, SlidersHorizontal } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { fetchPresetsByCreatorPage, fetchSavedPresetsPage } from "@/lib/supabase/presets";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListState } from "@/features/feed/paged-list-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import { PresetCard } from "./preset-card";
import { useViewMode } from "@/features/content/view-mode-store";
import { ViewModeControls } from "@/features/content/view-mode-switcher";
import { FocusGrid } from "@/features/focus/focus-grid";
import type { Preset } from "@/types";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";

type Scope = "created" | "saved";

function PresetGrid({ presets }: { presets: Preset[] }) {
  const [mode] = useViewMode();
  if (mode === "focus") return <FocusGrid items={presets.map((data) => ({ kind: "preset" as const, data }))} />;
  return (
    <ContentGrid>
      {presets.map((preset) => (
        <div key={preset.id} className={CONTENT_GRID_ITEM_CLASS}>
          <PresetCard preset={preset} />
        </div>
      ))}
    </ContentGrid>
  );
}

/**
 * Profil → Hazır Ayarlar. Two clearly separated lists (Hazır Ayar spec §5):
 * "Oluşturduklarım" (presets this person made — a visitor only ever sees the
 * public published ones, RLS) and, on one's OWN profile only, "Kaydettiklerim"
 * (other people's presets in any of one's collections — the same save system
 * as the bookmark / "Listeme Ekle", never shown on someone else's profile).
 */
export function ProfilePresetsPanel({ ownerId, isOwn }: { ownerId: string; isOwn: boolean }) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<Scope>("created");
  // "Oluşturduklarım": a page at a time (docs/history/255-*).
  const createdPages = usePagedList(`presets|${ownerId}`, true, (offset) => fetchPresetsByCreatorPage(ownerId, {}, offset));
  const created = createdPages.items;

  // "Kaydettiklerim": 24'erli sayfa, kendiliğinden devam (eskiden 120'de kesiliyordu).
  const savedPages = usePagedList(`presets-saved|${ownerId}`, isOwn && scope === "saved", (offset) => fetchSavedPresetsPage(ownerId, offset));
  const saved = savedPages.items;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {isOwn && (
            <Tabs
              items={[
                { key: "created" as const, label: t("preset.scopeCreated"), count: createdPages.total ?? created.length },
                { key: "saved" as const, label: t("preset.scopeSaved"), icon: Bookmark },
              ]}
              active={scope}
              onChange={setScope}
              ariaLabel={t("preset.scopeAria")}
              variant="segmented"
            />
          )}
        </div>
        <ViewModeControls />
      </div>
      {scope === "created" || !isOwn ? (
        <PagedListState list={createdPages}>
          {created.length === 0 ? (
            <EmptyState
              icon={SlidersHorizontal}
              title={t("preset.noneYetTitle")}
              description={isOwn ? t("preset.noneYetBody") : t("preset.noneYetOtherBody")}
              action={isOwn ? { label: t("preset.create"), href: "/presets/create" } : undefined}
            />
          ) : (
            <PresetGrid presets={created} />
          )}
        </PagedListState>
      ) : (
        <PagedListState list={savedPages} skeleton={<p className="py-10 text-center text-small text-text-muted">{t("common.loading")}</p>}>
          {saved.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title={t("preset.noSavedTitle")}
              description={t("preset.noSavedBody")}
              action={{ label: t("preset.discover"), href: "/presets" }}
            />
          ) : (
            <PresetGrid presets={saved} />
          )}
        </PagedListState>
      )}
    </div>
  );
}
