"use client";

import { useState } from "react";
import { LogOut } from "@/components/icons/log-out";
import { Plus } from "@/components/icons/plus";
import { UserMinus } from "@/components/icons/user-minus";
import { Users } from "@/components/icons/users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PersonRow } from "@/components/ui/person-row";
import { Skeleton } from "@/components/ui/skeleton";
import { CollectionInviteModal } from "./collection-invite-modal";
import { RemoveMemberDialog } from "./collection-remove-member-dialog";
import { COLLECTION_MEMBER_LIMIT, canLeaveCollection, canManageCollection, hasInviteRoom, type CollectionRole } from "@/lib/collection-permissions";
import { revokeCollectionInvitation, type CollectionMember } from "@/lib/supabase/collection-members";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Collection } from "@/types";

/**
 * Ortaklar sekmesi (docs/history/386-*): sahip + ortaklar, sahip için bekleyen davetler. Yönetim yalnız sahipte (davet, çıkarma, davet geri çekme);
 * ortak yalnız kendi satırında "Ortaklıktan ayrıl" görür. Liste `collection_members_list` RPC'sindendir (üyelik satırlarına doğrudan okuma yok).
 */
export function CollectionMembersTab({
  collection,
  members,
  failed,
  role,
  userId,
  onChanged,
  onLeft,
}: {
  collection: Collection;
  /** null = yükleniyor. */
  members: CollectionMember[] | null;
  failed: boolean;
  role: CollectionRole;
  userId: string | null | undefined;
  /** Liste değişti (davet, çıkarma, geri çekme): sayfa ortakları ve sayıları yeniden okur. */
  onChanged: () => void;
  /** Ortak koleksiyondan ayrıldı: sayfa koleksiyonu kapatır. */
  onLeft: () => void;
}) {
  const { t, language } = useTranslation();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<CollectionMember | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const isOwner = canManageCollection(role);

  if (failed) return <InlineAlert>{t("collab.partnersLoadFailed")}</InlineAlert>;
  if (!members) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  const people = members.filter((member) => member.role !== "invited");
  const pending = members.filter((member) => member.role === "invited");
  const partners = people.filter((member) => member.role === "member");
  const room = hasInviteRoom(partners.length, pending.length);

  async function revoke(member: CollectionMember) {
    if (!member.invitationId || revoking) return;
    setRevoking(member.invitationId);
    setError(null);
    try {
      await revokeCollectionInvitation(member.invitationId);
      onChanged();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("common.actionFailedRetry"));
    } finally {
      setRevoking(null);
    }
  }

  return (
    <section aria-labelledby="collab-partners-heading" data-collection-members="" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="collab-partners-heading" className="text-h3 font-bold text-text">
          {t("collab.partnersTitle")}
        </h2>
        <Badge className="tabular-nums">{t("collab.partnersCount", { count: people.length + pending.length, max: COLLECTION_MEMBER_LIMIT + 1 })}</Badge>
        {isOwner && (
          <Button type="button" size="sm" className="ml-auto" onClick={() => setInviting(true)} disabled={!room} data-collection-invite-open="">
            <Plus size={16} aria-hidden />
            {t("collab.invite")}
          </Button>
        )}
      </div>
      <p className="text-caption text-text-muted">{t("collab.partnersHint")}</p>
      {error && <InlineAlert>{error}</InlineAlert>}

      <ul className="divide-y divide-border-soft rounded-lg border border-border-soft bg-surface px-3">
        {people.map((member) => {
          const isSelf = member.userId === userId;
          return (
            <li key={member.userId}>
              <PersonRow
                name={member.displayName}
                username={member.username}
                avatarUrl={member.avatarUrl}
                href={profileHref(member)}
                nameSuffix={isSelf ? <span className="font-normal text-text-muted"> · {t("collab.you")}</span> : undefined}
                sub={
                  <>
                    @{member.username} · {member.itemCount > 0 ? t("collab.addedItems", { count: member.itemCount }) : t("collab.addedItemsNone")}
                  </>
                }
                data-collection-member={member.username}
                right={
                  member.role === "owner" ? (
                    <Badge variant="success">{t("collab.roleOwner")}</Badge>
                  ) : isOwner ? (
                    <Button type="button" variant="ghost" size="icon" aria-label={`${t("collab.removeMember")}: ${member.displayName}`} onClick={() => setRemoving(member)} data-collection-member-remove="">
                      <UserMinus size={18} aria-hidden />
                    </Button>
                  ) : isSelf && canLeaveCollection(role) ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setRemoving(member)} data-collection-leave="">
                      <LogOut size={16} aria-hidden />
                      {t("collab.leave")}
                    </Button>
                  ) : undefined
                }
              />
            </li>
          );
        })}
      </ul>

      {partners.length === 0 && pending.length === 0 && isOwner && (
        <EmptyState icon={Users} title={t("collab.noPartnersYet")} description={t("collab.inviteHint")} className="border-0" />
      )}

      {pending.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("collab.pendingTitle")}</h3>
          <ul className="divide-y divide-border-soft rounded-lg border border-border-soft bg-surface px-3">
            {pending.map((member) => (
              <li key={member.invitationId ?? member.userId}>
                <PersonRow
                  name={member.displayName}
                  username={member.username}
                  avatarUrl={member.avatarUrl}
                  href={profileHref(member)}
                  sub={<>@{member.username} · {formatRelativeTime(member.since, language)}</>}
                  data-collection-pending={member.username}
                  right={
                    <>
                      <Badge variant="warning">{t("collab.pending")}</Badge>
                      <Button type="button" variant="outline" size="sm" onClick={() => void revoke(member)} disabled={revoking === member.invitationId} data-collection-revoke="">
                        {t("collab.revokeInvite")}
                      </Button>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {inviting && (
        <CollectionInviteModal
          collectionId={collection.id}
          onClose={() => setInviting(false)}
          onInvited={() => {
            setInviting(false);
            onChanged();
          }}
        />
      )}
      {removing && (
        <RemoveMemberDialog
          collectionId={collection.id}
          member={removing}
          self={removing.userId === userId}
          onClose={() => setRemoving(null)}
          onDone={() => {
            const self = removing.userId === userId;
            setRemoving(null);
            if (self) onLeft();
            else onChanged();
          }}
        />
      )}
    </section>
  );
}
