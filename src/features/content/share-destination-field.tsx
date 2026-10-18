"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Globe, Lock, Users } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { useCommunity } from "@/features/communities/use-community";
import { pickCreateDestination, resetCreateDestination, useCommunityContext, type CreateDestination } from "@/features/communities/community-return";
import { listMyCommunities, type CommunitySummary } from "@/lib/supabase/communities";
import { canSharePost } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import { FormSection } from "./form-section";

const PAGE_LIMIT = 4;

/**
 * Seçilen hedefin gerçek gönderi kuralı (yalnız yöneticiler mi paylaşır, topluluk kapatılmış mı): üye olarak okunur ki "Paylaş"
 * düğmesi reddedilecek bir isteğe götürmesin. Yetki yine sunucuda (RPC/RLS) uygulanır. `null` = engel yok (ya da henüz bilinmiyor).
 */
export function useDestinationBlock(communityId: string | null): TranslationKey | null {
  const { user } = useAuth();
  const { state } = useCommunity(communityId, user?.id ?? null);
  if (!communityId || state.status !== "ready") return null;
  if (state.group.closedAt) return "communities.detail.closedNotice";
  return canSharePost(state.group.myRole, state.group.feedPolicy, false) ? null : "communities.feed.policyStaff";
}

/**
 * Oluşturma ekranlarının paylaşım alanındaki "Nerede paylaşmak istiyorsun?" seçicisi (docs/history/197-*): varsayılan "Genel akış";
 * dokununca üye olunan topluluklar listelenir, seçilen topluluğun adı ve logosu görünür. Seçim formun içeriğini DEĞİŞTİRMEZ — yalnızca
 * hedefi belirler (topluluk seçilince içerik topluluğa özgü oluşur, görünürlük/taslak yoktur; Genel akış'ta eski davranış).
 */
export function ShareDestinationField({ blockedReason, disabled = false }: { blockedReason: TranslationKey | null; disabled?: boolean }) {
  const { t } = useTranslation();
  const community = useCommunityContext();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerButton = useRef<HTMLButtonElement>(null);

  // Ekrandan çıkınca seçim atılır; sonraki oluşturma ekranı adres parametresinden başlar.
  useEffect(() => () => resetCreateDestination(), []);

  const destination: CreateDestination | null = community.communityId
    ? { id: community.communityId, name: community.name ?? "", avatarUrl: community.avatarUrl, visibility: community.visibility ?? "public" }
    : null;

  function choose(next: CreateDestination | null) {
    pickCreateDestination(next);
    setPickerOpen(false);
    pickerButton.current?.focus();
  }

  return (
    <FormSection>
      <div data-share-destination-field>
        <p id="share-destination-label" className="mb-1.5 text-label font-semibold text-text">
          {t("home.destination.label")}
        </p>
        <button
          ref={pickerButton}
          type="button"
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-labelledby="share-destination-label share-destination-value"
          data-share-destination={destination?.id ?? "feed"}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border-soft bg-background px-3 py-2 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          <DestinationIcon destination={destination} size={32} />
          <span id="share-destination-value" className="min-w-0 flex-1">
            <span className="block truncate text-label font-semibold text-text">{destination ? destination.name || t("common.loading") : t("home.destination.feed")}</span>
            <span className="block truncate text-caption text-text-muted">{destination ? communityHint(destination, t) : t("home.destination.feedHint")}</span>
          </span>
          <ChevronDown size={18} aria-hidden className="shrink-0 text-text-muted" />
        </button>
        {blockedReason && (
          <p role="status" data-share-blocked className="mt-2 text-caption text-text-muted">
            {t(blockedReason)}
          </p>
        )}
      </div>
      {pickerOpen && <DestinationPicker selectedId={destination?.id ?? null} onChoose={choose} onClose={() => setPickerOpen(false)} />}
    </FormSection>
  );
}

function communityHint(community: { visibility: CommunitySummary["visibility"] }, t: ReturnType<typeof useTranslation>["t"]): string {
  return community.visibility === "public" ? t("home.destination.communityPublic") : t("home.destination.communityMembers");
}

function DestinationIcon({ destination, size }: { destination: CreateDestination | null; size: number }) {
  if (destination) return <GroupAvatar name={destination.name} avatarUrl={destination.avatarUrl} size={size} />;
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-primary-soft text-primary" style={{ width: size, height: size }}>
      <Globe size={Math.round(size * 0.55)} strokeWidth={1.9} />
    </span>
  );
}

/** The target list: "Genel akış" first, then the viewer's communities (a bottom sheet on phones, a centred card on larger screens — the shared `Modal`). */
function DestinationPicker({ selectedId, onChoose, onClose }: { selectedId: string | null; onChoose: (next: CreateDestination | null) => void; onClose: () => void }) {
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
          <button type="button" role="option" aria-selected={selectedId === null} onClick={() => onChoose(null)} className={rowClass(selectedId === null)} data-destination-option="feed">
            <DestinationIcon destination={null} size={36} />
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
              onClick={() => onChoose({ id: community.id, name: community.name, avatarUrl: community.avatarUrl, visibility: community.visibility })}
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
