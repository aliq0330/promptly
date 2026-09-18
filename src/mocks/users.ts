import type { UserProfile } from "@/types";

/**
 * Placeholder creator profiles used across the app until Supabase Auth and
 * the profiles table exist (see CLAUDE.md sections 6 and 8). Never treat
 * these as real accounts — no auth, follow, or messaging action against
 * them should be presented as persisted.
 */
export const mockUsers: UserProfile[] = [
  {
    id: "u1",
    username: "elif.yaz",
    displayName: "Elif Yaz",
    avatarUrl: null,
    coverUrl: null,
    bio: "Dijital illüstrasyon ve karakter tasarımı üzerine çalışıyorum. Midjourney ile masal evreni kuruyorum.",
    website: "elifyaz.art",
    followerCount: 4821,
    followingCount: 132,
    createdAt: "2024-02-14T10:00:00.000Z",
  },
  {
    id: "u2",
    username: "mert.kaan",
    displayName: "Mert Kaan",
    avatarUrl: null,
    coverUrl: null,
    bio: "3D render ve sci-fi konsept sanatçısı. Stable Diffusion + Blender kombinasyonu.",
    website: null,
    followerCount: 2790,
    followingCount: 84,
    createdAt: "2024-03-02T09:30:00.000Z",
  },
  {
    id: "u3",
    username: "asli.nova",
    displayName: "Aslı Nova",
    avatarUrl: null,
    coverUrl: null,
    bio: "Fantastik portreler, mit ve efsane karakterleri. DALL-E 3 kullanıyorum.",
    website: "aslinova.com",
    followerCount: 9143,
    followingCount: 211,
    createdAt: "2023-11-20T14:15:00.000Z",
  },
  {
    id: "u4",
    username: "deniz.ates",
    displayName: "Deniz Ateş",
    avatarUrl: null,
    coverUrl: null,
    bio: "Mimari ve minimalist iç mekan görselleştirmeleri.",
    website: null,
    followerCount: 1567,
    followingCount: 58,
    createdAt: "2024-05-11T08:00:00.000Z",
  },
  {
    id: "u5",
    username: "cem.pixel",
    displayName: "Cem Pixel",
    avatarUrl: null,
    coverUrl: null,
    bio: "Anime tarzı karakter tasarımı ve stüdyo kalitesinde arka planlar.",
    website: "cempixel.art",
    followerCount: 6320,
    followingCount: 97,
    createdAt: "2024-01-08T12:45:00.000Z",
  },
  {
    id: "u6",
    username: "zeynep.ergin",
    displayName: "Zeynep Ergin",
    avatarUrl: null,
    coverUrl: null,
    bio: "Doğa, manzara ve atmosferik ışık çalışmaları.",
    website: null,
    followerCount: 3402,
    followingCount: 145,
    createdAt: "2024-04-19T16:20:00.000Z",
  },
  {
    id: "u7",
    username: "baran.kilic",
    displayName: "Baran Kılıç",
    avatarUrl: null,
    coverUrl: null,
    bio: "Siberpunk şehirler, neon ışıklar ve distopik atmosferler.",
    website: "baran.studio",
    followerCount: 5218,
    followingCount: 76,
    createdAt: "2023-12-30T11:10:00.000Z",
  },
  {
    id: "u8",
    username: "lale.su",
    displayName: "Lale Su",
    avatarUrl: null,
    coverUrl: null,
    bio: "Soyut ve sürreal kompozisyonlar. Renk ve doku deneyleri.",
    website: null,
    followerCount: 2103,
    followingCount: 63,
    createdAt: "2024-06-02T13:00:00.000Z",
  },
  {
    id: "me",
    username: "me",
    displayName: "Sen",
    avatarUrl: null,
    coverUrl: null,
    bio: "Promptly'de yeni bir yaratıcı. Galerine ilk promptlarını ekle.",
    website: null,
    followerCount: 18,
    followingCount: 4,
    createdAt: "2026-08-20T09:00:00.000Z",
  },
];

export function getUserById(id: string): UserProfile | undefined {
  return mockUsers.find((user) => user.id === id);
}

export function getUserByUsername(username: string): UserProfile | undefined {
  return mockUsers.find((user) => user.username === username);
}
