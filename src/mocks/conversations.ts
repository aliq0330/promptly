import type { Conversation, Message } from "@/types";
import { getUserById } from "./users";

const user = (id: string) => getUserById(id)!;

export const mockConversations: Conversation[] = [
  {
    id: "c1",
    participants: [user("u1")],
    lastMessage: "Bu prompt'u nasıl remixledin çok merak ettim, ayarları paylaşır mısın?",
    lastMessageAt: "2026-09-15T10:30:00.000Z",
    unreadCount: 2,
  },
  {
    id: "c2",
    participants: [user("u7")],
    lastMessage: "Siberpunk seri için işbirliği yapmak ister misin?",
    lastMessageAt: "2026-09-14T19:15:00.000Z",
    unreadCount: 0,
  },
  {
    id: "c3",
    participants: [user("u3")],
    lastMessage: "Portre isteğine verdiğin yanıt harikaydı, teşekkürler!",
    lastMessageAt: "2026-09-13T14:00:00.000Z",
    unreadCount: 0,
  },
  {
    id: "c4",
    participants: [user("u5")],
    lastMessage: "Yeni anime karakter serisini ne zaman paylaşacaksın?",
    lastMessageAt: "2026-09-12T09:40:00.000Z",
    unreadCount: 1,
  },
  {
    id: "c5",
    participants: [user("u4")],
    lastMessage: "Mimari render için hangi modeli kullandığını sorabilir miyim?",
    lastMessageAt: "2026-09-10T16:20:00.000Z",
    unreadCount: 0,
  },
];

export const mockMessages: Record<string, Message[]> = {
  c1: [
    {
      id: "msg-1",
      conversationId: "c1",
      senderId: "u1",
      body: "Selam! Kitsune promptunu çok beğendim.",
      createdAt: "2026-09-15T10:20:00.000Z",
    },
    {
      id: "msg-2",
      conversationId: "c1",
      senderId: "u1",
      body: "Bu prompt'u nasıl remixledin çok merak ettim, ayarları paylaşır mısın?",
      createdAt: "2026-09-15T10:30:00.000Z",
    },
  ],
};

export function getConversationById(id: string): Conversation | undefined {
  return mockConversations.find((conversation) => conversation.id === id);
}

/**
 * Used by the profile page to decide whether "Mesaj Gönder" can link
 * anywhere real — only 5 of the 9 mock users have an existing thread with
 * "me". For the rest, no conversation exists yet and there's no way to
 * start a new one (only viewing existing mock threads is implemented), so
 * the button is omitted entirely rather than linking to nothing.
 */
export function getConversationWithUser(userId: string): Conversation | undefined {
  return mockConversations.find((conversation) =>
    conversation.participants.some((participant) => participant.id === userId),
  );
}
