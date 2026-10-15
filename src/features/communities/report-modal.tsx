"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { fieldControlClassName, fieldLabelClassName } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { reportCommunityContent } from "@/lib/supabase/communities";
import { COMMUNITY_REPORT_REASON_MAX, COMMUNITY_REPORT_REASON_MIN } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Topluluk içi rapor (gönderi ya da mesaj): neden zorunlu (3–300 karakter); yinelenen açık rapor sunucuda engellenir. Site moderasyonundan ayrıdır. */
export function ReportModal({ communityId, kind, targetId, onClose, onReported }: { communityId: string; kind: "post" | "message"; targetId: string; onClose: () => void; onReported: () => void }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAsyncAction();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const length = [...reason.trim()].length;
  const valid = length >= COMMUNITY_REPORT_REASON_MIN && length <= COMMUNITY_REPORT_REASON_MAX;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const ok = await run(async () => {
      await reportCommunityContent(communityId, kind, targetId, reason);
      return true;
    });
    if (ok) onReported();
  }

  return (
    <Modal onClose={busy ? () => undefined : onClose} labelledBy="community-report-title">
      <form onSubmit={submit} noValidate className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="space-y-1">
          <h2 id="community-report-title" className="text-base font-semibold text-text">
            {kind === "post" ? t("communities.report.postTitle") : t("communities.report.messageTitle")}
          </h2>
          <p className="text-small text-text-muted">{t("communities.report.help")}</p>
        </div>
        <div>
          <label htmlFor="community-report-reason" className={fieldLabelClassName}>
            {t("communities.report.reasonLabel")}
          </label>
          <textarea id="community-report-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} disabled={busy} aria-invalid={touched && !valid} className={`${fieldControlClassName} resize-none py-2.5`} />
          <p className={touched && !valid ? "mt-1 text-caption text-danger" : "mt-1 text-caption text-text-muted"}>
            {touched && !valid ? t("communities.report.reasonInvalid", { min: COMMUNITY_REPORT_REASON_MIN, max: COMMUNITY_REPORT_REASON_MAX }) : `${length}/${COMMUNITY_REPORT_REASON_MAX}`}
          </p>
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? t("common.loading") : t("communities.report.submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
