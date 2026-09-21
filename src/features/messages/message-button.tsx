"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { useRealMessages } from "./real-messages-provider";
import { messageHref } from "@/lib/utils";
import type { UserProfile } from "@/types";

const CLASS_NAME =
  "inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-transparent px-4 text-sm font-medium text-text transition-colors hover:bg-accent-surface";

/** "Mesaj Gönder" — finds or starts a real 1:1 conversation and navigates to it (CLAUDE.md Bölüm 21 Faz 6). */
export function MessageButton({ user }: { user: UserProfile }) {
  const router = useRouter();
  const { user: authUser } = useAuth();
  const { startConversationWith } = useRealMessages();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authUser) {
    return (
      <Link href="/login" title="Mesaj göndermek için giriş yapmalısın" className={CLASS_NAME}>
        <MessageCircle size={14} />
        Mesaj Gönder
      </Link>
    );
  }

  async function handleClick() {
    setIsStarting(true);
    setError(null);
    try {
      const conversation = await startConversationWith(user);
      router.push(messageHref(conversation));
    } catch (err) {
      console.error("startConversationWith", err);
      setError(err instanceof Error ? err.message : "Konuşma başlatılamadı, lütfen tekrar dene.");
      setIsStarting(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" onClick={handleClick} disabled={isStarting} className={CLASS_NAME}>
        <MessageCircle size={14} />
        {isStarting ? "Açılıyor..." : "Mesaj Gönder"}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
