"use client";

import Link from "next/link";
import { MessageCircle, Sparkles } from "lucide-react";
import { ShareButton } from "@/features/prompts/share-button";
import { FollowButton } from "./follow-button";

/**
 * Own vs. other-profile actions are deliberately different components, not
 * one component branching internally — CLAUDE.md section 6: "kullanıcı
 * kendi profilinde kendini takip edememeli", so the two cases must never
 * accidentally share a follow button.
 */
export function OwnProfileActions({ username }: { username: string }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Link
        href="/profile/edit"
        className="inline-flex h-9 items-center rounded-md border border-border bg-transparent px-4 text-sm font-medium text-text transition-colors hover:bg-accent-surface"
      >
        Profili Düzenle
      </Link>
      <Link
        href="/create"
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
      >
        <Sparkles size={14} />
        Prompt Oluştur
      </Link>
      <ShareButton
        url={`/profile/${username}`}
        title="Promptly profilim"
        label="Paylaş"
        className="h-9 gap-1.5 rounded-md border border-border px-4 text-sm"
      />
    </div>
  );
}

export function OtherProfileActions({
  userId,
  username,
  conversationId,
}: {
  userId: string;
  username: string;
  conversationId?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <FollowButton userId={userId} size="md" />
      {conversationId && (
        <Link
          href={`/messages/${conversationId}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-transparent px-4 text-sm font-medium text-text transition-colors hover:bg-accent-surface"
        >
          <MessageCircle size={14} />
          Mesaj Gönder
        </Link>
      )}
      <ShareButton
        url={`/profile/${username}`}
        title="Promptly profili"
        label="Paylaş"
        className="h-9 gap-1.5 rounded-md border border-border px-4 text-sm"
      />
    </div>
  );
}
