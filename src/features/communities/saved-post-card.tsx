"use client";

import { FolderMinus } from "lucide-react";
import { useToast } from "@/features/groups/use-toast";
import { ApplicationCard } from "./application-card";
import { DropdownMenu, MenuItem } from "./dropdown-menu";
import { useViewerEngageMode } from "./post-engagement";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CommunityPost } from "@/lib/supabase/communities";

/**
 * Kaydedilenler ve koleksiyon sayfalarındaki topluluk başvurusu kartı: akıştaki `ApplicationCard`'ın AYNISI (aynı altbilgi: beğeni, yorum, kaydet,
 * istatistik, paylaş). Fark yalnızca menü: yalnız viewer'ın kendi koleksiyonunda "Koleksiyondan kaldır". Etkileşim kipi, topluluk bilgisi olmadığı
 * için viewer'ın üyeliğinden türetilir (`useViewerEngageMode`).
 */
export function SavedPostCard({ post, collectionRemoval }: { post: CommunityPost; collectionRemoval?: { onRemove: () => Promise<void> } }) {
  const { t } = useTranslation();
  const { node, show } = useToast();
  const mode = useViewerEngageMode(post.communityId);
  const menu = collectionRemoval ? (
    <DropdownMenu label={t("communities.feed.postMenu")}>
      {(close) => (
        <MenuItem
          icon={<FolderMinus size={15} />}
          label={t("common.removeFromCollection")}
          danger
          onClick={() => {
            close();
            collectionRemoval.onRemove().catch((err) => {
              console.error("collectionRemoval", err);
              show(t("common.removeFailed"));
            });
          }}
        />
      )}
    </DropdownMenu>
  ) : undefined;
  return (
    <>
      <ApplicationCard post={post} mode={mode} onToast={show} menu={menu} />
      {node}
    </>
  );
}
