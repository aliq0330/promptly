"use client";

import { CircleHelp } from "@/components/icons/circle-help";
import { ImageIcon } from "@/components/icons/image-icon";
import { Megaphone } from "@/components/icons/megaphone";
import { MessageCircle } from "@/components/icons/message-circle";
import { Palette } from "@/components/icons/palette";
import { ShieldCheck } from "@/components/icons/shield-check";
import { Sparkles } from "@/components/icons/sparkles";
import { SquareTerminal } from "@/components/icons/square-terminal";
import type { IconComponent } from "@/components/icons/icon";
import { cn } from "@/lib/utils";
import type { CommunityRoomIcon } from "@/types";

/** Oda simgesi anahtarı (DB'de saklanan değer) → simge bileşeni. Anlam başına tek ikon kuralı: yeni simge = DB CHECK + `ROOM_ICONS` + burası + çeviri. */
export const ROOM_ICON_COMPONENTS: Record<CommunityRoomIcon, IconComponent> = {
  message: MessageCircle,
  prompt: SquareTerminal,
  image: ImageIcon,
  megaphone: Megaphone,
  sparkles: Sparkles,
  help: CircleHelp,
  shield: ShieldCheck,
  palette: Palette,
};

/** Simge karosunun tonu (yalnız token'lar): mavi = yapabileceğin şey, turuncu = duyuru/vurgu, yeşil = içerik, nötr = yönetim/yardım. */
const TONES: Record<CommunityRoomIcon, string> = {
  message: "bg-primary-soft text-primary",
  prompt: "bg-primary-soft text-primary",
  image: "bg-success/10 text-success",
  megaphone: "bg-secondary/10 text-secondary",
  sparkles: "bg-secondary/10 text-secondary",
  help: "bg-surface-soft text-text-secondary",
  shield: "bg-surface-soft text-text-secondary",
  palette: "bg-success/10 text-success",
};

export function RoomIcon({ icon, size = 20, className }: { icon: CommunityRoomIcon; size?: number; className?: string }) {
  const Component = ROOM_ICON_COMPONENTS[icon] ?? MessageCircle;
  return <Component size={size} className={className} aria-hidden />;
}

/** Yuvarlatılmış kare simge karosu (oda listesi, değiştirici, yönetim). `selected`: seçili satırda beyaz zemin. */
export function RoomIconTile({ icon, size = 44, selected = false, className }: { icon: CommunityRoomIcon; size?: number; selected?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-[14px]", selected ? "bg-surface text-primary" : TONES[icon] ?? TONES.message, className)}
      style={{ width: size, height: size }}
    >
      <RoomIcon icon={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}
