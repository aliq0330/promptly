"use client";

import { ArrowUp } from "@/components/icons/arrow-up";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * "N yeni gönderi" hapı (docs/history/435-*): Takip Ettiklerim'de okuyucu akışı okurken yeni gönderi gelince listeyi KAYDIRMADAN ekranın üstünde ortada belirir
 * (bildirim panelindeki "N yeni" hapıyla aynı dil: birincil dolgu, tek eylem). Basınca liste yerinde yenilenir ve en üste kaydırılır. Telefonda üst menü kayıp
 * gidince hap yukarı çıkar (`html[data-chrome-hidden]`).
 */
export function NewPostsPill({ count, plus, onClick }: { count: number; plus: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  const label = plus ? t("feed.newPostsPlus", { count }) : count === 1 ? t("feed.newPostsOne") : t("feed.newPostsMany", { count });
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-(--z-sticky) flex justify-center transition-[top] duration-200 ease-soft [html[data-chrome-hidden]_&]:top-[calc(env(safe-area-inset-top)+0.75rem)]" data-new-posts="">
      <button
        type="button"
        onClick={onClick}
        data-action="show-new-posts"
        className="pointer-events-auto inline-flex h-11 animate-pop-in items-center gap-2 rounded-sm bg-primary px-4 text-small font-semibold text-primary-foreground shadow-md hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ArrowUp size={16} aria-hidden />
        {label}
      </button>
    </div>
  );
}
