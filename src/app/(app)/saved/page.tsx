"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchSavedPrompts } from "@/lib/supabase/prompts";
import type { Prompt } from "@/types";

export default function SavedPage() {
  const { user, loading } = useAuth();
  const [saved, setSaved] = useState<Prompt[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch while signed out
      setSaved([]);
      return;
    }
    fetchSavedPrompts(user.id).then((prompts) => {
      if (!cancelled) setSaved(prompts);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!loading && !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Giriş yapmalısın</h1>
        <p className="mb-4 text-sm text-text-muted">
          Kaydettiklerini görmek için önce giriş yapmalısın.
        </p>
        <Link
          href="/login"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
        >
          Giriş Yap
        </Link>
      </div>
    );
  }

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
