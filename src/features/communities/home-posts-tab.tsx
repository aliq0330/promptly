"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Compass, SquareStack, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClassName } from "@/components/ui/button";
import { HomeFeedList } from "./home-feed-list";
import { useHomeFeed } from "./use-home-feed";
import { listMyCommunities } from "@/lib/supabase/communities";
import { homeHref } from "@/lib/community-home";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Gönderiler (varsayılan sekme): üyesi olduğum herkese açık ve kapalı toplulukların gönderileri, yeniden eskiye. Tamamen kapalı topluluk
 * gönderileri genel akışa girmez (sunucu zorlar); onlar topluluğun kendi sayfasındadır. Yönetim eylemleri de oradadır.
 */
export function HomePostsTab({ onToast }: { onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const feed = useHomeFeed("member");
  const [memberOfAny, setMemberOfAny] = useState<boolean | null>(null);

  // Boş akışta doğru mesaj için: hiç üye değil mi, yoksa üye ama gönderi yok mu?
  const emptyReady = feed.status === "ready" && feed.entries.length === 0;
  useEffect(() => {
    if (!emptyReady) return;
    let cancelled = false;
    listMyCommunities("member", 0)
      .then((page) => !cancelled && setMemberOfAny(page.communities.length > 0))
      .catch(() => !cancelled && setMemberOfAny(null));
    return () => {
      cancelled = true;
    };
  }, [emptyReady]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-label font-semibold text-text">
          <SquareStack size={14} className="text-primary" aria-hidden /> {t("communities.home.posts.title")}
        </h2>
        <Link href={homeHref("mine")} className={buttonClassName({ size: "sm", variant: "ghost" })} data-testid="my-communities-link">
          <Users size={14} /> {t("communities.home.myCommunities")}
        </Link>
      </div>
      <p className="text-caption text-text-muted">{t("communities.home.posts.help")}</p>
      <HomeFeedList
        feed={feed}
        onToast={onToast}
        viewerIsMember={() => true}
        empty={
          <EmptyState
            icon={memberOfAny ? SquareStack : Compass}
            title={memberOfAny ? t("communities.home.posts.emptyMember") : t("communities.home.posts.emptyNone")}
            description={memberOfAny ? t("communities.home.posts.emptyMemberHelp") : t("communities.home.posts.emptyNoneHelp")}
            action={{ label: t("communities.tab.discover"), href: homeHref("discover") }}
          />
        }
      />
    </div>
  );
}
