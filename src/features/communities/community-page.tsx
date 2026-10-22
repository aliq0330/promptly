"use client";

import { Suspense, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, RefreshCw, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { RoleBadge } from "@/features/groups/role-badge";
import { useToast } from "@/features/groups/use-toast";
import { CommunityGate } from "./community-gate";
import { CommunityLayout, CommunityReadingColumn } from "./community-layout";
import { CommunityJoinButton, type JoinState } from "./community-join-button";
import { VisibilityLabel } from "./visibility-label";
import { FeedTab } from "./feed-tab";
import { MembersTab } from "./members-tab";
import { EventsTab } from "./events-tab";
import { AboutTab } from "./about-tab";
import { ManageTab } from "./manage-tab";
import { useCommunity } from "./use-community";
import { CommunityAside, MemberStack, useCommunityPeople } from "./community-aside";
import { CommunityCover } from "./community-cover";
import { BAND_PRIMARY_CLASS, BandActionRow, DetailBand, DetailTitle, Eyebrow } from "@/features/content/detail-parts";
import { accessibleTabs, CATEGORY_LABEL_KEYS, communityChatHref, communityHref, resolveCommunityView, type CommunityTab } from "@/lib/communities";
import { can } from "@/lib/chat-groups";
import { memberCountText } from "@/lib/group-labels";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ChatGroup, GroupRole } from "@/types";
import type { MyCommunityMembership } from "@/lib/supabase/communities";

/** Sekme bileşenlerine verilen ortak bağlam. `role` null = üye olmayan (herkese açık toplulukta salt-okunur) ziyaretçi. */
export interface CommunityTabProps {
  group: ChatGroup;
  role: GroupRole | null;
  /** Oturum açmamış ziyaretçide null (yalnız herkese açık topluluğun salt-okunur içeriği). */
  viewerId: string | null;
  membership: MyCommunityMembership | null;
  reload: () => Promise<void>;
  onToast: (message: string) => void;
  goTab: (tab: CommunityTab, section?: string) => void;
  /** Adresteki `section` (Üyeler: list|requests|invites · Yönet: stats|settings|…); geçersizse sekme ilk bölümünü açar. */
  section: string | null;
}

/**
 * `/communities/local?id=…&tab=…`: topluluk ana sayfası (topluluğun MERKEZİ; sohbet ayrı çalışma alanıdır ve başlıktaki "Sohbeti aç" ile açılır).
 * Oturum açmamış ziyaretçi herkese açık toplulukta salt-okunur görür (katıl → giriş diyaloğu); kapalı/tamamen kapalı topluluğun içeriği
 * ziyaretçiye de kapalıdır (docs/history/177-*). Sekmeler: Akış (ilk açılış) · Etkinlikler · Üyeler (liste + yetkiliye istekler/davetler) ·
 * Hakkında ve kurallar · Yönet (yalnız yetkililere). Her sekmenin erişimi `accessibleTabs`'tan gelir ve veritabanındaki RLS ile aynıdır: üye olmayan kapalı
 * topluluğun içeriğini göremez (yalnız davet/başvuru "geçidi" görünür), sohbet ve üye listesi üyelik gerektirir.
 */
export function CommunityPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <CommunityPageInner />
    </Suspense>
  );
}

function CommunityPageInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { user, loading: authLoading } = useAuth();
  const { conversations, refresh } = useRealMessages();
  const { node: toastNode, show } = useToast();
  const { state, reload } = useCommunity(authLoading ? null : id, user?.id ?? null);

  const role = state.status === "ready" ? (state.membership?.role ?? null) : null;
  const group = state.status === "ready" ? state.group : null;
  const allowed = useMemo(() => (group ? accessibleTabs({ role, visibility: group.visibility, perms: group.rolePermissions }) : []), [group, role]);
  const { view, toChat } = resolveCommunityView(searchParams.get("tab"), searchParams.get("section"), allowed);
  const tab = view?.tab ?? null;
  const unread = conversations.find((c) => c.id === id)?.unreadCount ?? 0;
  const people = useCommunityPeople(id ?? "", Boolean(id && role));

  function goTab(next: CommunityTab, section?: string) {
    if (id) router.replace(communityHref(id, next, section));
  }

  // Eski `tab=chat` bağlantısı: sohbet ayrı çalışma alanıdır, sekme yoktur.
  useEffect(() => {
    if (toChat && id) router.replace(communityChatHref(id));
  }, [toChat, id, router]);

  if (!id) return <NotFoundBlock title={t("communities.notFound.title")} description={t("communities.notFound.body")} />;
  if (authLoading || state.status === "loading") return <DetailSkeleton />;
  if (state.status === "notfound") {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
        <NotFoundBlock title={t("communities.notFound.title")} description={t("communities.notFound.body")} />
        <Link href="/communities" className={buttonClassName({ size: "sm", variant: "outline" })}>
          {t("communities.join.toCommunities")}
        </Link>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <p role="alert" className="text-small text-danger">
          {t("communities.page.loadError")}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
          <RefreshCw size={14} /> {t("common.retry")}
        </Button>
      </div>
    );
  }

  const ready = state;
  const tabLabels: Record<CommunityTab, string> = {
    feed: t("communities.detail.tab.feed"),
    events: t("communities.detail.tab.events"),
    members: t("communities.detail.tab.members"),
    about: t("communities.detail.tab.about"),
    manage: t("communities.detail.tab.manage"),
  };
  // Bekleyen istek sayısı, istekleri yönetebilenin "Üyeler" sekmesinde görünür (isteklerin bulunduğu yer burasıdır).
  const pendingForMe = role && can(role, "manage_requests", ready.group.rolePermissions) ? ready.group.pendingRequestCount : 0;
  const tabs: TabItem<CommunityTab>[] = allowed.map((key) => ({
    key,
    label: tabLabels[key],
    count: key === "members" && pendingForMe > 0 ? pendingForMe : undefined,
  }));

  // Üyelik düğmesi sonuçlandı: sayfayı ve Mesajlar listesini yeniler. Tamamen kapalı topluluktan ayrılan kişi artık satırı okuyamaz → listeye döner.
  async function membershipChanged(next: JoinState) {
    void refresh();
    if (next === "none" && ready.group.visibility === "private") {
      router.replace("/communities");
      return;
    }
    await reload();
  }

  const joinState: JoinState = role ? "member" : ready.gate.invitationId ? "invited" : ready.gate.requestId ? "requested" : "none";

  const common: CommunityTabProps = { group: ready.group, role, viewerId: user?.id ?? null, membership: ready.membership, reload, onToast: show, goTab, section: view?.section ?? null };
  const g = ready.group;

  const categoryLabel = t(CATEGORY_LABEL_KEYS[g.category]);

  return (
    // Albüm (docs/history/203-*): band tinted by the community's cover (photo › colour › its picture) · actions row · tabs + content.
    <div className="w-full">
      <DetailBand
        align="center"
        data-testid="community-header"
        backdrop={<CommunityCover coverUrl={g.coverUrl} coverColor={g.coverColor} avatarUrl={g.avatarUrl} className="h-full sm:h-full" />}
        art={
          <span className="inline-flex shrink-0 rounded-[1.9rem] border-4 border-surface bg-surface shadow-pop">
            <GroupAvatar name={g.name} avatarUrl={g.avatarUrl} size={112} className="[&>span:first-child]:rounded-[1.6rem]" />
          </span>
        }
        kicker={
          <Eyebrow tone="primary">
            {t("groups.page.eyebrow")} · <span>{categoryLabel}</span>
          </Eyebrow>
        }
        title={<DetailTitle>{g.name}</DetailTitle>}
        byline={
          <div className="flex w-full flex-col items-center gap-3 lg:items-start">
            <div className="flex flex-wrap items-center justify-center gap-1.5 lg:justify-start">
              <VisibilityLabel visibility={g.visibility} />
              <MemberStack people={people} />
              <span className="text-small text-text-secondary">{memberCountText(t, g.memberCount)}</span>
              {role && <RoleBadge role={role} />}
              {g.closedAt && <Badge variant="warning">{t("communities.closedBadge")}</Badge>}
              {g.origin === "legacy_group" && <Badge variant="outline">{t("communities.detail.legacyBadge")}</Badge>}
            </div>
            {g.description && (
              <p data-community-description className="line-clamp-2 max-w-3xl whitespace-pre-line break-words text-body text-text-secondary">
                {g.description}
              </p>
            )}
          </div>
        }
      />
      <CommunityLayout
        aside={tab === "feed" ? <CommunityAside group={g} people={people} onReadRules={() => goTab("about")} /> : undefined}
        asideLabel={t("communities.aside.pageLabel")}
        className="pt-3 sm:pt-4"
      >
        <BandActionRow label={t("communities.band.actionsAria")} data-community-actions="">
          {role && (
            <Link href={communityChatHref(g.id)} data-open-chat className={buttonClassName({ size: "lg", className: BAND_PRIMARY_CLASS })}>
              <MessageSquare size={18} aria-hidden /> {t("communities.detail.openChat")}
              {unread > 0 && <span className="ml-1 rounded-full bg-primary-foreground px-1.5 text-caption text-primary">{unread}</span>}
            </Link>
          )}
          <CommunityJoinButton
            target={{ id: g.id, name: g.name, visibility: g.visibility, rulesRequired: g.rulesRequired, memberCount: g.memberCount, memberLimit: g.memberLimit, closed: Boolean(g.closedAt) }}
            status={joinState}
            role={role}
            rules={g.rules}
            size="lg"
            onChange={(next) => void membershipChanged(next)}
            onToast={show}
          />
          {pendingForMe > 0 && (
            <Link
              href={communityHref(g.id, "members", "requests")}
              data-pending-requests
              aria-label={t("communities.detail.pendingRequests", { count: pendingForMe })}
              className={buttonClassName({ size: "lg", variant: "secondary" })}
            >
              <UserCog size={16} aria-hidden />
              <span className="sm:hidden" aria-hidden>{t("communities.detail.pendingShort", { count: pendingForMe })}</span>
              <span className="hidden sm:inline" aria-hidden>{t("communities.detail.pendingRequests", { count: pendingForMe })}</span>
            </Link>
          )}
        </BandActionRow>

        {!tab ? (
          <CommunityGate group={g} gate={ready.gate} onChanged={reload} onToast={show} />
        ) : (
          <>
            {!role && (
              <CommunityGate group={g} gate={ready.gate} onChanged={reload} onToast={show} compact />
            )}
            <Tabs items={tabs} active={tab} onChange={goTab} ariaLabel={t("communities.detail.tabsAria")} variant="pill" />
            <div role="tabpanel">
              {tab === "feed" && <FeedTab {...common} />}
              {tab !== "feed" && (
                <CommunityReadingColumn className={tab === "manage" ? "max-w-4xl" : undefined}>
                  {tab === "members" && role && <MembersTab {...common} />}
                  {tab === "events" && <EventsTab {...common} />}
                  {tab === "about" && <AboutTab {...common} />}
                  {tab === "manage" && role && <ManageTab {...common} />}
                </CommunityReadingColumn>
              )}
            </div>
          </>
        )}
        {toastNode}
      </CommunityLayout>
    </div>
  );
}
