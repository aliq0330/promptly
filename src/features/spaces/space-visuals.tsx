"use client";

import { useState } from "react";
import { Check, EyeOff, Globe2, ImageOff, Link2, Lock, Shapes, type LucideIcon } from "lucide-react";
import { StorageImg } from "@/components/ui/storage-media";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { SPACE_VISIBILITY_LABEL, type SpaceColor, type SpaceVisibility } from "@/lib/spaces";

/** Spaces'in simgesi (gezinme, bant, boş durum): her yerde aynı. */
export const SpacesIcon: LucideIcon = Shapes;

export const VISIBILITY_ICON: Record<SpaceVisibility, LucideIcon> = { private: Lock, link: Link2, public: Globe2 };

export function VisibilityBadge({ visibility, className }: { visibility: SpaceVisibility; className?: string }) {
  const { t } = useTranslation();
  const Icon = VISIBILITY_ICON[visibility];
  return (
    <span
      data-space-visibility={visibility}
      className={cn("inline-flex items-center gap-1 rounded-full bg-surface-soft px-2 py-0.5 text-caption font-medium text-text-secondary", className)}
    >
      <Icon size={12} aria-hidden />
      {t(SPACE_VISIBILITY_LABEL[visibility])}
    </span>
  );
}

/** Not / grup rengi → palet token'ları (hex yok: tema ve paletle birlikte değişir). */
export const SPACE_COLOR_CLASS: Record<SpaceColor, { surface: string; border: string; dot: string; text: string }> = {
  neutral: { surface: "bg-surface", border: "border-border", dot: "bg-text-muted", text: "text-text-secondary" },
  primary: { surface: "bg-primary-soft", border: "border-primary/40", dot: "bg-primary", text: "text-primary" },
  secondary: { surface: "bg-secondary/12", border: "border-secondary/40", dot: "bg-secondary", text: "text-secondary" },
  success: { surface: "bg-success/12", border: "border-success/40", dot: "bg-success", text: "text-success" },
  warning: { surface: "bg-warning/12", border: "border-warning/40", dot: "bg-warning", text: "text-warning" },
  danger: { surface: "bg-danger/12", border: "border-danger/40", dot: "bg-danger", text: "text-danger" },
};

/**
 * Space içindeki bir görsel: kimlik URL'si signed URL'ye çevrilerek gösterilir (`StorageImg`). `available === false` (kaynağı bu
 * okuyucuya kapalı) ya da dosya yüklenemezse görsel İSTENMEZ/gösterilmez, yerine sakin bir yer tutucu çizilir.
 */
export function SpaceImage({
  url,
  alt,
  available = true,
  className,
  imgClassName,
  reason,
}: {
  url: string | null;
  alt: string;
  available?: boolean;
  className?: string;
  imgClassName?: string;
  /** Yer tutucunun altındaki kısa açıklama (ör. "Kaynak artık erişilemiyor"). */
  reason?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const show = available && url && failed !== url;
  return (
    <span className={cn("relative block overflow-hidden bg-surface-soft", className)}>
      {show ? (
        <StorageImg src={url} alt={alt} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(url)} className={cn("h-full w-full object-cover", imgClassName)} />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center text-text-muted">
          {available ? <ImageOff size={20} aria-hidden /> : <EyeOff size={20} aria-hidden />}
          {reason && <span className="text-caption leading-tight">{reason}</span>}
        </span>
      )}
    </span>
  );
}

/**
 * Bir paletin renkleri yan yana (docs/history/214-*): Space bandında dokununca HEX kopyalanır (`copyable`), kartta ince ve
 * yalnız gösterim. Renkler kullanıcı içeriğidir (#rrggbb, sunucuda doğrulanır) — tasarım token'ı değil, bu yüzden satır içi stil.
 */
export function PaletteStrip({ colors, copyable, max = 8, className }: { colors: string[]; copyable?: boolean; max?: number; className?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  const list = colors.slice(0, max);
  if (list.length === 0) return null;
  if (!copyable) {
    return (
      <span aria-hidden data-palette-strip="" className={cn("flex gap-1", className)}>
        {list.map((color, index) => (
          <span key={`${color}-${index}`} className="h-full min-w-0 flex-1 rounded-full" style={{ backgroundColor: color }} />
        ))}
      </span>
    );
  }
  async function copy(color: string) {
    try {
      await navigator.clipboard.writeText(color);
      setCopied(color);
      setTimeout(() => setCopied((current) => (current === color ? null : current)), 1400);
    } catch {
      // Panoya yazılamadı (izin yok): renk yine ekranda; sessizce geç.
    }
  }
  return (
    <span data-palette-strip="" className={cn("flex gap-1.5", className)}>
      {list.map((color, index) => (
        <button
          key={`${color}-${index}`}
          type="button"
          onClick={() => void copy(color)}
          aria-label={t("spaces.palette.copyColor", { hex: color })}
          title={copied === color ? t("common.copied") : color}
          className="relative h-7 min-w-0 flex-1 rounded-[0.6rem] shadow-xs ring-1 ring-inset ring-text/10 transition-transform duration-200 ease-soft hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          style={{ backgroundColor: color }}
        >
          {copied === color && (
            <span className="absolute inset-0 flex items-center justify-center rounded-[0.6rem] bg-text/50 text-background">
              <Check size={14} strokeWidth={2.5} aria-hidden />
            </span>
          )}
        </button>
      ))}
    </span>
  );
}

/**
 * Space kapağı: tek görsel ya da en çok dört görselin kolajı; görsel yoksa simge. Kare; boyut sınıfla verilir.
 */
export function SpaceCoverArt({ urls, className, iconSize = 32 }: { urls: string[]; className?: string; iconSize?: number }) {
  const list = urls.slice(0, 4);
  if (list.length === 0) {
    return (
      <span aria-hidden className={cn("flex items-center justify-center bg-primary-soft text-primary", className)}>
        <SpacesIcon size={iconSize} strokeWidth={1.4} />
      </span>
    );
  }
  if (list.length === 1) {
    return <SpaceImage url={list[0]} alt="" className={className} />;
  }
  return (
    <span aria-hidden className={cn("grid grid-cols-2 grid-rows-2 gap-0.5 bg-surface", className)}>
      {[0, 1, 2, 3].map((index) => (
        <span key={index} className="relative overflow-hidden bg-surface-soft">
          {list[index] && <SpaceImage url={list[index]} alt="" className="absolute inset-0" />}
        </span>
      ))}
    </span>
  );
}
