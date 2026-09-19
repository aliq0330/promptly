"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { useRealMessages } from "./real-messages-provider";
import { isUuid, messageHref } from "@/lib/utils";
import type { UserProfile } from "@/types";

const CLASS_NAME =
  "inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-transparent px-4 text-sm font-medium text-text transition-colors hover:bg-accent-surface";

/**
 * A real, other user's "Mesaj Gönder" — finds or starts a real 1:1
 * conversation and navigates to it (CLAUDE.md Bölüm 21 Faz 6). For a mock
 * user, falls back to the original behavior (Bölüm 12): a plain link to an
 * existing mock thread if one exists, otherwise nothing — no new mock
 * conversation can be started, so a dead button is never shown instead.
 */
export function MessageButton({
  user,
  mockConversationId,
}: {
  user: UserProfile;
  mockConversationId?: string;
}) {
  const router = useRouter();
  const { user: authUser } = useAuth();
  const { startConversationWith } = useRealMessages();
  const [isStarting, setIsStarting] = useState(false);
  const isRealTarget = isUuid(user.id);

  if (!isRealTarget) {
    if (!mockConversationId) return null;
    return (
      <Link href={`/messages/${mockConversationId}`} className={CLASS_NAME}>
        <MessageCircle size={14} />
        Mesaj Gönder
      </Link>
    );
  }

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
    try {
      const conversation = await startConversationWith(user);
      router.push(messageHref(conversation));
    } catch (err) {
      console.error("startConversationWith", err);
      setIsStarting(false);
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={isStarting} className={CLASS_NAME}>
      <MessageCircle size={14} />
      {isStarting ? "Açılıyor..." : "Mesaj Gönder"}
    </button>
  );
}
