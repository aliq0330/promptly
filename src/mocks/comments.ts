import type { PromptComment } from "@/types";
import { getUserById } from "./users";

const user = (id: string) => getUserById(id)!;

export const mockComments: PromptComment[] = [
  {
    id: "cm1",
    promptId: "p1",
    author: user("u3"),
    body: "Kürk detayları inanılmaz olmuş, hangi ayarları kullandın?",
    parentId: null,
    createdAt: "2026-09-14T09:00:00.000Z",
  },
  {
    id: "cm2",
    promptId: "p1",
    author: user("u1"),
    body: "Teşekkürler! --v 6 ile birkaç kez denedim, ışık ayarını özellikle vurguladım.",
    parentId: "cm1",
    createdAt: "2026-09-14T09:20:00.000Z",
  },
  {
    id: "cm3",
    promptId: "p1",
    author: user("u5"),
    body: "Ghibli esintisi tam oturmuş, kaydettim.",
    parentId: null,
    createdAt: "2026-09-14T12:40:00.000Z",
  },
  {
    id: "cm4",
    promptId: "p2",
    author: user("u3"),
    body: "Işıklandırma harika olmuş!",
    parentId: null,
    createdAt: "2026-09-14T22:30:00.000Z",
  },
  {
    id: "cm5",
    promptId: "p2",
    author: user("u7"),
    body: "Toz parçacıkları sahneye çok iyi bir derinlik katmış.",
    parentId: null,
    createdAt: "2026-09-15T08:10:00.000Z",
  },
  {
    id: "cm6",
    promptId: "p5",
    author: user("u8"),
    body: "Bu paleti çok sevdim, remixlemeden duramayacağım.",
    parentId: null,
    createdAt: "2026-09-12T11:00:00.000Z",
  },
  {
    id: "cm7",
    promptId: "p7",
    author: user("u2"),
    body: "Blade Runner atmosferi tam istediğim gibi, tebrikler.",
    parentId: null,
    createdAt: "2026-09-11T10:00:00.000Z",
  },
];

/**
 * Comments on prompt requests share the same PromptComment shape (see
 * types/index.ts) — kept as a separate mock array from mockComments only
 * for readability, not because the underlying model differs.
 */
export const mockRequestComments: PromptComment[] = [
  {
    id: "rcm1",
    requestId: "r1",
    author: user("u8"),
    body: "Ben de tam bunu arıyordum, gelen yanıtları merakla bekliyorum.",
    parentId: null,
    createdAt: "2026-09-14T13:00:00.000Z",
  },
  {
    id: "rcm2",
    requestId: "r1",
    author: user("u3"),
    body: "Gün batımı yerine mehtaplı bir versiyonu da güzel olurdu bence.",
    parentId: null,
    createdAt: "2026-09-14T14:10:00.000Z",
  },
];

export function getCommentsForPrompt(promptId: string): PromptComment[] {
  return mockComments.filter((comment) => comment.promptId === promptId);
}

export function getCommentsForRequest(requestId: string): PromptComment[] {
  return mockRequestComments.filter((comment) => comment.requestId === requestId);
}
