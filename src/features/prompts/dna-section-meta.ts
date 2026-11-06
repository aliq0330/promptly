import type { IconComponent } from "@/components/icons/icon";
import { Ban } from "@/components/icons/ban";
import { Camera } from "@/components/icons/camera";
import { Clock } from "@/components/icons/clock";
import { CloudRain } from "@/components/icons/cloud-rain";
import { Cpu } from "@/components/icons/cpu";
import { Droplet } from "@/components/icons/droplet";
import { FileText } from "@/components/icons/file-text";
import { Film } from "@/components/icons/film";
import { Frame } from "@/components/icons/frame";
import { Globe } from "@/components/icons/globe";
import { Languages } from "@/components/icons/languages";
import { Lightbulb } from "@/components/icons/lightbulb";
import { ListChecks } from "@/components/icons/list-checks";
import { MapPin } from "@/components/icons/map-pin";
import { MessageSquareQuote } from "@/components/icons/message-square-quote";
import { Music } from "@/components/icons/music";
import { MonitorPlay } from "@/components/icons/monitor-play";
import { Palette } from "@/components/icons/palette";
import { Shapes } from "@/components/icons/shapes";
import { ShieldAlert } from "@/components/icons/shield-alert";
import { Sparkles } from "@/components/icons/sparkles";
import { Tag } from "@/components/icons/tag";
import { User } from "@/components/icons/user";
import { UserCog } from "@/components/icons/user-cog";
import { UsersRound } from "@/components/icons/users-round";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { DnaSection, DnaSectionType } from "@/lib/prompt-dna/types";

export const DNA_ICONS: Record<DnaSectionType, IconComponent> = {
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
  audience: UsersRound,
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
