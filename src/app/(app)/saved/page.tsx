"use client";

import { useEffect, useState } from "react";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { useSave } from "@/features/prompts/like-save-provider";
import { useLocalPrompts } from "@/features/prompts/local-prompts-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchSavedPrompts } from "@/lib/supabase/prompts";
import { mockPrompts } from "@/mocks/prompts";
import type { Prompt } from "@/types";

export default function SavedPage() {
  const { isSaved } = useSave();
  const { localPrompts } = useLocalPrompts();
  const { user } = useAuth();
  const [realSaved, setRealSaved] = useState<Prompt[]>([]);

  // Real saves (a real prompt saved by a real signed-in user, CLAUDE.md
  // Bölüm 21 Faz 3) live in Supabase, not localStorage — fetched
  // separately since `useSave()` only ever knew about this browser's own
  // toggles for mock/local prompts.
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch while signed out
      setRealSaved([]);
      return;
    }
    fetchSavedPrompts(user.id).then((prompts) => {
      if (!cancelled) setRealSaved(prompts);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const localSaved = [...mockPrompts, ...localPrompts].filter((prompt) => isSaved(prompt.id));
  const saved = [...realSaved, ...localSaved];

  return (
    <div className="px-4 py-6 lg:px-6">
      <h1 className="mb-4 text-base font-semibold text-text">Kaydedilenler</h1>
      {saved.length === 0 ? (
        <p className="py-12 text-center text-sm text-text-muted">
          Henüz hiçbir şey kaydetmedin. Bir prompt kartındaki kaydet ikonuna tıklayarak buraya
          ekleyebilirsin.
        </p>
      ) : (
        <PromptGrid prompts={saved} />
      )}
    </div>
  );
}
