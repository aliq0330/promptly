"use client";

import { useState } from "react";
import { Loader2 } from "@/components/icons/loader-2";
import { Button } from "@/components/ui/button";
import { Input, fieldLabelClassName } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { inviteCollectionMember } from "@/lib/supabase/collection-members";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Ortak davet et (docs/history/386-*): yalnız kullanıcı adıyla, yalnız sahip. Davet kabul edilene kadar özel koleksiyon kişiye görünmez. */
export function CollectionInviteModal({ collectionId, onClose, onInvited }: { collectionId: string; onClose: () => void; onInvited: () => void }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = username.trim().replace(/^@/, "");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      await inviteCollectionMember(collectionId, clean);
      onInvited();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("common.actionFailedRetry"));
      setBusy(false);
    }
  }

  return (
    <SpaceDialog
      title={t("collab.inviteTitle")}
      onClose={onClose}
      busy={busy}
      overLayers
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!clean || busy} data-collection-invite-send="">
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t("collab.inviteSend")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="collab-username" className={fieldLabelClassName}>
            {t("collab.usernameLabel")}
          </label>
          <Input
            id="collab-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={t("collab.usernamePlaceholder")}
            maxLength={40}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            invalid={Boolean(error)}
          />
        </div>
        <p className="text-caption text-text-muted">{t("collab.inviteHint")}</p>
        {error && <InlineAlert>{error}</InlineAlert>}
      </div>
    </SpaceDialog>
  );
}
