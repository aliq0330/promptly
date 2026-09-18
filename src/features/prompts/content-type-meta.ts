import { Code2, FileText, ImageIcon, Music, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PromptContentType } from "@/types";

export const CONTENT_TYPE_META: Record<PromptContentType, { icon: LucideIcon; label: string }> = {
  image: { icon: ImageIcon, label: "Görsel" },
  text: { icon: FileText, label: "Metin" },
  video: { icon: Video, label: "Video" },
  code: { icon: Code2, label: "Kod" },
  music: { icon: Music, label: "Müzik" },
};
