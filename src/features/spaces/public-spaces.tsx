"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ImageIcon, SquareTerminal } from "lucide-react";
import { AsideSection } from "@/features/content/detail-parts";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { formatCount } from "@/lib/utils";
import { fetchLeadPalettes, listPublicSpaces, summaryArt, type SpaceSummary } from "@/lib/supabase/spaces";
import { spaceHref } from "@/lib/spaces";
import { SpaceCard } from "./space-card";
import { PaletteStrip, SpaceCoverArt } from "./space-visuals";

/*
 * Spaces vitrini (docs/history/214-*): bir kişinin herkese açık Space'leri (profil "Spaces" sekmesi) ve bir prompt'u içeren herkese
 * açık Space'ler (prompt detayının "Hakkında" sütunu). Karar sunucuda (`list_public_spaces`, INVOKER — RLS + engel); özel, bağlantılı
 * ve arşivli Space ÜYESİ olunsa bile burada görünmez.
 */

export interface PublicSpaces {
  spaces: SpaceSummary[];
  palettes: Map<string, string[]>;
}

/** `null` = yükleniyor. Hata sessizce boş liste olur: vitrin bir ek bilgi, sayfanın geri kalanını bozmaz. */
export function usePublicSpaces(by: { ownerId: string } | { promptId: string }, limit = 24): PublicSpaces | null {
  const ownerId = "ownerId" in by ? by.ownerId : undefined;
  const promptId = "promptId" in by ? by.promptId : undefined;
  const [state, setState] = useState<{ key: string; value: PublicSpaces } | null>(null);
  const key = `${ownerId ?? ""}:${promptId ?? ""}:${limit}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      let spaces: SpaceSummary[] = [];
      let palettes = new Map<string, string[]>();
      try {
        spaces = await listPublicSpaces({ ownerId, promptId, limit });
        palettes = await fetchLeadPalettes(spaces.map((space) => space.id)).catch(() => new Map<string, string[]>());
      } catch {
        spaces = [];
      }
      if (alive) setState({ key, value: { spaces, palettes } });
    })();
    return () => {
      alive = false;
    };
  }, [key, ownerId, promptId, limit]);

  return state?.key === key ? state.value : null;
}

/** Profilin "Spaces" sekmesi: Albüm kartları, Spaces ana sayfasıyla aynı ızgara. */
export function ProfileSpacesPanel({ data, onChange }: { data: PublicSpaces; onChange: (next: PublicSpaces) => void }) {
  const { user } = useAuth();
  return (
    <ul data-testid="profile-spaces" className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
      {data.spaces.map((space) => (
        <SpaceCard
          key={space.id}
          space={space}
          layout="grid"
          userId={user?.id ?? null}
          palette={data.palettes.get(space.id)}
          onChange={(next) => onChange({ ...data, spaces: data.spaces.map((item) => (item.id === next.id ? next : item)) })}
          onRemove={(id) => onChange({ ...data, spaces: data.spaces.filter((item) => item.id !== id) })}
        />
      ))}
    </ul>
  );
}

/** Prompt detayının "Hakkında" sütunu: bu prompt'u içeren herkese açık Space'ler. Hiç yoksa hiçbir şey çizilmez. */
export function PromptSpacesAside({ promptId }: { promptId: string }) {
  const { t } = useTranslation();
  const data = usePublicSpaces({ promptId }, 6);
  if (!data || data.spaces.length === 0) return null;
  return (
    <AsideSection id="detail-in-spaces-title" title={t("spaces.discover.inSpaces")}>
        <ul data-testid="prompt-in-spaces" className="divide-y divide-border-soft">
          {data.spaces.map((space) => {
            const palette = data.palettes.get(space.id);
            return (
              <li key={space.id}>
                <Link href={spaceHref(space.id)} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-soft focus-visible:bg-surface-soft focus-visible:outline-none">
                  <SpaceCoverArt urls={summaryArt(space)} className="h-12 w-12 shrink-0 overflow-hidden rounded-md" iconSize={20} />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate text-small font-semibold text-text">{space.title}</span>
                    <span className="flex min-w-0 items-center gap-2 text-caption text-text-muted">
                      {space.owner && <span className="truncate">{space.owner.displayName}</span>}
                      <span className="inline-flex shrink-0 items-center gap-0.5" title={t("spaces.count.images", { count: space.imageCount })}>
                        <ImageIcon size={12} aria-hidden />
                        <span className="sr-only">{t("spaces.count.images", { count: space.imageCount })}</span>
                        <span aria-hidden>{formatCount(space.imageCount)}</span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-0.5" title={t("spaces.count.prompts", { count: space.promptCount })}>
                        <SquareTerminal size={12} aria-hidden />
                        <span className="sr-only">{t("spaces.count.prompts", { count: space.promptCount })}</span>
                        <span aria-hidden>{formatCount(space.promptCount)}</span>
                      </span>
                    </span>
                    {palette && <PaletteStrip colors={palette} max={6} className="h-1 max-w-[8rem]" />}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
    </AsideSection>
  );
}
