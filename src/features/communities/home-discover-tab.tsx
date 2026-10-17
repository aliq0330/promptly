"use client";

import Link from "next/link";
import { ArrowRight, Compass, Flame } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClassName } from "@/components/ui/button";
import { HomeFeedList } from "./home-feed-list";
import { SuggestionStrip } from "./suggestion-strip";
import { useHomeFeed } from "./use-home-feed";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Keşfet (oturumlu): üstte "Sana uygun topluluklar" şeridi, hemen altında "Tüm topluluklar" düğmesi, sonra gönderi akışı. Akış: görmediğin
 * gönderiler önce; üye olduğun, takip ettiğin kişilerin ve herkese açık toplulukların gönderileri tek listede, kopyasız, ilgi ve çeşitlilik sıralı
 * (kurallar `discover_feed_page` içinde ve docs/community-system.md'de). Tamamen kapalı topluluk asla; kapalı topluluk yalnız üyesine.
 */
export function HomeDiscoverTab({ onToast, onGoInvites }: { onToast: (message: string) => void; onGoInvites: () => void }) {
  const { t } = useTranslation();
  const feed = useHomeFeed("discover");

  return (
    <div className="space-y-5">
      <SuggestionStrip onToast={onToast} onGoInvites={onGoInvites} />

      <Link href="/communities/all" className={buttonClassName({ variant: "outline", className: "w-full justify-between" })} data-testid="all-communities-button">
        <span className="flex items-center gap-2">
          <Compass size={16} aria-hidden /> {t("communities.all.button")}
        </span>
        <ArrowRight size={16} aria-hidden />
      </Link>

      <section aria-labelledby="discover-feed-title" className="space-y-3">
        <div>
          <h2 id="discover-feed-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
            <Flame size={14} className="text-primary" aria-hidden /> {t("communities.home.discover.title")}
          </h2>
          <p className="text-caption text-text-muted">{t("communities.home.discover.help")}</p>
        </div>
        <HomeFeedList
          feed={feed}
          onToast={onToast}
          viewerIsMember={(source) => source === "member"}
          empty={
            <EmptyState
              icon={Compass}
              title={t("communities.home.discover.empty")}
              description={t("communities.home.discover.emptyHelp")}
              action={{ label: t("communities.all.button"), href: "/communities/all" }}
            />
          }
        />
      </section>
    </div>
  );
}
