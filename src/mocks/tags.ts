import type { Tag } from "@/types";

export const mockTags: Tag[] = [
  { slug: "ai-sanat", label: "AI Sanat" },
  { slug: "portre", label: "Portre" },
  { slug: "fantastik", label: "Fantastik" },
  { slug: "siberpunk", label: "Siberpunk" },
  { slug: "anime", label: "Anime" },
  { slug: "mimari", label: "Mimari" },
  { slug: "manzara", label: "Manzara" },
  { slug: "karakter-tasarimi", label: "Karakter Tasarımı" },
  { slug: "minimalist", label: "Minimalist" },
  { slug: "soyut", label: "Soyut" },
  { slug: "3d-render", label: "3D Render" },
  { slug: "neon", label: "Neon" },
  { slug: "surreal", label: "Sürreal" },
  { slug: "uzay", label: "Uzay" },
  { slug: "retro", label: "Retro" },
];

export function getTag(slug: string): Tag {
  return mockTags.find((tag) => tag.slug === slug) ?? { slug, label: slug };
}
