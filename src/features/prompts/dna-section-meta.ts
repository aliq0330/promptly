import {
  Ban, Camera, Clock, CloudRain, Cpu, Droplet, FileText, Film, Frame, Globe, Languages, Lightbulb, ListChecks, MapPin,
  MessageSquareQuote, Music, MonitorPlay, Palette, Shapes, ShieldAlert, Sparkles, Tag, User, UserCog, Users,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { DnaSection, DnaSectionType } from "@/lib/prompt-dna/types";

export const DNA_ICONS: Record<DnaSectionType, LucideIcon> = {
  subject: Shapes,
  character: User,
  location: MapPin,
  time: Clock,
  weather: CloudRain,
  atmosphere: Sparkles,
  lighting: Lightbulb,
  camera: Camera,
  composition: Frame,
  style: Palette,
  color: Droplet,
  motion: Film,
  audio: Music,
  output: MonitorPlay,
  negative: Ban,
  technology: Cpu,
  task: ListChecks,
  role: UserCog,
  constraints: ShieldAlert,
  audience: Users,
  tone: MessageSquareQuote,
  platform: Globe,
  format: FileText,
  language: Languages,
  custom: Tag,
};

export function dnaLabelKey(type: DnaSectionType): TranslationKey {
  return `dna.section.${type}` as TranslationKey;
}

/** The heading a section shows: the user's own name for custom sections, the translated type name otherwise. */
export function dnaSectionLabel(section: Pick<DnaSection, "type" | "label">, t: (key: TranslationKey) => string): string {
  if (section.type === "custom") return section.label?.trim() || t(dnaLabelKey("custom"));
  return t(dnaLabelKey(section.type));
}
