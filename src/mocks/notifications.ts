import type { AppNotification } from "@/types";
import { getUserById } from "./users";

const user = (id: string) => getUserById(id)!;

export const mockNotifications: AppNotification[] = [
  {
    id: "n1",
    type: "like",
    actor: user("u2"),
    message: '"Ay ışığında bekleyen kitsune" gönderini beğendi.',
    targetHref: "/prompts/p1",
    isRead: false,
    createdAt: "2026-09-15T09:10:00.000Z",
  },
  {
    id: "n2",
    type: "follow",
    actor: user("u5"),
    message: "seni takip etmeye başladı.",
    targetHref: "/profile/cem.pixel",
    isRead: false,
    createdAt: "2026-09-15T07:45:00.000Z",
  },
  {
    id: "n3",
    type: "comment",
    actor: user("u3"),
    message: '"Terk edilmiş uzay istasyonu" gönderine yorum yaptı: "Işıklandırma harika olmuş!"',
    targetHref: "/prompts/p2",
    isRead: false,
    createdAt: "2026-09-14T22:30:00.000Z",
  },
  {
    id: "n4",
    type: "remix",
    actor: user("u1"),
    message: '"Ay ışığında bekleyen kitsune" promptunu remixledi.',
    targetHref: "/prompts/p9",
    isRead: true,
    createdAt: "2026-09-14T15:00:00.000Z",
  },
  {
    id: "n5",
    type: "request_response",
    actor: user("u7"),
    message: '"Terk edilmiş siberpunk metro istasyonu" isteğine yanıt verdi.',
    targetHref: "/requests/r3",
    isRead: true,
    createdAt: "2026-09-13T13:20:00.000Z",
  },
  {
    id: "n6",
    type: "message",
    actor: user("u6"),
    message: "sana bir mesaj gönderdi.",
    targetHref: "/messages/c1",
    isRead: true,
    createdAt: "2026-09-12T18:05:00.000Z",
  },
  {
    id: "n7",
    type: "system",
    actor: null,
    message: "Haftalık trend promptlar listesi güncellendi.",
    targetHref: "/discover",
    isRead: true,
    createdAt: "2026-09-11T08:00:00.000Z",
  },
];
