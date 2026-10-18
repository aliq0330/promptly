"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Globe, Lock, PenLine, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClassName } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useCommunity } from "@/features/communities/use-community";
import { listMyCommunities, type CommunitySummary } from "@/lib/supabase/communities";
import { canSharePost } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/** Where the next post goes: the main feed, or one of the viewer's communities. */
export type ShareDestination = { kind: "feed" } | { kind: "community"; community: CommunitySummary };

/** Create-screen address for a destination: the normal type picker, carrying the community context (`?community=`) — no second create form. */
export function shareHref(destination: ShareDestination): string {
  return destination.kind === "community" ? `/create?community=${destination.community.id}` : "/create";
}

const PAGE_LIMIT = 4;

/**
 * The signed-in composer on Home (docs/history/197-*): the field that opens the create screen, a "Nerede paylaşmak istiyorsun?" target
 * picker (default "Genel akış"; tapping it lists the communities the viewer belongs to, a chosen one shows its name and logo) and the
 * "Paylaşım oluştur" button, which opens the normal create screen prepared for the chosen target (`/create` or `/create?community=<id>`).
 */
export function ShareComposer() {
  const { user } = useAuth();
  const { profile } = useOwnProfile();
  const { t } = useTranslation();
  const [destination, setDestination] = useState<ShareDestination>({ kind: "feed" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerButton = useRef<HTMLButtonElement>(null);

  // The chosen community's real posting rule (members vs staff only, closed): read as a member, so the button never leads to a refusal.
  const communityId = destination.kind === "community" ? destination.community.id : null;
  const { state } = useCommunity(communityId, user?.id ?? null);
  const blocked = communityId !== null && state.status === "ready" && !canSharePost(state.group.myRole, state.group.feedPolicy, Boolean(state.group.closedAt));
  const href = shareHref(destination);

  function choose(next: ShareDestination) {
    setDestination(next);
    setPickerOpen(false);
    pickerButton.current?.focus();
  }

  return (
    <section aria-label={t("home.createShare")} className="space-y-3 rounded-xl border border-border-soft bg-surface p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <Avatar src={profile?.avatarUrl ?? null} alt={profile?.displayName ?? ""} size={42} />
        <Link
          href={href}
          className="min-w-0 flex-1 truncate rounded-full bg-surface-soft px-4 py-2.5 text-small text-text-muted transition-colors hover:bg-border-soft hover:text-text-secondary"
        >
          {t("home.composerPlaceholder")}
        </Link>
      </div>

      <div className="flex flex-col gap-3 border-t border-border-soft pt-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <p id="share-destination-label" className="mb-1.5 text-caption font-semibold text-text-secondary">
            {t("home.destination.label")}
          </p>
          <button
            ref={pickerButton}
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
            aria-labelledby="share-destination-label share-destination-value"
            data-share-destination={destination.kind === "community" ? destination.community.id : "feed"}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border-soft bg-background px-3 py-2 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <DestinationIcon destination={destination} size={32} />
            <span id="share-destination-value" className="min-w-0 flex-1">
              <span className="block truncate text-label font-semibold text-text">
                {destination.kind === "community" ? destination.community.name : t("home.destination.feed")}
              </span>
              <span className="block truncate text-caption text-text-muted">
                {destination.kind === "community" ? communityHint(destination.community, t) : t("home.destination.feedHint")}
              </span>
            </span>
            <ChevronDown size={18} aria-hidden className="shrink-0 text-text-muted" />
          </button>
        </div>
        {blocked ? (
          <Button type="button" disabled className="w-full sm:w-auto" data-create-share="blocked">
            <PenLine size={16} aria-hidden />
            {t("home.createShare")}
          </Button>
        ) : (
          <Link href={href} data-create-share="ready" className={buttonClassName({ className: "w-full sm:w-auto" })}>
            <PenLine size={16} aria-hidden />
            {t("home.createShare")}
          </Link>
        )}
      </div>
      {blocked && (
        <p role="status" data-share-blocked className="text-caption text-text-muted">
          {state.status === "ready" && state.group.closedAt ? t("communities.detail.closedNotice") : t("communities.feed.policyStaff")}
        </p>
      )}

      {pickerOpen && <DestinationPicker destination={destination} onChoose={choose} onClose={() => setPickerOpen(false)} />}
    </section>
  );
}

function communityHint(community: CommunitySummary, t: ReturnType<typeof useTranslation>["t"]): string {
  return community.visibility === "public" ? t("home.destination.communityPublic") : t("home.destination.communityMembers");
}

function DestinationIcon({ destination, size }: { destination: ShareDestination; size: number }) {
  if (destination.kind === "community") return <GroupAvatar name={destination.community.name} avatarUrl={destination.community.avatarUrl} size={size} />;
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-primary-soft text-primary" style={{ width: size, height: size }}>
      <Globe size={Math.round(size * 0.55)} strokeWidth={1.9} />
    </span>
  );
}

/** The target list: "Genel akış" first, then the viewer's communities (a bottom sheet on phones, a centred card on larger screens — the shared `Modal`). */
function DestinationPicker({ destination, onChoose, onClose }: { destination: ShareDestination; onChoose: (next: ShareDestination) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [communities, setCommunities] = useState<CommunitySummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    setCommunities(null);
    try {
      // Every page: the picker must list ALL the viewer's communities. A closed (read-only) community cannot receive posts, so it is left out.
      const all: CommunitySummary[] = [];
      for (let offset = 0, page = 0; page < PAGE_LIMIT; page += 1) {
        const result = await listMyCommunities("member", offset);
        all.push(...result.communities);
        offset += result.communities.length;
        if (!result.hasMore || result.communities.length === 0) break;
      }
      setCommunities(all.filter((community) => !community.closed));
    } catch (err) {
      console.error("share destination picker", err);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- yükleme açılışta başlar
    void load();
  }, [load]);

  const selectedId = destination.kind === "community" ? destination.community.id : null;
  const rowClass = (selected: boolean) =>
    cn(
      "flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      selected ? "border-primary/50 bg-primary-soft/60" : "border-border-soft bg-background hover:border-border-strong",
    );

  return (
    <Modal onClose={onClose} labelledBy="share-destination-title">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="space-y-1 border-b border-border-soft p-4">
          <h2 id="share-destination-title" className="text-base font-semibold text-text">
            {t("home.destination.label")}
          </h2>
        </div>
        <div className="space-y-2 overflow-y-auto p-3" role="listbox" aria-labelledby="share-destination-title">
          <button type="button" role="option" aria-selected={selectedId === null} onClick={() => onChoose({ kind: "feed" })} className={rowClass(selectedId === null)} data-destination-option="feed">
            <DestinationIcon destination={{ kind: "feed" }} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label font-semibold text-text">{t("home.destination.feed")}</span>
              <span className="block truncate text-caption text-text-muted">{t("home.destination.feedHint")}</span>
            </span>
            {selectedId === null && <Check size={18} aria-hidden className="shrink-0 text-primary" />}
          </button>

          <p className="px-1 pt-2 text-caption font-semibold uppercase tracking-[0.06em] text-text-muted">{t("home.destination.myCommunities")}</p>

          {communities === null && !failed && <p className="px-1 py-4 text-small text-text-muted">{t("common.loading")}</p>}
          {failed && (
            <div className="space-y-2 px-1 py-3">
              <p role="alert" className="text-small text-danger">
                {t("home.destination.loadError")}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                {t("common.retry")}
              </Button>
            </div>
          )}
          {communities?.length === 0 && (
            <div className="space-y-3 rounded-xl border border-dashed border-border px-4 py-5 text-center" data-destination-empty>
              <Users size={20} aria-hidden className="mx-auto text-text-muted" />
              <p className="text-small text-text-muted">{t("home.destination.empty")}</p>
              <Link href="/communities/all" className={buttonClassName({ variant: "outline", size: "sm" })}>
                {t("home.destination.find")}
              </Link>
            </div>
          )}
          {communities?.map((community) => (
            <button
              key={community.id}
              type="button"
              role="option"
              aria-selected={selectedId === community.id}
              onClick={() => onChoose({ kind: "community", community })}
              className={rowClass(selectedId === community.id)}
              data-destination-option={community.id}
            >
              <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-label font-semibold text-text">{community.name}</span>
                <span className="flex items-center gap-1 truncate text-caption text-text-muted">
                  {community.visibility !== "public" && <Lock size={11} aria-hidden className="shrink-0" />}
                  {communityHint(community, t)}
                </span>
              </span>
              {selectedId === community.id && <Check size={18} aria-hidden className="shrink-0 text-primary" />}
            </button>
          ))}
        </div>
        <div className="border-t border-border-soft p-3">
          <Button type="button" variant="outline" className="w-full" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
