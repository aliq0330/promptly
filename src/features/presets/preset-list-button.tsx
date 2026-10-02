"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { useSaveState } from "@/features/prompts/use-save-state";
import { addItemToCollection, fetchDefaultCollectionId } from "@/lib/supabase/collections";
import { buttonClassName } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * "Listeme Ekle" ⇄ "✓ Listemde" — the labelled one-tap way to put somebody
 * else's preset into the viewer's own list. It is NOT a second save system:
 * "my list" is the viewer's default ("Genel") collection, i.e. the very same
 * `collection_items` row the bookmark icon writes, so the bookmark, the save
 * count, `Profil → Hazır Ayarlar → Kaydettiklerim` and any collection the
 * preset is also in all stay in sync (Bölüm 9.38's "saved = in ANY of my
 * collections"). Tapping "✓ Listemde" removes it from every collection, the
 * same as tapping the filled bookmark.
 */
export function PresetListButton({ presetId, saveCount }: { presetId: string; saveCount: number }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isSaved, removeEverywhere, markSaved, isToggling, canSave } = useSaveState(presetId, "preset", saveCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canSave) {
    return (
      <Link href="/login" className={buttonClassName({ variant: "outline" })}>
        <Bookmark size={16} aria-hidden />
        {t("preset.addToList")}
      </Link>
    );
  }

  async function handleClick() {
    if (!user || busy || isToggling) return;
    setError(null);
    if (isSaved) {
      await removeEverywhere();
      return;
    }
    setBusy(true);
    try {
      const collectionId = await fetchDefaultCollectionId(user.id);
      if (!collectionId) throw new Error("no default collection");
      await addItemToCollection(collectionId, presetId, "preset");
      markSaved();
    } catch (err) {
      console.error("PresetListButton", err);
      setError(t("preset.addToListFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant={isSaved ? "secondary" : "outline"} onClick={handleClick} disabled={busy || isToggling} aria-pressed={isSaved}>
        {isSaved ? <Check size={16} aria-hidden /> : <Bookmark size={16} aria-hidden />}
        {isSaved ? t("preset.inList") : t("preset.addToList")}
      </Button>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
