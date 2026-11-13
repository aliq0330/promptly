import { markConversationReadUpTo } from "@/lib/supabase/chat-features";
import type { Conversation } from "@/types";

/**
 * Kanal listesi toplu işlemlerinin ortak sunucu çağrıları (docs/history/381-*): ekip/proje kanalları sohbet kayıtlarıdır (`conversation_members`),
 * bu yüzden okundu imleci ve sabit sohbet listesindekiyle AYNI yoldan yazılır. Hata fırlatır (sessiz başarı yok).
 */

export type PatchConversation = (conversationId: string, patch: Partial<Conversation>) => void;

/** Kanalı okundu say: imleci son mesaja ilerletir ve yerel sayıyı sıfırlar. Mesajı olmayan kanal zaten okunmuştur. */
export async function markChannelRead(channel: { id: string; lastMessageAt: string | null }, patch: PatchConversation, at?: string | null): Promise<void> {
  const upTo = at ?? channel.lastMessageAt;
  if (!upTo) return;
  const cursor = await markConversationReadUpTo(channel.id, upTo);
  if (!cursor) throw new Error("mark_read_failed");
  patch(channel.id, { unreadCount: 0 });
}

/** Proje anahtarı (`project:<id>`): ekip listesindeki proje satırı birden çok kanalı temsil eder. */
export const PROJECT_KEY_PREFIX = "project:";
export const projectKey = (projectId: string) => `${PROJECT_KEY_PREFIX}${projectId}`;
export const isProjectKey = (key: string) => key.startsWith(PROJECT_KEY_PREFIX);
export const projectIdOfKey = (key: string) => key.slice(PROJECT_KEY_PREFIX.length);
