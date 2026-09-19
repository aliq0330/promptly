import type { PromptRequestResponse } from "@/types";
import { getUserById } from "./users";
import { getTag } from "./tags";
import { placeholderArt } from "@/lib/placeholder-image";

const user = (id: string) => getUserById(id)!;

function image(seed: string, width: number, height: number, alt: string) {
  return {
    id: `rm-${seed}`,
    url: placeholderArt(`response-${seed}`, width, height),
    width,
    height,
    alt,
  };
}

export const mockRequestResponses: PromptRequestResponse[] = [
  {
    id: "rr1",
    requestId: "r1",
    author: user("u6"),
    title: "Kar çölünde vaha",
    description: "İstenen sahneyi gün batımı ışığıyla yorumladım.",
    promptText:
      "a lush green oasis in the middle of a snow-covered desert, palm trees, warm sunset light, surreal yet photorealistic balance, wide angle shot",
    media: [image("1", 1000, 700, "Kar çölünde vaha")],
    tags: [getTag("manzara"), getTag("surreal")],
    likeCount: 87,
    commentCount: 9,
    isLiked: false,
    createdAt: "2026-09-14T18:00:00.000Z",
  },
  {
    id: "rr2",
    requestId: "r1",
    author: user("u8"),
    title: null,
    description: null,
    promptText:
      "snowy desert dunes with a hidden emerald oasis, palm trees casting long shadows, golden hour, dreamy atmosphere",
    media: [image("2", 1000, 700, "Vaha alternatif yorum")],
    tags: [getTag("manzara")],
    likeCount: 54,
    commentCount: 4,
    isLiked: false,
    createdAt: "2026-09-15T09:00:00.000Z",
  },
  {
    id: "rr3",
    requestId: "r2",
    author: user("u2"),
    title: "Mecha kokpit pilotu",
    description: "90'lar cel-shaded stilinde bir deneme.",
    promptText:
      "anime mecha pilot inside cockpit, cel-shaded style, vibrant HUD screens, dramatic lighting, 1990s anime aesthetic",
    media: [image("3", 900, 1200, "Mecha pilot")],
    tags: [getTag("anime"), getTag("karakter-tasarimi")],
    likeCount: 132,
    commentCount: 15,
    isLiked: false,
    createdAt: "2026-09-14T10:00:00.000Z",
  },
  {
    id: "rr4",
    requestId: "r3",
    author: user("u1"),
    title: "Terk edilmiş metro",
    description: null,
    promptText:
      "abandoned cyberpunk subway station covered in graffiti, only a few flickering neon signs remain, thick atmospheric fog",
    media: [image("4", 1200, 800, "Terk edilmiş metro istasyonu")],
    tags: [getTag("siberpunk")],
    likeCount: 201,
    commentCount: 27,
    isLiked: false,
    createdAt: "2026-09-12T14:00:00.000Z",
  },
  {
    id: "rr5",
    requestId: "r6",
    author: user("u3"),
    title: "Aurora kabini",
    description: "Sıcak-soğuk kontrastını vurguladım.",
    promptText:
      "lonely wooden cabin in a snowy forest under aurora borealis, warm window light contrasting cold night atmosphere",
    media: [image("5", 1200, 800, "Aurora altında kabin")],
    tags: [getTag("manzara")],
    likeCount: 76,
    commentCount: 6,
    isLiked: false,
    createdAt: "2026-09-05T19:00:00.000Z",
  },
];

export function getResponsesForRequest(requestId: string): PromptRequestResponse[] {
  return mockRequestResponses.filter((response) => response.requestId === requestId);
}
