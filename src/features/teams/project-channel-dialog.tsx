"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldLabelClassName, Input } from "@/components/ui/field";
import { FormError, SubmitButton } from "@/features/spaces/space-forms";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { addProjectChannel, type TeamActionError } from "@/lib/supabase/teams";
import { PillChoice } from "./team-ui";

/**
 * Projeye adlı ek kanal ekle (docs/history/369-*): "duyurular" gibi. Proje ana kanalı projeyle birlikte doğar, dosya kanalı dosya oluştururken sorulur;
 * bu pencere yalnız ek kanal içindir. Yalnız proje lideri açabilir (sunucu yeniden denetler). Ad aynı projede tektir, başka projelerde yeniden kullanılabilir.
 */
export function NewProjectChannelDialog({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: (channelId: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [posting, setPosting] = useState<"members" | "admins">("members");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError(t("th.newChannel.nameRequired"));
    setBusy(true);
    setError(null);
    try {
      onCreated(await addProjectChannel(projectId, { name: name.trim(), description: description.trim(), posting }));
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };

  return (
    <SpaceDialog
      title={t("th.newChannel.title")}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void submit(event)}
      formTestId="team-new-project-channel-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{t("th.newChannel.create")}</SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="project-channel-name" className={fieldLabelClassName}>
            {t("th.newChannel.name")}
          </label>
          <Input
            id="project-channel-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            placeholder={t("th.newChannel.namePlaceholder")}
            autoComplete="off"
          />
          <p className="mt-1 text-caption text-text-muted">{t("th.newChannel.nameHint")}</p>
        </div>
        <div>
          <label htmlFor="project-channel-desc" className={fieldLabelClassName}>
            {t("th.newChannel.description")}
          </label>
          <Input id="project-channel-desc" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} />
        </div>
        <div>
          <span className={fieldLabelClassName}>{t("th.newChannel.posting")}</span>
          <PillChoice<"members" | "admins">
            ariaLabel={t("th.newChannel.posting")}
            value={posting}
            onChange={setPosting}
            options={[
              { key: "members", label: t("th.newChannel.postingAll") },
              { key: "admins", label: t("th.newChannel.postingLeads") },
            ]}
          />
        </div>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}
