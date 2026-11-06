import type { IconComponent } from "@/components/icons/icon";
import { AudioLines } from "@/components/icons/audio-lines";
import { Briefcase } from "@/components/icons/briefcase";
import { Building2 } from "@/components/icons/building-2";
import { Camera } from "@/components/icons/camera";
import { Clapperboard } from "@/components/icons/clapperboard";
import { Code } from "@/components/icons/code";
import { Disc3 } from "@/components/icons/disc-3";
import { Folder } from "@/components/icons/folder";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { Leaf } from "@/components/icons/leaf";
import { Megaphone } from "@/components/icons/megaphone";
import { Mic } from "@/components/icons/mic";
import { MicVocal } from "@/components/icons/mic-vocal";
import { Microscope } from "@/components/icons/microscope";
import { Music } from "@/components/icons/music";
import { Package } from "@/components/icons/package";
import { PenLine } from "@/components/icons/pen-line";
import { PenTool } from "@/components/icons/pen-tool";
import { Podcast } from "@/components/icons/podcast";
import { Palette } from "@/components/icons/palette";
import { Popcorn } from "@/components/icons/popcorn";
import { Search } from "@/components/icons/search";
import { Shapes } from "@/components/icons/shapes";
import { Share2 } from "@/components/icons/share-2";
import { ShoppingBag } from "@/components/icons/shopping-bag";
import { Smartphone } from "@/components/icons/smartphone";
import { Sparkles } from "@/components/icons/sparkles";
import { UsersRound } from "@/components/icons/users-round";
import { Video } from "@/components/icons/video";
import { WandSparkles } from "@/components/icons/wand-sparkles";
import { Waves } from "@/components/icons/waves";

/**
 * Category icon names stored in `taxonomy_categories.icon` (kebab-case Lucide
 * names) -> the component. A name this map doesn't know falls back to a
 * folder, so a new database row never crashes the picker.
 */
export const TAXONOMY_ICONS: Record<string, IconComponent> = {
  users: UsersRound,
  camera: Camera,
  palette: Palette,
  sparkles: Sparkles,
  "shopping-bag": ShoppingBag,
  "building-2": Building2,
  leaf: Leaf,
  "pen-tool": PenTool,
  "pen-line": PenLine,
  "share-2": Share2,
  megaphone: Megaphone,
  search: Search,
  briefcase: Briefcase,
  "graduation-cap": GraduationCap,
  microscope: Microscope,
  code: Code,
  music: Music,
  mic: Mic,
  "mic-vocal": MicVocal,
  "audio-lines": AudioLines,
  podcast: Podcast,
  waves: Waves,
  clapperboard: Clapperboard,
  smartphone: Smartphone,
  shapes: Shapes,
  "disc-3": Disc3,
  popcorn: Popcorn,
  "wand-sparkles": WandSparkles,
  package: Package,
  video: Video,
};

/** Shown for an icon name `TAXONOMY_ICONS` doesn't have. */
export const FALLBACK_TAXONOMY_ICON: IconComponent = Folder;
