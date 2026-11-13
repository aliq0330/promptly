"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Check } from "@/components/icons/check";
import { X } from "@/components/icons/x";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchWorksVotesForUsers } from "@/lib/supabase/prompt-works";

/**
 * "Çalıştı mı?" rozeti (docs/history/341-*): bir yorumun ya da sonuç kartının yanında, YAZARIN o anki oyunu gösteren salt okunur yansıma.
 * Rozet yorumun/sonucun içine yazılmaz — tek doğruluk kaynağı oy tablosudur: oy değişirse rozet de değişir, geri alınırsa kaybolur, hiç oy
 * vermemiş kişide hiç çıkmaz. Oylar tek sunucu çağrısıyla (`prompt_works_for_users`) sayfa başına toplu okunur; yorum başına istek yazılmaz.
 *
 * Bu modül oturum boyunca prompt başına `kişi → oy` önbelleğidir. Oy veren kişinin kendi oyu (`publishWorksVote`) anında buraya yazılır,
 * böylece kendi yorumunun/sonucunun rozeti sayfayı yenilemeden güncellenir. Kimlik değişince sayfa baştan yüklendiği için ayrıca temizleme yok.
 */

const EMPTY: ReadonlyMap<string, boolean> = new Map();
/** Prompt başına `kişi → oy`. Değişmez anlık görüntü: her değişiklikte YENİ Map konur (`useSyncExternalStore` kararlı referans ister). */
const votesByPrompt = new Map<string, ReadonlyMap<string, boolean>>();
/** Sunucudan sorulmuş kişiler (cevap "oy yok" olsa bile tekrar sorulmaz). */
const askedByPrompt = new Map<string, Set<string>>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updateVotes(promptId: string, mutate: (draft: Map<string, boolean>) => void) {
  const next = new Map(votesByPrompt.get(promptId) ?? EMPTY);
  mutate(next);
  votesByPrompt.set(promptId, next);
  listeners.forEach((listener) => listener());
}

function askedFor(promptId: string): Set<string> {
  let set = askedByPrompt.get(promptId);
  if (!set) {
    set = new Set();
    askedByPrompt.set(promptId, set);
  }
  return set;
}

/** Oturumdaki kişinin kendi oyunu (verdi/değiştirdi/geri aldı ya da sayfa açılışında okundu): rozetler anında yansıtır. */
export function publishWorksVote(promptId: string, userId: string, vote: boolean | null) {
  askedFor(promptId).add(userId);
  updateVotes(promptId, (draft) => {
    if (vote === null) draft.delete(userId);
    else draft.set(userId, vote);
  });
}

/**
 * Verilen kişilerin bu promptta verdiği oylar. Henüz sorulmamışlar tek çağrıyla istenir; sunucu hata verirse sorulmamış sayılır
 * (kişi listesi değişince yeniden denenir) ve rozet çıkmaz.
 */
export function useWorksVotes(promptId: string | null | undefined, userIds: readonly string[]): ReadonlyMap<string, boolean> {
  const votes = useSyncExternalStore(
    subscribe,
    () => (promptId ? (votesByPrompt.get(promptId) ?? EMPTY) : EMPTY),
    () => EMPTY,
  );
  const key = useMemo(() => [...new Set(userIds)].sort().join(","), [userIds]);

  useEffect(() => {
    if (!promptId || !key) return;
    const asked = askedFor(promptId);
    const missing = key.split(",").filter((id) => !asked.has(id));
    if (missing.length === 0) return;
    for (const id of missing) asked.add(id);
    void fetchWorksVotesForUsers(promptId, missing)
      .then((found) => {
        // Bu arada kendi oyum (`publishWorksVote`) yazıldıysa o güncel kabul edilir, sunucu cevabı onu ezmez.
        updateVotes(promptId, (draft) => {
          for (const [id, works] of found) if (!draft.has(id)) draft.set(id, works);
        });
      })
      .catch((error) => {
        console.error("works votes", error);
        for (const id of missing) asked.delete(id);
      });
  }, [promptId, key]);

  return votes;
}

/**
 * Küçük "✓ Çalıştı" / "✗ Çalışmadı" hapı. `tone="overlay"`: resmin üstünde (sonuç kartı) koyu yarı saydam zemin.
 * Renk tek başına anlam taşımaz: simge ve metin de vardır.
 */
export function WorksBadge({ works, tone = "plain", className }: { works: boolean; tone?: "plain" | "overlay"; className?: string }) {
  const { t } = useTranslation();
  const Icon = works ? Check : X;
  return (
    <span
      data-works-badge={works ? "yes" : "no"}
      title={t("prompt.works.badgeHint")}
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full px-2 text-caption font-semibold",
        tone === "overlay" ? "bg-black/55 text-white" : works ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
        className,
      )}
    >
      <Icon size={12} aria-hidden />
      {works ? t("prompt.works.yes") : t("prompt.works.no")}
    </span>
  );
}
