"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchChatGroupMembers, fetchProfilesByIds } from "@/lib/supabase/chat-groups";
import type { MessageSender } from "@/features/messages/message-bubble-types";
import type { GroupRole, Message, UserProfile } from "@/types";

/**
 * Grup sohbetinde "bu mesajı kim yazdı": gönderenlerin profili (ad + avatar) ve kadro rolleri.
 * Profiller yalnızca ekranda GÖRÜLEN gönderenler için, tek toplu sorguyla çekilir. Roller üye listesinin ilk
 * sayfasından gelir (sunucu rol sırasıyla döner → owner/admin/moderator hep ilk sayfadadır); listede olmayan
 * gönderen "normal üye" (ya da artık üye değil) sayılır — sunucudaki mesaj silme kuralıyla aynı varsayım.
 */
export function useGroupSenders(groupId: string | null, messages: readonly Message[], rolesKey: string, extraUserIds: readonly string[] = []) {
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [roles, setRoles] = useState<Record<string, GroupRole>>({});
  const [failed, setFailed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    fetchChatGroupMembers(groupId, { search: "", offset: 0 })
      .then((page) => {
        if (cancelled) return;
        setRoles(Object.fromEntries(page.members.map((m) => [m.userId, m.role])));
        setProfiles((prev) => ({
          ...prev,
          ...Object.fromEntries(
            page.members.map((m) => [
              m.userId,
              {
                id: m.userId,
                username: m.username,
                displayName: m.displayName,
                avatarUrl: m.avatarUrl,
                coverUrl: null,
                bio: null,
                website: null,
                followerCount: 0,
                followingCount: 0,
                createdAt: m.joinedAt,
              } satisfies UserProfile,
            ]),
          ),
        }));
      })
      .catch((err) => console.error("useGroupSenders roles", err));
    return () => {
      cancelled = true;
    };
  }, [groupId, rolesKey]);

  const missing = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) if (!profiles[message.senderId] && !failed.has(message.senderId)) ids.add(message.senderId);
    // Mesajı olmayan ama "yazıyor" diyen üyelerin adları da gerekir.
    for (const id of extraUserIds) if (!profiles[id] && !failed.has(id)) ids.add(id);
    return [...ids].sort().join(",");
  }, [messages, extraUserIds, profiles, failed]);

  useEffect(() => {
    if (!groupId || !missing) return;
    const ids = missing.split(",");
    let cancelled = false;
    fetchProfilesByIds(ids).then((found) => {
      if (cancelled) return;
      setProfiles((prev) => ({ ...prev, ...Object.fromEntries(found.map((p) => [p.id, p])) }));
      // Bulunamayanları (silinmiş hesap) tekrar tekrar sorma.
      const foundIds = new Set(found.map((p) => p.id));
      const lost = ids.filter((id) => !foundIds.has(id));
      if (lost.length > 0) setFailed((prev) => new Set([...prev, ...lost]));
    });
    return () => {
      cancelled = true;
    };
  }, [groupId, missing]);

  const senderFor = useCallback(
    (userId: string): MessageSender | null => {
      const profile = profiles[userId];
      if (!profile) return null;
      return { displayName: profile.displayName, username: profile.username, avatarUrl: profile.avatarUrl, role: roles[userId] ?? null };
    },
    [profiles, roles],
  );
  const roleFor = useCallback((userId: string): GroupRole | null => roles[userId] ?? null, [roles]);

  return { senderFor, roleFor };
}
