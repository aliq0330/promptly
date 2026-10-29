"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { communityHref } from "@/lib/communities";
import { memberCountText } from "@/lib/group-labels";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CommunityCard } from "@/lib/supabase/chat-groups";

/** "Ortak topluluklar" (docs/history/271-*): kendin ve karşındaki kişinin İKİNİZİN de üye olduğu topluluklar; satıra dokunmak topluluk sayfasını açar. */
export function CommonCommunitiesModal({ communities, name, onClose }: { communities: CommunityCard[]; name: string; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal onClose={onClose} labelledBy="common-communities-title" overLayers>
      <div data-common-communities className="flex max-h-[min(80dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-[22px] bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div className="min-w-0">
            <h2 id="common-communities-title" className="font-display text-h3 font-bold text-text">
              {t("messages.contact.commonCommunities")}
            </h2>
            <p className="truncate text-caption text-text-muted">{t("messages.contact.commonWith", { name })}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
          >
            <X size={18} />
          </button>
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-5">
          {communities.map((community) => (
            <li key={community.id}>
              <Link
                href={communityHref(community.id)}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={44} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-body font-medium text-text">{community.name}</span>
                  <span className="block truncate text-caption text-text-muted">{memberCountText(t, community.memberCount)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
