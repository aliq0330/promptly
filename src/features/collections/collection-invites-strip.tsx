"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { fetchMyCollectionInvitations, respondCollectionInvitation, type CollectionInvitation } from "@/lib/supabase/collection-members";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Ortak koleksiyon davetleri (docs/history/386-*): `/saved`'ın üstünde tek satırlık kartlar (Spaces'teki davet kartı kalıbı). Davetli, kabul edene kadar
 * özel koleksiyonu göremez, bu yüzden davet bildirimi koleksiyon sayfasına değil buraya (`/saved?invites=1`) gelir. Davet yoksa hiç çizilmez.
 */
export function CollectionInvitesStrip({ onJoined }: { onJoined: () => void }) {
  const { t } = useTranslation();
  const [invites, setInvites] = useState<CollectionInvitation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyCollectionInvitations().then((list) => !cancelled && setInvites(list));
    return () => {
      cancelled = true;
    };
  }, []);

  async function answer(invite: CollectionInvitation, accept: boolean) {
    if (busy) return;
    setBusy(invite.id);
    setError(null);
    try {
      await respondCollectionInvitation(invite.id, accept);
      setInvites((prev) => prev.filter((item) => item.id !== invite.id));
      if (accept) onJoined();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("collab.respondFailed"));
    } finally {
      setBusy(null);
    }
  }

  if (invites.length === 0 && !error) return null;
  return (
    <section aria-label={t("collab.invitesAria")} data-collection-invites="" className="space-y-2">
      {invites.map((invite) => (
        <div key={invite.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-primary-soft p-3" data-collection-invite={invite.collectionId}>
          <Avatar src={invite.owner.avatarUrl} alt="" size={40} />
          <p className="min-w-0 flex-1 text-small text-text">{t("collab.inviteStrip", { name: invite.owner.displayName, collection: invite.collectionName })}</p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" size="sm" onClick={() => void answer(invite, true)} disabled={busy === invite.id} data-collection-invite-accept="">
              {t("collab.accept")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void answer(invite, false)} disabled={busy === invite.id} data-collection-invite-decline="">
              {t("collab.decline")}
            </Button>
          </div>
        </div>
      ))}
      {error && <InlineAlert>{error}</InlineAlert>}
    </section>
  );
}
