"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchAnnouncedIn, type AnnouncedKey, type CommunityPostType } from "@/lib/supabase/communities";

const AnnouncedContext = createContext<Map<AnnouncedKey, string[]> | null>(null);

/**
 * Bir gönderi listesinin "duyuruldu" verisi (docs/history/215-*): görünen içeriklerin başvuru gönderileri tek istekte okunur, kartlar
 * `AnnouncedChip` ile kendi satırını çizer. Liste büyüdükçe yalnız yeni kimlikler sorulur; hata sessizce çipsiz bırakır.
 */
export function AnnouncedProvider({ entries, children }: { entries: { kind: CommunityPostType; id: string }[]; children: React.ReactNode }) {
  const [map, setMap] = useState<Map<AnnouncedKey, string[]>>(() => new Map());
  const asked = useRef(new Set<string>());
  const signature = entries.map((entry) => `${entry.kind}:${entry.id}`).join(",");

  useEffect(() => {
    const fresh = signature
      .split(",")
      .filter((key) => key && !asked.current.has(key))
      .map((key) => {
        const [kind, id] = key.split(":");
        return { kind: kind as CommunityPostType, id };
      });
    if (fresh.length === 0) return;
    fresh.forEach((entry) => asked.current.add(`${entry.kind}:${entry.id}`));
    let alive = true;
    fetchAnnouncedIn(fresh)
      .then((next) => {
        if (!alive || next.size === 0) return;
        setMap((previous) => new Map([...previous, ...next]));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [signature]);

  return <AnnouncedContext.Provider value={map}>{children}</AnnouncedContext.Provider>;
}

/** Kartın rozet satırında: "Kedi Sevenler'de duyuruldu" ya da "3 toplulukta duyuruldu". Liste bağlamı yoksa hiçbir şey çizmez. */
export function AnnouncedChip({ kind, id }: { kind: CommunityPostType; id: string }) {
  const { t } = useTranslation();
  const names = useContext(AnnouncedContext)?.get(`${kind}:${id}`);
  if (!names || names.length === 0) return null;
  const label = names.length === 1 ? t("announced.in", { name: names[0] }) : t("announced.inMany", { count: names.length });
  return (
    <span data-announced-chip="" title={names.join(", ")} className="inline-flex max-w-[14rem] items-center gap-1 truncate rounded-full bg-primary-soft px-2 py-0.5 text-caption font-medium text-primary">
      <Megaphone size={11} aria-hidden className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}
